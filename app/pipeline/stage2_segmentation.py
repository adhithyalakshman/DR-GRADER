"""Stage 2 — Retinal structure segmentation.

Runs three branches (as per DR_Stage2_Segmentation.ipynb):
  A. Lesions (MA, EX, HE, CWS)  — HF Hub direct load (smp UNet, tu-seresnext50_32x4d)
  B. OD + Fovea/Macula           — HF Hub direct load (smp UNet, tu-seresnet50)
  C. Vessels                     — Frangi classical pipeline (guaranteed fallback)

NOTE: Branches A and B intentionally do NOT call fundus_lesions_toolkit.models.segment()
or fundus_odmac_toolkit.models.detect() — both are broken (dead auto-download link / a
crashing autocrop_fundus() call on current OpenCV versions). Instead, per the working
notebook pipeline, weights are pulled directly from Hugging Face Hub and loaded into a
plain segmentation_models_pytorch (smp) U-Net with a timm ("tu-") encoder. This mirrors
DR_Stage2_Segmentation.ipynb cells 9 and 11 exactly.

All masks registered to STAGE2_CANONICAL_SIZE × STAGE2_CANONICAL_SIZE.
Results: lesion_masks (dict of 4 binary masks), od_mask, macula_point, vessel_mask,
         plus structured features for Stage 3 fusion and overlay images for the frontend.
"""
from __future__ import annotations

import json
import logging
import warnings
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file as load_safetensors
import segmentation_models_pytorch as smp
from skimage import exposure, filters, morphology
from skimage.transform import resize as sk_resize
from skimage.measure import label, regionprops
from skimage.segmentation import find_boundaries

from app.config import STAGE2_CANONICAL_SIZE, LESION_DESCRIPTIONS
from app.utils.image_utils import encode_image_b64

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

LESION_KEYS = list(LESION_DESCRIPTIONS.keys())   # ["MA", "EX", "HE", "CWS"]

# Overlay colors (RGB) matching the notebook
_LESION_COLORS_RGB = {
    "CWS": (236, 166, 63),
    "EX":  (140, 241, 142),
    "HE":  (68,  152, 240),
    "MA":  (220, 20,  60),
}
_VESSEL_COLOR_RGB = (255, 80, 80)

_DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ──────────────────────────────────────────────────────────────
# HF Hub model config (per notebook cells 9 & 11)
# ──────────────────────────────────────────────────────────────
LESION_HF_REPO = "ClementP/fundus-lesions-segmentation-unet_seresnext50_32x4d"
ODMAC_HF_REPO  = "ClementP/fundus-odmac-segmentation-unet-seresnet50"

# Notebook's LESIONS = ["BG", "CTW", "EX", "HE", "MA"]; CTW (cotton-wool spot) == our CWS
_NOTEBOOK_LESION_ORDER = ["CTW", "EX", "HE", "MA"]
_NOTEBOOK_TO_APP_KEY = {"CTW": "CWS", "EX": "EX", "HE": "HE", "MA": "MA"}

# smp classic-encoder spelling -> timm's actual model name (differ for the SE- family)
_TIMM_NAME_OVERRIDES = {
    "se_resnext50_32x4d": "seresnext50_32x4d",
    "se_resnext101_32x4d": "seresnext101_32x4d",
    "se_resnet50": "seresnet50",
    "se_resnet101": "seresnet101",
    "se_resnet152": "seresnet152",
}
# Reverse mapping — needed only to look up ImageNet preprocessing stats (smp only
# recognizes its own "classic" spelling for get_preprocessing_fn), never for the model itself.
_SMP_CLASSIC_PREPROCESS_OVERRIDES = {v: k for k, v in _TIMM_NAME_OVERRIDES.items()}

# Module-level cache: weights are downloaded & loaded once per process, not per-request
_lesion_model: Optional[torch.nn.Module] = None
_odmac_model: Optional[torch.nn.Module] = None


# ──────────────────────────────────────────────────────────────
# Helper: resize to canonical frame
# ──────────────────────────────────────────────────────────────
def _to_canon(arr: np.ndarray, is_mask: bool = True) -> np.ndarray:
    S = STAGE2_CANONICAL_SIZE
    order = 0 if is_mask else 1
    out = sk_resize(arr.astype(np.float32), (S, S),
                    order=order, preserve_range=True, anti_aliasing=not is_mask)
    if is_mask:
        return (out > 0.5).astype(np.uint8)
    return out.astype(np.uint8)


