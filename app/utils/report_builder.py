"""Report builder — evidence-to-ICDR criteria mapping and structured report assembly."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

from app.config import (
    ICDR_CRITERIA, LESION_DESCRIPTIONS, REJECTION_REASONS,
    STAGE3_GRADE_LABELS, STAGE3_GRADE_COLORS, REFERABLE_GRADE_CUTOFF,
)


def build_evidence_table(
    lesion_counts: Dict[str, int],
    grade: int,
    quality_label: str,
) -> List[Dict]:
    """
    Map lesion counts to ICDR criteria rows.

    Returns a list of evidence rows like:
    [{"lesion": "Microaneurysms", "count": 3, "icdr_criterion": "...", "color": "#ef4444"}]
    """
    rows = []
    for code, (name, color) in LESION_DESCRIPTIONS.items():
        count = lesion_counts.get(code, 0)
        row = {
            "lesion":         name,
            "code":           code,
            "count":          count,
            "color":          color,
            "icdr_criterion": _lesion_criterion(code, count, grade),
        }
        rows.append(row)
    return rows


def _lesion_criterion(code: str, count: int, grade: int) -> str:
    """Map a single lesion type + count to its ICDR criterion description."""
    if count == 0:
        return "Not detected"
    if code == "MA":
        if count <= 5:
            return f"{count} microaneurysm(s) — consistent with Mild NPDR if only finding"
        return f"{count} microaneurysms — contributes to Moderate+ NPDR evidence"
    if code == "HE":
        return f"{count} haemorrhage region(s) — assess quadrant distribution for Severe NPDR"
    if code == "EX":
        return f"{count} hard exudate region(s) — risk of maculopathy if near macula"
    if code == "CWS":
        return f"{count} cotton-wool spot(s) — nerve fibre layer infarcts, Moderate+ NPDR"
    return f"{count} finding(s)"


def build_recommendation(grade: int, referable: bool, quality_label: str) -> str:
    """Single-line clinical recommendation (non-binding, for report display only)."""
    if grade == 0:
        return "No diabetic retinopathy detected. Recommend routine annual screening."
    if grade == 1:
        return (
            "Mild NPDR detected. Recommend optimising glycaemic and blood pressure control. "
            "Re-screen in 12 months."
        )
    if grade == 2:
        return (
            "Moderate NPDR detected. REFER to ophthalmologist within 3 months for "
            "dilated fundal examination."
        )
    if grade == 3:
        return (
            "Severe NPDR detected. URGENT REFERRAL to ophthalmologist — "
            "high risk of progression to proliferative DR."
        )
    if grade == 4:
        return (
            "Proliferative DR detected. EMERGENCY REFERRAL — "
            "vitreoretinal surgery may be required to preserve vision."
        )
    return "Consult an ophthalmologist."


def assemble_report(
    image_id:          str,
    stage1_result:     Dict,
    stage2_result:     Optional[Dict],
    stage3_result:     Optional[Dict],
    gradcam_b64:       Optional[str],
    fused_overlay_b64: Optional[str],
    original_b64:      Optional[str],
    enhanced_b64:      Optional[str],
) -> Dict[str, Any]:
    """Assemble the final structured report returned by GET /api/report/{id}."""

    quality_label = stage1_result.get("label", "Unknown")

    if stage3_result is None:
        # Image was rejected at Stage 1
        return {
            "image_id":      image_id,
            "status":        "rejected",
            "quality":       stage1_result,
            "recommendation": REJECTION_REASONS.get("model", REJECTION_REASONS["general"]),
            "original_image": original_b64,
        }

    grade    = stage3_result["icdr_grade"]
    referable = stage3_result["referable"]

    # Lesion counts from Stage 2 (if available)
    lesion_counts: Dict[str, int] = {}
    od_detected = False
    vessel_coverage = 0.0

    if stage2_result:
        lesion_counts   = stage2_result.get("lesion_counts",   {})
        od_detected     = stage2_result.get("od_detected",     False)
        vessel_coverage = stage2_result.get("vessel_coverage", 0.0)

    evidence_table = build_evidence_table(lesion_counts, grade, quality_label)
    recommendation  = build_recommendation(grade, referable, quality_label)

    return {
        "image_id": image_id,
        "status":   "complete",

        "quality": {
            "label":      quality_label,
            "confidence": stage1_result.get("confidence", 0.0),
            "probs":      stage1_result.get("probs", {}),
        },

        "grade": {
            "icdr_grade":            grade,
            "icdr_label":            STAGE3_GRADE_LABELS[grade],
            "icdr_color":            STAGE3_GRADE_COLORS[grade],
            "icdr_description":      ICDR_CRITERIA[grade],
            "class_probabilities":   stage3_result.get("class_probabilities", {}),
            "referable":             referable,
            "referable_probability": stage3_result.get("referable_probability", 0.0),
            "referable_threshold":   stage3_result.get("referable_threshold", 0.5),
            "referable_cutoff":      REFERABLE_GRADE_CUTOFF,
        },

        "segmentation": {
            "lesion_counts":   lesion_counts,
            "od_detected":     od_detected,
            "vessel_coverage": round(vessel_coverage, 4),
            "available":       stage2_result is not None,
        },

        "explainability": {
            "evidence_table": evidence_table,
            "gradcam_note":   "Grad-CAM computed w.r.t. referable-DR score P(grade≥2).",
        },

        "recommendation": recommendation,

        "images": {
            "original":      original_b64,
            "enhanced":      enhanced_b64,
            "gradcam":       gradcam_b64,
            "fused_overlay": fused_overlay_b64,
        },
    }
