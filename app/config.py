"""
Central configuration for the DR Screening Pipeline.

To upgrade a model, simply replace model.pt or model_stage1.pt in the project root.
All paths, thresholds, and preprocessing parameters are defined here — nothing
is hardcoded in the pipeline modules.
"""
from pathlib import Path

# ── Project root (two levels up from this file: app/config.py → app/ → project root)
PROJECT_ROOT = Path(__file__).parent.parent.resolve()

# ──────────────────────────────────────────────
# Model file paths  ← ONLY thing you need to change when upgrading models
# ──────────────────────────────────────────────
STAGE1_MODEL_PATH = PROJECT_ROOT / "model_stage1.pt"
STAGE3_MODEL_PATH = PROJECT_ROOT / "model.pt"

# ──────────────────────────────────────────────
# Stage 1 — Quality Classifier
# ──────────────────────────────────────────────
STAGE1_MODEL_ARCH = "efficientnet_b0"
STAGE1_IMG_SIZE   = 224
STAGE1_NUM_CLASSES = 3
# EyeQ quality code mapping (matches training notebook)
STAGE1_QUALITY_LABELS = {0: "Good", 1: "Usable", 2: "Reject"}
STAGE1_LABEL_TO_IDX   = {"Good": 0, "Usable": 1, "Reject": 2}

# Classical pre-filter thresholds (run before CNN, sub-second)
LAPLACIAN_BLUR_THRESHOLD   = 50.0    # below this → likely blurry
HISTOGRAM_SPREAD_THRESHOLD = 30.0    # below this → likely under/overexposed

# CLAHE parameters for Usable image enhancement
CLAHE_CLIP_LIMIT   = 2.0
CLAHE_TILE_GRID    = (8, 8)
ILLUM_SIGMA        = 30.0             # Gaussian sigma for illumination normalization

# ──────────────────────────────────────────────
# Stage 2 — Segmentation
# ──────────────────────────────────────────────
STAGE2_CANONICAL_SIZE = 512   # all masks registered to this resolution

# ──────────────────────────────────────────────
# Stage 3 — DR Grading
# ──────────────────────────────────────────────
STAGE3_MODEL_ARCH   = "efficientnet_b3"
STAGE3_IMG_SIZE     = 224
STAGE3_NUM_CLASSES  = 5
STAGE3_USE_ORDINAL  = True     # CORAL ordinal head

STAGE3_GRADE_LABELS = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}
STAGE3_GRADE_COLORS = {
    0: "#22c55e",   # green
    1: "#84cc16",   # lime
    2: "#f59e0b",   # amber
    3: "#ef4444",   # red
    4: "#7c3aed",   # violet
}

# Referable DR: grade ≥ 2 (Moderate NPDR or worse)
REFERABLE_GRADE_CUTOFF    = 2
REFERABLE_THRESHOLD_PROB  = 0.5   # updated at runtime if model checkpoint has one
# Temperature scaling (default; updated from checkpoint if available)
TEMPERATURE               = 1.5

# ──────────────────────────────────────────────
# ImageNet normalization (used by both models)
# ──────────────────────────────────────────────
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

# ──────────────────────────────────────────────
# Storage paths
# ──────────────────────────────────────────────
STATIC_DIR  = PROJECT_ROOT / "app" / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────
# Evidence-to-ICDR criteria mapping
# (used in Stage 4 report / evidence table)
# ──────────────────────────────────────────────
ICDR_CRITERIA = {
    0: "No abnormalities detected",
    1: "Mild NPDR: Only microaneurysms",
    2: "Moderate NPDR: More than mild NPDR but less than severe NPDR",
    3: "Severe NPDR: 20+ intraretinal haemorrhages in each quadrant, "
       "or venous beading in ≥2 quadrants, or prominent IRMA in ≥1 quadrant",
    4: "Proliferative DR: Neovascularisation or vitreous/pre-retinal haemorrhage",
}

LESION_DESCRIPTIONS = {
    "MA":  ("Microaneurysms",           "#ef4444"),
    "EX":  ("Hard Exudates",            "#f59e0b"),
    "HE":  ("Haemorrhages",             "#7c3aed"),
    "CWS": ("Cotton-Wool Spots",        "#06b6d4"),
}

VESSEL_OPACITY   = 0.15
OD_OUTLINE_COLOR = (0, 255, 0)      # BGR
MACULA_COLOR     = (255, 255, 0)    # BGR
GRADCAM_ALPHA    = 0.4

# ──────────────────────────────────────────────
# Rejection reasons (structured, not free text)
# ──────────────────────────────────────────────
REJECTION_REASONS = {
    "blur":        "Image is too blurry — please retake with the fundus camera in proper focus.",
    "illumination":"Illumination is poor (too dark or too bright) — adjust lighting and retake.",
    "model":       "Image quality classified as ungradable by the quality model.",
    "general":     "Image did not pass quality checks — please upload a higher-quality fundus photo.",
}