# ──────────────────────────────────────────────────────────────
# HF Hub loading helpers (shared by lesion + OD/macula branches)
# ──────────────────────────────────────────────────────────────
def _strip_prefix(state_dict: dict, prefix: str = "model.") -> dict:
    """These HF checkpoints were saved from a wrapper class, so every key has a
    'model.' prefix that must be stripped before loading into a bare smp model."""
    if all(k.startswith(prefix) for k in state_dict):
        return {k[len(prefix):]: v for k, v in state_dict.items()}
    return state_dict


def _autocrop_fundus_simple(img_rgb: np.ndarray, threshold: int = 10):
    """Crop to the fundus circle (drop black borders) before resizing to model input size."""
    gray = img_rgb.astype(np.int32).sum(axis=2)
    mask = gray > threshold
    if not mask.any():
        H, W = img_rgb.shape[:2]
        return img_rgb, (0, H, 0, W)
    ys, xs = np.nonzero(mask)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    return img_rgb[y0:y1, x0:x1], (y0, y1, x0, x1)


def _load_smp_model_from_hf(
    repo_id: str,
    device: torch.device,
    arch: str = "unet",
    encoder_name: str = "se_resnext50_32x4d",
    in_channels: int = 3,
    num_classes: int = 5,
) -> torch.nn.Module:
    """Download a checkpoint from Hugging Face Hub and load it into a plain smp model.

    These checkpoints use a *timm* encoder (flat conv1/bn1 stem, "se.fc1/fc2" naming)
    rather than smp's classic pretrainedmodels-style encoder, and timm's spelling for
    the SE-ResNeXt/ResNet family differs from smp's classic spelling (no underscore
    after "se") — hence the _TIMM_NAME_OVERRIDES table.
    """
    config_path = hf_hub_download(repo_id, filename="config.json")
    weights_path = hf_hub_download(repo_id, filename="model.safetensors")
    with open(config_path) as f:
        json.load(f)  # validated but not otherwise consumed

    raw_state_dict = load_safetensors(weights_path)
    state_dict = _strip_prefix(raw_state_dict, "model.")

    timm_base_name = _TIMM_NAME_OVERRIDES.get(encoder_name, encoder_name)
    tu_encoder_name = f"tu-{timm_base_name}"

    model = smp.create_model(
        arch=arch, encoder_name=tu_encoder_name,
        in_channels=in_channels, classes=num_classes,
    )

    missing, unexpected = model.load_state_dict(state_dict, strict=False)
    logger.info(
        f"[Stage2-HF] {repo_id} loaded with encoder_name={tu_encoder_name!r} — "
        f"missing={len(missing)}, unexpected={len(unexpected)}"
    )
    if len(missing) > 5 or len(unexpected) > 5:
        raise RuntimeError(
            f"Weights for {repo_id} did not line up with encoder_name={tu_encoder_name!r} "
            f"({len(missing)} missing / {len(unexpected)} unexpected) — not safe to run inference."
        )
    return model.to(device).eval()


def _run_smp_inference(
    model: torch.nn.Module,
    image_rgb: np.ndarray,
    device: torch.device,
    size: int,
    num_classes: int,
    encoder_for_preprocess: str,
) -> np.ndarray:
    """Autocrop -> resize -> normalize -> forward pass -> un-crop back to native resolution.
    Returns per-class probability maps at the image's native resolution: (C, H0, W0).
    """
    smp_classic_name = _SMP_CLASSIC_PREPROCESS_OVERRIDES.get(
        encoder_for_preprocess, encoder_for_preprocess
    )
    preprocess_fn = smp.encoders.get_preprocessing_fn(smp_classic_name, pretrained="imagenet")

    H0, W0 = image_rgb.shape[:2]
    cropped, (y0, y1, x0, x1) = _autocrop_fundus_simple(image_rgb)
    Hc, Wc = cropped.shape[:2]

    img_r = sk_resize(cropped, (size, size), order=1, preserve_range=True, anti_aliasing=True)
    img_n = preprocess_fn(img_r.astype(np.float32))
    x = torch.from_numpy(img_n.transpose(2, 0, 1)).unsqueeze(0).float().to(device)

    with torch.no_grad():
        probs_crop_model_res = torch.softmax(model(x), dim=1)[0].cpu().numpy()  # (C, size, size)

    probs_crop = np.stack([
        sk_resize(probs_crop_model_res[c], (Hc, Wc), order=1, preserve_range=True, anti_aliasing=True)
        for c in range(num_classes)
    ])
    probs_full = np.zeros((num_classes, H0, W0), dtype=np.float32)
    probs_full[0] = 1.0  # default to background outside the crop region
    probs_full[:, y0:y1, x0:x1] = probs_crop
    return probs_full


