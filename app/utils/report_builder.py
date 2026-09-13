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
    lesion_components: Dict[str, int],
    lesion_nearest_macula: Dict[str, Optional[float]],
    grade: int,
    quality_label: str,
) -> List[Dict]:
    """
    Map lesion counts to ICDR criteria rows.

    Returns a list of evidence rows like:
    [{
        "lesion": "Microaneurysms", "code": "MA", "count": 3,
        "components": 3, "nearest_macula": 45.2,
        "icdr_criterion": "...", "color": "#ef4444"
    }]
    """
    rows = []
    for code, (name, color) in LESION_DESCRIPTIONS.items():
        count = lesion_counts.get(code, 0)
        components = lesion_components.get(code, 0)
        nearest = lesion_nearest_macula.get(code)
        row = {
            "lesion":           name,
            "code":             code,
            "count":            count,
            "components":       components,
            "nearest_macula":   nearest,
            "color":            color,
            "icdr_criterion":   _lesion_criterion(code, count, components, grade),
        }
        rows.append(row)
    return rows


def _lesion_criterion(code: str, count: int, components: int, grade: int) -> str:
    """Map a single lesion type + count to its ICDR criterion description."""
    if count == 0:
        return "Not detected"
    if code == "MA":
        if components <= 5:
            return f"{components} cluster(s), {count:,} px — consistent with Mild NPDR if only finding"
        return f"{components} cluster(s), {count:,} px — contributes to Moderate+ NPDR evidence"
    if code == "HE":
        return f"{components} region(s), {count:,} px — assess quadrant distribution for Severe NPDR"
    if code == "EX":
        return f"{components} region(s), {count:,} px — risk of maculopathy if near macula"
    if code == "CWS":
        return f"{components} spot(s), {count:,} px — nerve fibre layer infarcts, Moderate+ NPDR"
    return f"{count:,} finding(s)"


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

    # Lesion counts and features from Stage 2 (if available)
    lesion_counts:         Dict[str, int]            = {}
    lesion_components:     Dict[str, int]            = {}
    lesion_nearest_macula: Dict[str, Optional[float]] = {}
    od_detected = False
    od_area_px  = 0
    vessel_coverage = 0.0
    vessel_density_quadrants = {}
    macula_point = None
    overlay_images = {}

    if stage2_result:
        lesion_counts         = stage2_result.get("lesion_counts",         {})
        lesion_components     = stage2_result.get("lesion_components",     {})
        lesion_nearest_macula = stage2_result.get("lesion_nearest_macula", {})
        od_detected           = stage2_result.get("od_detected",          False)
        od_area_px            = stage2_result.get("od_area_px",           0)
        vessel_coverage       = stage2_result.get("vessel_coverage",      0.0)
        vessel_density_quadrants = stage2_result.get("vessel_density_quadrants", {})
        macula_point          = stage2_result.get("macula_point")
        overlay_images        = stage2_result.get("overlay_images",       {})

    evidence_table = build_evidence_table(
        lesion_counts, lesion_components, lesion_nearest_macula, grade, quality_label
    )
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
            "lesion_counts":         lesion_counts,
            "lesion_components":     lesion_components,
            "lesion_nearest_macula": lesion_nearest_macula,
            "od_detected":           od_detected,
            "od_area_px":            od_area_px,
            "vessel_coverage":       round(vessel_coverage, 4),
            "vessel_density_quadrants": vessel_density_quadrants,
            "macula_point":          list(macula_point) if macula_point else None,
            "available":             stage2_result is not None,
        },

        "explainability": {
            "evidence_table": evidence_table,
            "gradcam_note":   "Grad-CAM computed w.r.t. referable-DR score P(grade≥2).",
        },

        "recommendation": recommendation,

        "images": {
            "original":            original_b64,
            "enhanced":            enhanced_b64,
            "gradcam":             gradcam_b64,
            "fused_overlay":       fused_overlay_b64,
            # Stage 2 segmentation overlays
            "vessel_overlay":      overlay_images.get("vessel_overlay"),
            "od_overlay":          overlay_images.get("od_overlay"),
            "fused_segmentation":  overlay_images.get("fused_segmentation"),
            "lesion_ma_overlay":   overlay_images.get("lesion_ma_overlay"),
            "lesion_ex_overlay":   overlay_images.get("lesion_ex_overlay"),
            "lesion_he_overlay":   overlay_images.get("lesion_he_overlay"),
            "lesion_cws_overlay":  overlay_images.get("lesion_cws_overlay"),
        },
    }
