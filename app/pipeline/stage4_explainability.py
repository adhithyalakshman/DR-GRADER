"""Stage 4 — Explainability: Grad-CAM + fused overlay + evidence table.

Fused overlay composition (high to low opacity):
  1. Lesions (color-coded by class) — highest opacity, these drive the grade
  2. OD outline (green) + macula marker (yellow)
  3. Vessels (thin, low opacity)
  4. Grad-CAM heatmap (base layer)
"""
from __future__ import annotations

import logging
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

from app.config import (
    GRADCAM_ALPHA, VESSEL_OPACITY, OD_OUTLINE_COLOR, MACULA_COLOR,
    LESION_DESCRIPTIONS, STAGE2_CANONICAL_SIZE,
)
from app.models.stage3_model import compute_gradcam_overlay
from app.utils.image_utils import encode_image_b64, resize_to_canonical

logger = logging.getLogger(__name__)

# Lesion overlay colors (BGR for OpenCV)
_LESION_COLORS_BGR = {
    "MA":  (0,   0,   239),  # red
    "EX":  (0,   164, 245),  # amber/orange
    "HE":  (155, 0,   124),  # violet
    "CWS": (211, 182, 6),    # cyan
}
_LESION_ALPHA = {
    "MA":  0.55,
    "EX":  0.50,
    "HE":  0.55,
    "CWS": 0.45,
}


def _overlay_mask(
    base: np.ndarray,   # HxWx3 BGR
    mask: np.ndarray,   # HxW binary uint8
    color_bgr: Tuple[int, int, int],
    alpha: float,
) -> np.ndarray:
    """Blend a colored binary mask onto a BGR image."""
    colored = np.zeros_like(base)
    colored[mask > 0] = color_bgr
    return cv2.addWeighted(base, 1.0, colored, alpha, 0)


def build_fused_overlay(
    img_rgb: np.ndarray,
    gradcam_raw: np.ndarray,     # (H, W) heatmap [0,1] at original scale
    stage2_result: Optional[Dict],
) -> np.ndarray:
    """
    Compose all layers onto the fundus image.

    Returns:
        fused: HxWx3 uint8 RGB composite image at CANONICAL size.
    """
    S = STAGE2_CANONICAL_SIZE
    base_rgb = resize_to_canonical(img_rgb, S, is_mask=False)
    base_bgr = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2BGR)

    # ── Layer 1: Grad-CAM heatmap (base)
    cam_resized = cv2.resize(gradcam_raw, (S, S))
    heatmap_bgr = cv2.applyColorMap(np.uint8(255 * cam_resized), cv2.COLORMAP_JET)
    fused = cv2.addWeighted(base_bgr, 1 - GRADCAM_ALPHA, heatmap_bgr, GRADCAM_ALPHA, 0)

    if stage2_result is None:
        return cv2.cvtColor(fused, cv2.COLOR_BGR2RGB)

    # ── Layer 2: Vessels (thin, very low opacity)
    vessel_mask = stage2_result.get("vessel_mask")
    if vessel_mask is not None:
        vessel_bgr = np.zeros_like(fused)
        vessel_bgr[vessel_mask > 0] = (200, 200, 200)  # light gray
        fused = cv2.addWeighted(fused, 1.0, vessel_bgr, VESSEL_OPACITY, 0)

    # ── Layer 3: OD outline
    od_mask = stage2_result.get("od_mask")
    if od_mask is not None and od_mask.sum() > 0:
        contours, _ = cv2.findContours(
            od_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        cv2.drawContours(fused, contours, -1, OD_OUTLINE_COLOR, 2)

    # ── Layer 4: Macula marker
    macula_pt = stage2_result.get("macula_point")
    if macula_pt is not None:
        cv2.drawMarker(fused, macula_pt, MACULA_COLOR, cv2.MARKER_CROSS, 20, 2)

    # ── Layer 5: Lesion masks (highest opacity)
    lesion_masks = stage2_result.get("lesion_masks", {})
    for key in ["CWS", "EX", "HE", "MA"]:   # draw in order, MA on top
        mask = lesion_masks.get(key)
        if mask is not None and mask.sum() > 0:
            fused = _overlay_mask(
                fused, mask,
                _LESION_COLORS_BGR[key],
                _LESION_ALPHA[key],
            )

    # ── Legend
    _draw_legend(fused, stage2_result)

    return cv2.cvtColor(fused, cv2.COLOR_BGR2RGB)


def _draw_legend(img_bgr: np.ndarray, stage2_result: Dict) -> None:
    """Draw a small color-coded legend in the top-left corner."""
    items = [
        ("MA — Microaneurysms",   (0,   0,   239)),
        ("EX — Hard Exudates",    (0,   164, 245)),
        ("HE — Haemorrhages",     (155, 0,   124)),
        ("CWS — Cotton-Wool Spots",(211, 182, 6)),
        ("Vessels",               (200, 200, 200)),
    ]
    if stage2_result.get("od_detected"):
        items.append(("Optic Disc",  OD_OUTLINE_COLOR))
    if stage2_result.get("macula_point"):
        items.append(("Macula/Fovea", MACULA_COLOR))

    x0, y0 = 8, 8
    for i, (label, color) in enumerate(items):
        y = y0 + i * 18
        cv2.rectangle(img_bgr, (x0, y), (x0 + 14, y + 12), color, -1)
        cv2.putText(img_bgr, label, (x0 + 18, y + 11),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)


def run_stage4(
    processed_img_rgb: np.ndarray,
    stage2_result: Optional[Dict],
) -> Dict:
    """
    Run Grad-CAM and build all explainability outputs.

    Args:
        processed_img_rgb: quality-gated (and optionally enhanced) HxWx3 RGB.
        stage2_result: output from run_stage2() or None.

    Returns:
        {
          "gradcam_b64":       str (data-URI),
          "fused_overlay_b64": str (data-URI),
          "ref_score":         float,
        }
    """
    logger.info("[Stage4] Computing Grad-CAM and fused overlay")
    cam_raw, gradcam_overlay, ref_score = compute_gradcam_overlay(processed_img_rgb)

    fused = build_fused_overlay(processed_img_rgb, cam_raw, stage2_result)

    return {
        "gradcam_b64":       encode_image_b64(gradcam_overlay),
        "fused_overlay_b64": encode_image_b64(fused),
        "ref_score":         ref_score,
    }