# ──────────────────────────────────────────────────────────────
# Branch A — Lesion segmentation
# ──────────────────────────────────────────────────────────────
def _run_lesion_branch(img_rgb: np.ndarray) -> Dict[str, np.ndarray]:
    """Returns {"MA": binary_mask, "EX": ..., "HE": ..., "CWS": ...} at canonical size."""
    global _lesion_model
    S = STAGE2_CANONICAL_SIZE
    try:
        logger.info("[Stage2-Lesion] Running HF lesion model")
        if _lesion_model is None:
            _lesion_model = _load_smp_model_from_hf(
                LESION_HF_REPO, _DEVICE, arch="unet",
                encoder_name="se_resnext50_32x4d", num_classes=5,
            )

        probs = _run_smp_inference(
            _lesion_model, img_rgb, _DEVICE, size=512, num_classes=5,
            encoder_for_preprocess="se_resnext50_32x4d",
        )  # (5, H, W): [BG, CTW, EX, HE, MA]

        argmax = probs.argmax(axis=0)

        masks: Dict[str, np.ndarray] = {}
        for i, nb_key in enumerate(_NOTEBOOK_LESION_ORDER, start=1):
            app_key = _NOTEBOOK_TO_APP_KEY[nb_key]
            masks[app_key] = _to_canon((argmax == i).astype(np.uint8), is_mask=True)

        # Fill any lesion key that wasn't in the notebook's channel set (defensive)
        for key in LESION_KEYS:
            if key not in masks:
                masks[key] = np.zeros((S, S), dtype=np.uint8)

        found = {k: int(v.sum()) for k, v in masks.items() if v.sum() > 0}
        logger.info(f"[Stage2-Lesion] Found lesions: {found if found else 'none'}")
        return masks

    except Exception as e:
        logger.warning(f"[Stage2-Lesion] HF model failed ({e}), using empty masks")
        return {k: np.zeros((S, S), dtype=np.uint8) for k in LESION_KEYS}


# ──────────────────────────────────────────────────────────────
# Branch B — OD + Fovea/Macula
# ──────────────────────────────────────────────────────────────
def _run_od_branch(img_rgb: np.ndarray) -> Tuple[np.ndarray, Optional[Tuple[int, int]]]:
    """
    Returns (od_mask at canonical size, macula_point or None).
    macula_point: (row, col) pixel coordinates in canonical frame.
    """
    global _odmac_model
    S = STAGE2_CANONICAL_SIZE

    try:
        logger.info("[Stage2-OD] Running HF od/macula model")
        if _odmac_model is None:
            _odmac_model = _load_smp_model_from_hf(
                ODMAC_HF_REPO, _DEVICE, arch="unet",
                encoder_name="seresnet50", num_classes=3,
            )

        probs = _run_smp_inference(
            _odmac_model, img_rgb, _DEVICE, size=512, num_classes=3,
            encoder_for_preprocess="seresnet50",
        )  # (3, H, W): [BG, OD, Macula]

        argmax = probs.argmax(axis=0)
        od_mask_native = (argmax == 1)
        macula_mask_native = (argmax == 2)
        macula_prob = probs[2]

        od_mask = _to_canon(od_mask_native.astype(np.uint8), is_mask=True)

        H0, W0 = img_rgb.shape[:2]
        if macula_mask_native.sum() > 0:
            ys, xs = np.nonzero(macula_mask_native)
            weights = macula_prob[ys, xs]
            mr, mc = np.average(ys, weights=weights), np.average(xs, weights=weights)
        else:
            mr, mc = np.unravel_index(np.argmax(macula_prob), macula_prob.shape)

        macula_point = (int(mr / H0 * S), int(mc / W0 * S))  # scale to canonical frame

        logger.info(f"[Stage2-OD] OD detected={od_mask.sum() > 0}, macula={macula_point}")
        return od_mask, macula_point

    except Exception as e:
        logger.warning(f"[Stage2-OD] HF model failed ({e}), using empty OD mask")
        return np.zeros((S, S), dtype=np.uint8), None


