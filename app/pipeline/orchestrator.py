"""Pipeline orchestrator — runs all stages in sequence and assembles final report."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Dict, Optional

import numpy as np

from app.config import UPLOADS_DIR
from app.pipeline.stage1_quality import run_stage1
from app.pipeline.stage2_segmentation import run_stage2
from app.pipeline.stage3_grading import run_stage3
from app.pipeline.stage4_explainability import run_stage4
from app.utils.image_utils import encode_image_b64, save_image
from app.utils.report_builder import assemble_report

logger = logging.getLogger(__name__)

# In-memory report store (replace with a DB in production)
_report_store: Dict[str, Dict] = {}
_image_store:  Dict[str, np.ndarray] = {}   # image_id → processed RGB


def run_upload_stage(image_id: str, img_rgb: np.ndarray) -> Dict:
    """
    POST /api/upload handler — runs Stage 1 only.

    Returns:
        {image_id, status, quality_label, confidence, probs,
         pre_filters, rejection_reason, original_b64, enhanced_b64}
    """
    logger.info(f"[Orchestrator] Upload pipeline start — image_id={image_id}")
    stage1 = run_stage1(img_rgb)

    # Store processed image for later analysis
    _image_store[image_id] = {
        "original":  img_rgb,
        "processed": stage1["processed_image"],
        "stage1":    stage1,
    }

    original_b64 = encode_image_b64(img_rgb)
    enhanced_b64 = (
        encode_image_b64(stage1["processed_image"])
        if stage1["quality_label"] == "Usable"
        else None
    )

    return {
        "image_id":        image_id,
        "status":          stage1["status"],
        "quality_label":   stage1["quality_label"],
        "confidence":      stage1["confidence"],
        "probs":           stage1["probs"],
        "pre_filters":     stage1["pre_filters"],
        "rejection_reason": stage1["rejection_reason"],
        "original_b64":    original_b64,
        "enhanced_b64":    enhanced_b64,
        "blur_flag":       stage1["blur_flag"],
        "illum_flag":      stage1["illum_flag"],
    }


def run_analysis_pipeline(image_id: str) -> str:
    """
    POST /api/analyze/{image_id} handler — runs Stages 2 → 3 → 4.

    Returns:
        report_id (str)
    """
    if image_id not in _image_store:
        raise KeyError(f"image_id={image_id} not found — upload first.")

    store    = _image_store[image_id]
    stage1   = store["stage1"]
    img_orig = store["original"]
    img_proc = store["processed"]   # enhanced if Usable, original if Good

    report_id = str(uuid.uuid4())
    logger.info(f"[Orchestrator] Analysis start — image_id={image_id} report_id={report_id}")

    # ── Stage 2 (only for gradable images)
    stage2_result = None
    if stage1["status"] == "gradable":
        try:
            stage2_result = run_stage2(img_proc)
        except Exception as e:
            logger.error(f"[Orchestrator] Stage 2 failed: {e} — continuing without masks")

    # ── Stage 3
    stage3_result = None
    if stage1["status"] == "gradable":
        try:
            stage3_result = run_stage3(img_proc)
        except Exception as e:
            logger.error(f"[Orchestrator] Stage 3 failed: {e}")
            raise

    # ── Stage 4
    stage4_result = None
    if stage3_result is not None:
        try:
            stage4_result = run_stage4(img_proc, stage2_result)
        except Exception as e:
            logger.error(f"[Orchestrator] Stage 4 failed: {e} — continuing without Grad-CAM")

    # ── Assemble report
    report = assemble_report(
        image_id          = image_id,
        stage1_result     = stage1,
        stage2_result     = stage2_result,
        stage3_result     = stage3_result,
        gradcam_b64       = stage4_result["gradcam_b64"]       if stage4_result else None,
        fused_overlay_b64 = stage4_result["fused_overlay_b64"] if stage4_result else None,
        original_b64      = encode_image_b64(img_orig),
        enhanced_b64      = (
            encode_image_b64(img_proc)
            if stage1["quality_label"] == "Usable" else None
        ),
    )
    report["report_id"] = report_id

    _report_store[report_id] = report
    logger.info(f"[Orchestrator] Report assembled — report_id={report_id}")
    return report_id


def get_report(report_id: str) -> Optional[Dict]:
    return _report_store.get(report_id)


def list_worklist() -> list:
    """Return summarised list of all processed cases, sorted by urgency."""
    items = []
    for rid, r in _report_store.items():
        if r["status"] == "complete" and "grade" in r:
            items.append({
                "report_id":    rid,
                "image_id":     r.get("image_id"),
                "icdr_grade":   r["grade"]["icdr_grade"],
                "icdr_label":   r["grade"]["icdr_label"],
                "icdr_color":   r["grade"]["icdr_color"],
                "referable":    r["grade"]["referable"],
                "ref_prob":     r["grade"]["referable_probability"],
                "quality":      r["quality"]["label"],
                "status":       r["status"],
            })
    # Sort: referable first, then by grade descending
    items.sort(key=lambda x: (-int(x["referable"]), -x["icdr_grade"]))
    return items
