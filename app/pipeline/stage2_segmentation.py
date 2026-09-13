"""Stage 2 — Retinal structure segmentation.

Runs three branches (as per DR_Stage2_Segmentation.ipynb):
  A. Lesions (MA, EX, HE, CWS)  — fundus-lesions-toolkit  [pretrained, auto-download]
  B. OD + Fovea/Macula           — fundus-odmac-toolkit    [pretrained, auto-download]
  C. Vessels                     — Frangi classical pipeline (guaranteed fallback)

All masks registered to STAGE2_CANONICAL_SIZE × STAGE2_CANONICAL_SIZE.
Results: lesion_masks (dict of 4 binary masks), od_mask, macula_point, vessel_mask.
"""
from __future__ import annotations

import logging
import warnings
from typing import Dict, Optional, Tuple

import cv2
import numpy as np
from skimage import filters, morphology
from skimage.transform import resize as sk_resize

from app.config import STAGE2_CANONICAL_SIZE, LESION_DESCRIPTIONS

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

LESION_KEYS = list(LESION_DESCRIPTIONS.keys())   # ["MA", "EX", "HE", "CWS"]


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
# Branch A — Lesion segmentation
# ──────────────────────────────────────────────────────────────
def _run_lesion_branch(img_rgb: np.ndarray) -> Dict[str, np.ndarray]:
    """Returns {"MA": binary_mask, "EX": ..., "HE": ..., "CWS": ...} at canonical size."""
    try:
        from fundus_lesions_toolkit.models import segment as lesion_segment
        logger.info("[Stage2-Lesion] Running fundus-lesions-toolkit")

        import torch
        from PIL import Image

        pil_img = Image.fromarray(img_rgb)
        results = lesion_segment(pil_img)

        # The toolkit returns a dict or tensor with keys/channels for each lesion class
        masks = {}
        if isinstance(results, dict):
            key_map = {"ma": "MA", "ex": "EX", "he": "HE", "cws": "CWS",
                       "microaneurysm": "MA", "exudate": "EX",
                       "haemorrhage": "HE", "cotton_wool_spot": "CWS"}
            for k, arr in results.items():
                mapped = key_map.get(k.lower())
                if mapped and isinstance(arr, np.ndarray):
                    masks[mapped] = _to_canon(arr.squeeze() > 0.5, is_mask=True)
                elif mapped and hasattr(arr, "numpy"):
                    masks[mapped] = _to_canon(arr.squeeze().numpy() > 0.5, is_mask=True)
        elif hasattr(results, "shape"):
            # tensor (B, C, H, W) with C=4 channels: MA, EX, HE, CWS
            arr = results.squeeze(0)
            if hasattr(arr, "numpy"):
                arr = arr.numpy()
            for i, key in enumerate(LESION_KEYS):
                if i < arr.shape[0]:
                    masks[key] = _to_canon(arr[i] > 0.5, is_mask=True)

        # Fill missing lesion keys with empty masks
        S = STAGE2_CANONICAL_SIZE
        for key in LESION_KEYS:
            if key not in masks:
                masks[key] = np.zeros((S, S), dtype=np.uint8)
        return masks

    except Exception as e:
        logger.warning(f"[Stage2-Lesion] Toolkit failed ({e}), using empty masks")
        S = STAGE2_CANONICAL_SIZE
        return {k: np.zeros((S, S), dtype=np.uint8) for k in LESION_KEYS}