# ──────────────────────────────────────────────────────────────
# Branch C — Vessel segmentation (Frangi, guaranteed no-download)
# ──────────────────────────────────────────────────────────────
def _classical_vessel_segmentation(img_rgb: np.ndarray) -> np.ndarray:
    """
    Dependency-free CLAHE + multi-scale Frangi vesselness.
    Matches the notebook's implementation. Always succeeds.
    Returns binary vessel mask at original resolution.
    """
    # FOV detection
    gray_sum = img_rgb.sum(axis=2).astype(np.float32)
    fov = gray_sum > (0.06 * 255 * 3)
    fov = morphology.erosion(fov, morphology.disk(max(3, int(0.01 * min(img_rgb.shape[:2])))))
    fov = morphology.remove_small_objects(fov, min_size=int(0.001 * fov.size))

    # Green channel (best vessel contrast)
    green = img_rgb[:, :, 1].astype(np.float32) / 255.0
    green_masked = green * fov
    green_eq = exposure.equalize_adapthist(green_masked, clip_limit=0.01)
    inv = 1.0 - green_eq

    # Multi-scale Frangi vesselness
    vesselness = filters.frangi(inv, sigmas=np.arange(1, 5, 0.5), black_ridges=False)
    vesselness[~fov] = 0

    # Otsu thresholding
    vals = vesselness[fov]
    if vals.max() > 0:
        thr = filters.threshold_otsu(vals)
    else:
        thr = 0.5

    mask = (vesselness > thr * 0.6) & fov
    mask = morphology.remove_small_objects(mask, min_size=max(20, int(0.00002 * fov.size)))
    mask = morphology.binary_closing(mask, morphology.disk(2))
    return mask


def _run_vessel_branch(img_rgb: np.ndarray) -> np.ndarray:
    """
    Classical Frangi vesselness filter — no model download required.
    Returns binary vessel mask at canonical size.
    """
    try:
        logger.info("[Stage2-Vessel] Running classical Frangi vesselness (notebook pipeline)")
        vessel_mask = _classical_vessel_segmentation(img_rgb)
        result = _to_canon(vessel_mask.astype(np.uint8), is_mask=True)
        logger.info(f"[Stage2-Vessel] Vessel pixels: {int(result.sum())} "
                    f"({100 * result.mean():.2f}% of canonical frame)")
        return result

    except Exception as e:
        logger.warning(f"[Stage2-Vessel] Frangi failed ({e})")
        S = STAGE2_CANONICAL_SIZE
        return np.zeros((S, S), dtype=np.uint8)


# ──────────────────────────────────────────────────────────────
# Structured feature extraction (per notebook Cell 9)
# ──────────────────────────────────────────────────────────────
def _compute_lesion_features(
    lesion_masks: Dict[str, np.ndarray],
    macula_point: Optional[Tuple[int, int]],
) -> Tuple[Dict[str, int], Dict[str, int], Dict[str, Optional[float]]]:
    """
    Compute per-lesion-class structured features:
      - pixel counts
      - connected component counts
      - nearest component distance to macula

    Returns (lesion_counts, lesion_components, lesion_nearest_macula).
    """
    lesion_counts = {}
    lesion_components = {}
    lesion_nearest_macula = {}

    macula_xy = np.array(macula_point) if macula_point else None

    for key in LESION_KEYS:
        mask = lesion_masks.get(key)
        if mask is None:
            lesion_counts[key] = 0
            lesion_components[key] = 0
            lesion_nearest_macula[key] = None
            continue

        px_count = int(mask.sum())
        lesion_counts[key] = px_count

        lbl = label(mask)
        n_components = int(lbl.max())
        lesion_components[key] = n_components

        if n_components > 0 and macula_xy is not None:
            centroids = np.array([p.centroid for p in regionprops(lbl)])
            dist = float(np.min(np.sqrt(((centroids - macula_xy) ** 2).sum(axis=1))))
            lesion_nearest_macula[key] = round(dist, 1)
        else:
            lesion_nearest_macula[key] = None

    return lesion_counts, lesion_components, lesion_nearest_macula


