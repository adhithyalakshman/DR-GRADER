"""Stage 1 — Quality gate pipeline.

Runs:
  1. Classical pre-filters (Laplacian blur, histogram illumination) — sub-second
  2. CNN quality classifier (EfficientNet-B0) from model_stage1.pt
  3. Enhancement (CLAHE) if Usable

Returns structured result with quality label, confidence, and processed image.
"""
from __future__ import annotations

import logging
from typing import Dict, Tuple

import numpy as np

from app.config import (
    LAPLACIAN_BLUR_THRESHOLD, HISTOGRAM_SPREAD_THRESHOLD, REJECTION_REASONS,
)
from app.models.stage1_model import predict_quality
from app.utils.image_utils import (
    laplacian_blur_score, histogram_spread_score, enhance_usable_image,
)

logger = logging.getLogger(__name__)


def run_stage1(img_rgb: np.ndarray) -> Dict:
    """
    Full Stage 1 quality gate.

    Args:
        img_rgb: HxWx3 uint8 RGB array.

    Returns:
        {
          "status":          "gradable" | "reject",
          "quality_label":   "Good" | "Usable" | "Reject",
          "confidence":      float,
          "probs":           {label: float},
          "processed_image": ndarray (enhanced if Usable, original if Good),
          "pre_filters":     {"blur_score": float, "illum_score": float},
          "rejection_reason":str | None,
          "blur_flag":       bool,
          "illum_flag":      bool,
        }
    """
    # ── 1. Classical pre-filters
    blur_score  = laplacian_blur_score(img_rgb)
    illum_score = histogram_spread_score(img_rgb)
    blur_flag   = blur_score  < LAPLACIAN_BLUR_THRESHOLD
    illum_flag  = illum_score < HISTOGRAM_SPREAD_THRESHOLD

    logger.info(f"[Stage1] blur={blur_score:.1f} illum={illum_score:.1f}")

    # ── 2. CNN quality classification
    quality_result = predict_quality(img_rgb)
    label      = quality_result["label"]
    confidence = quality_result["confidence"]
    probs      = quality_result["probs"]

    # ── 3. Decision logic
    if label == "Reject":
        rejection_reason = (
            REJECTION_REASONS["blur"] if blur_flag
            else REJECTION_REASONS["illumination"] if illum_flag
            else REJECTION_REASONS["model"]
        )
        return {
            "status":          "reject",
            "quality_label":   label,
            "confidence":      confidence,
            "probs":           probs,
            "processed_image": img_rgb,  # returned as-is for display
            "pre_filters":     {"blur_score": blur_score, "illum_score": illum_score},
            "rejection_reason": rejection_reason,
            "blur_flag":       blur_flag,
            "illum_flag":      illum_flag,
        }

    # ── 4. Enhancement for Usable
    processed = img_rgb
    if label == "Usable":
        logger.info("[Stage1] Usable — applying CLAHE + illumination normalization")
        processed = enhance_usable_image(img_rgb)

    return {
        "status":          "gradable",
        "quality_label":   label,
        "confidence":      confidence,
        "probs":           probs,
        "processed_image": processed,
        "pre_filters":     {"blur_score": blur_score, "illum_score": illum_score},
        "rejection_reason": None,
        "blur_flag":       blur_flag,
        "illum_flag":      illum_flag,
    }
