"""Stage 3 — DR severity grading pipeline."""
from __future__ import annotations

import logging
from typing import Dict

import numpy as np

from app.models.stage3_model import predict_grade

logger = logging.getLogger(__name__)


def run_stage3(processed_img_rgb: np.ndarray) -> Dict:
    """
    Grade a quality-gated (and optionally enhanced) fundus image for DR severity.

    Args:
        processed_img_rgb: HxWx3 uint8 RGB (Stage 1 output — Reject never reaches here).

    Returns:
        Same dict as predict_grade() with keys:
        {icdr_grade, icdr_label, class_probabilities, referable, referable_probability, referable_threshold}
    """
    logger.info("[Stage3] Running DR grading")
    result = predict_grade(processed_img_rgb)
    logger.info(
        f"[Stage3] Grade={result['icdr_grade']} ({result['icdr_label']}) "
        f"Referable={result['referable']} P(ref)={result['referable_probability']:.3f}"
    )
    return result