def _compute_vessel_density_quadrants(vessel_mask: np.ndarray) -> Dict[str, float]:
    """Compute vessel density fraction for each quadrant of the canonical mask."""
    S = STAGE2_CANONICAL_SIZE
    cy, cx = S // 2, S // 2
    return {
        "TL": round(float(vessel_mask[:cy, :cx].mean()), 4),
        "TR": round(float(vessel_mask[:cy, cx:].mean()), 4),
        "BL": round(float(vessel_mask[cy:, :cx].mean()), 4),
        "BR": round(float(vessel_mask[cy:, cx:].mean()), 4),
    }


# ──────────────────────────────────────────────────────────────
# Segmentation overlay image generation
# ──────────────────────────────────────────────────────────────
def _generate_segmentation_overlays(
    canonical_img: np.ndarray,
    lesion_masks: Dict[str, np.ndarray],
    od_mask: np.ndarray,
    macula_point: Optional[Tuple[int, int]],
    vessel_mask: np.ndarray,
) -> Dict[str, str]:
    """Generate individual and fused overlay images as base64 data URIs."""
    overlays = {}

    # Vessel overlay
    vessel_ov = canonical_img.astype(float).copy()
    alpha_v = 0.55
    color_v = np.array(_VESSEL_COLOR_RGB)
    vessel_ov[vessel_mask > 0] = ((1 - alpha_v) * vessel_ov[vessel_mask > 0]
                                   + alpha_v * color_v)
    overlays["vessel_overlay"] = encode_image_b64(np.clip(vessel_ov, 0, 255).astype(np.uint8))

    # OD + Macula overlay
    od_ov = canonical_img.copy()
    if od_mask.sum() > 0:
        od_boundary = find_boundaries(od_mask, mode="outer")
        od_ov[od_boundary] = [0, 255, 255]  # cyan boundary
    if macula_point is not None:
        r, c = macula_point
        # Draw cross marker
        for dr in range(-10, 11):
            for dc in [-2, -1, 0, 1, 2]:
                rr, cc = r + dr, c + dc
                if 0 <= rr < od_ov.shape[0] and 0 <= cc < od_ov.shape[1]:
                    od_ov[rr, cc] = [255, 255, 0]
                rr2, cc2 = r + dc, c + dr
                if 0 <= rr2 < od_ov.shape[0] and 0 <= cc2 < od_ov.shape[1]:
                    od_ov[rr2, cc2] = [255, 255, 0]
    overlays["od_overlay"] = encode_image_b64(od_ov)

    # Individual lesion overlays
    for key in LESION_KEYS:
        mask = lesion_masks.get(key)
        if mask is not None and mask.sum() > 0:
            les_ov = canonical_img.astype(float).copy()
            color = np.array(_LESION_COLORS_RGB.get(key, (255, 0, 0)))
            alpha_l = 0.8
            les_ov[mask > 0] = (1 - alpha_l) * les_ov[mask > 0] + alpha_l * color
            overlays[f"lesion_{key.lower()}_overlay"] = encode_image_b64(
                np.clip(les_ov, 0, 255).astype(np.uint8)
            )

    # Fused segmentation overlay (all layers)
    fused = canonical_img.astype(float).copy()

    # 1) Vessels — thin, low opacity
    alpha_vessel = 0.35
    fused[vessel_mask > 0] = ((1 - alpha_vessel) * fused[vessel_mask > 0]
                               + alpha_vessel * color_v)

    # 2) OD boundary
    if od_mask.sum() > 0:
        od_boundary = find_boundaries(od_mask, mode="outer")
        fused[od_boundary] = [0, 255, 255]

    # 3) Lesions — color-coded, highest opacity, drawn last
    alpha_lesion = 0.8
    for key in ["CWS", "EX", "HE", "MA"]:  # draw in order, MA on top
        mask = lesion_masks.get(key)
        if mask is not None and mask.sum() > 0:
            color = np.array(_LESION_COLORS_RGB.get(key, (255, 0, 0)))
            fused[mask > 0] = (1 - alpha_lesion) * fused[mask > 0] + alpha_lesion * color

    fused = np.clip(fused, 0, 255).astype(np.uint8)

    # Draw macula marker on fused
    if macula_point is not None:
        r, c = macula_point
        for dr in range(-10, 11):
            for dc in [-2, -1, 0, 1, 2]:
                rr, cc = r + dr, c + dc
                if 0 <= rr < fused.shape[0] and 0 <= cc < fused.shape[1]:
                    fused[rr, cc] = [255, 255, 0]
                rr2, cc2 = r + dc, c + dr
                if 0 <= rr2 < fused.shape[0] and 0 <= cc2 < fused.shape[1]:
                    fused[rr2, cc2] = [255, 255, 0]

    overlays["fused_segmentation"] = encode_image_b64(fused)

    return overlays