# ──────────────────────────────────────────────────────────────
# Branch B — OD + Fovea/Macula
# ──────────────────────────────────────────────────────────────
def _run_od_branch(img_rgb: np.ndarray) -> Tuple[np.ndarray, Optional[Tuple[int, int]]]:
    """
    Returns (od_mask at canonical size, macula_point or None).
    macula_point: (x, y) pixel coordinates in canonical frame.
    """
    S = STAGE2_CANONICAL_SIZE

    try:
        from fundus_odmac_toolkit.models import detect as odmac_detect
        logger.info("[Stage2-OD] Running fundus-odmac-toolkit")

        from PIL import Image
        pil_img = Image.fromarray(img_rgb)
        result = odmac_detect(pil_img)

        od_mask     = np.zeros((S, S), dtype=np.uint8)
        macula_point = None

        if isinstance(result, dict):
            od_raw = result.get("od_mask", result.get("optic_disc"))
            mac    = result.get("macula",  result.get("fovea"))

            if od_raw is not None:
                if hasattr(od_raw, "numpy"):
                    od_raw = od_raw.squeeze().numpy()
                od_mask = _to_canon(od_raw > 0.5, is_mask=True)

            if mac is not None:
                # Could be a 2-element (x,y) point or a mask
                if hasattr(mac, "__len__") and len(mac) == 2:
                    # Scale point to canonical frame
                    orig_h, orig_w = img_rgb.shape[:2]
                    mx = int(mac[0] / orig_w  * S)
                    my = int(mac[1] / orig_h * S)
                    macula_point = (mx, my)
                elif hasattr(mac, "shape"):
                    arr = mac.squeeze().numpy() if hasattr(mac, "numpy") else mac
                    mask = _to_canon(arr > 0.5, is_mask=True)
                    ys, xs = np.where(mask)
                    if len(xs):
                        macula_point = (int(xs.mean()), int(ys.mean()))

        return od_mask, macula_point

    except Exception as e:
        logger.warning(f"[Stage2-OD] Toolkit failed ({e}), using empty OD mask")
        return np.zeros((S, S), dtype=np.uint8), None


# ──────────────────────────────────────────────────────────────
# Branch C — Vessel segmentation (Frangi, guaranteed no-download)
# ──────────────────────────────────────────────────────────────
def _run_vessel_branch(img_rgb: np.ndarray) -> np.ndarray:
    """
    Classical Frangi vesselness filter — no model download required.
    Returns binary vessel mask at canonical size.
    """
    try:
        logger.info("[Stage2-Vessel] Running Frangi vesselness")
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)

        # Pre-process: CLAHE for contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray_eq = clahe.apply(gray)

        # Background subtraction
        blur = cv2.GaussianBlur(gray_eq, (0, 0), sigmaX=10)
        diff = cv2.addWeighted(gray_eq, 4, blur, -4, 128)

        # Frangi vesselness
        gray_f32 = diff.astype(np.float32) / 255.0
        vessel_prob = filters.frangi(gray_f32)

        # Threshold + morphological cleanup
        thresh = vessel_prob > np.percentile(vessel_prob, 90)
        cleaned = morphology.remove_small_objects(thresh, min_size=50)

        return _to_canon(cleaned.astype(np.uint8), is_mask=True)

    except Exception as e:
        logger.warning(f"[Stage2-Vessel] Frangi failed ({e})")
        S = STAGE2_CANONICAL_SIZE
        return np.zeros((S, S), dtype=np.uint8)


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
          "lesion_masks":    {"MA": ndarray, "EX": ..., "HE": ..., "CWS": ...},
          "lesion_counts":   {"MA": int, ...},
          "od_mask":         ndarray (S×S),
          "macula_point":    (x, y) or None,
          "vessel_mask":     ndarray (S×S),
          "od_detected":     bool,
          "vessel_coverage": float (0-1),
          "canonical_image": ndarray (S×S×3),
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

    lesion_counts = {k: int(v.sum()) for k, v in lesion_masks.items()}
    od_detected   = bool(od_mask.sum() > 0)
    vessel_coverage = float(vessel_mask.sum()) / (S * S)
    canonical_img = _to_canon(img_rgb, is_mask=False)

    logger.info(
        f"[Stage2] Done — lesions={lesion_counts} "
        f"OD={od_detected} vessel={vessel_coverage:.3f}"
    )

    return {
        "lesion_masks":    lesion_masks,
        "lesion_counts":   lesion_counts,
        "od_mask":         od_mask,
        "macula_point":    macula_point,
        "vessel_mask":     vessel_mask,
        "od_detected":     od_detected,
        "vessel_coverage": vessel_coverage,
        "canonical_image": canonical_img,
    }