# ──────────────────────────────────────────────────────────────
# Main Stage 2 entry point
# ──────────────────────────────────────────────────────────────
def run_stage2(img_rgb: np.ndarray) -> Dict:
    """
    Run all three segmentation branches on a quality-gated image.

    Args:
        img_rgb: HxWx3 uint8 RGB (already quality-gated and enhanced if Usable).

    Returns:
        {
          "lesion_masks":          {"MA": ndarray, "EX": ..., "HE": ..., "CWS": ...},
          "lesion_counts":         {"MA": int, ...},
          "lesion_components":     {"MA": int, ...},
          "lesion_nearest_macula": {"MA": float|None, ...},
          "od_mask":               ndarray (S×S),
          "od_area_px":            int,
          "macula_point":          (row, col) or None,
          "vessel_mask":           ndarray (S×S),
          "od_detected":           bool,
          "vessel_coverage":       float (0-1),
          "vessel_density_quadrants": {"TL": float, "TR": float, "BL": float, "BR": float},
          "canonical_image":       ndarray (S×S×3),
          "overlay_images":        {"vessel_overlay": str, "od_overlay": str, ...},
        }
    """
    import concurrent.futures

    S = STAGE2_CANONICAL_SIZE

    # Run all three branches in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        f_lesion = ex.submit(_run_lesion_branch, img_rgb)
        f_od     = ex.submit(_run_od_branch,     img_rgb)
        f_vessel = ex.submit(_run_vessel_branch,  img_rgb)

        lesion_masks           = f_lesion.result()
        od_mask, macula_point  = f_od.result()
        vessel_mask            = f_vessel.result()

    # Compute structured features (matching notebook Cell 9)
    lesion_counts, lesion_components, lesion_nearest_macula = _compute_lesion_features(
        lesion_masks, macula_point
    )
    od_detected = bool(od_mask.sum() > 0)
    od_area_px  = int(od_mask.sum())
    vessel_coverage = float(vessel_mask.sum()) / (S * S)
    vessel_density_quadrants = _compute_vessel_density_quadrants(vessel_mask)
    canonical_img = _to_canon(img_rgb, is_mask=False)

    # Generate overlay images for the frontend
    overlay_images = _generate_segmentation_overlays(
        canonical_img, lesion_masks, od_mask, macula_point, vessel_mask
    )

    logger.info(
        f"[Stage2] Done — lesions={lesion_counts} components={lesion_components} "
        f"OD={od_detected} (area={od_area_px}px) vessel={vessel_coverage:.3f} "
        f"quadrants={vessel_density_quadrants}"
    )

    return {
        "lesion_masks":          lesion_masks,
        "lesion_counts":         lesion_counts,
        "lesion_components":     lesion_components,
        "lesion_nearest_macula": lesion_nearest_macula,
        "od_mask":               od_mask,
        "od_area_px":            od_area_px,
        "macula_point":          macula_point,
        "vessel_mask":           vessel_mask,
        "od_detected":           od_detected,
        "vessel_coverage":       vessel_coverage,
        "vessel_density_quadrants": vessel_density_quadrants,
        "canonical_image":       canonical_img,
        "overlay_images":        overlay_images,
    }