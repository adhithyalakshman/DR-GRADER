# EyeQ DR Screening Pipeline — Quick Start Guide

## Project Structure
```
DR CLASSIFIER/
├── model.pt            ← Stage 3 grading model  (swap to upgrade)
├── model_stage1.pt     ← Stage 1 quality model  (swap to upgrade)
├── app/                ← FastAPI backend
│   ├── main.py         ← Entry point: uvicorn app.main:app
│   ├── config.py       ← ALL config in one place (thresholds, paths, labels)
│   ├── models/         ← ONLY files that load .pt weights
│   │   ├── stage1_model.py
│   │   └── stage3_model.py
│   ├── pipeline/       ← One file per pipeline stage
│   │   ├── stage1_quality.py       (pre-filter + CNN quality gate)
│   │   ├── stage2_segmentation.py  (lesions + OD + vessels)
│   │   ├── stage3_grading.py       (DR severity grading)
│   │   ├── stage4_explainability.py(Grad-CAM + fused overlay)
│   │   └── orchestrator.py         (glues all stages together)
│   ├── routers/api.py  ← FastAPI route definitions
│   └── utils/          ← image_utils, report_builder
├── frontend/           ← React SPA (Vite)
│   └── src/
│       ├── pages/      ← UploadPage, ReportPage, WorklistPage
│       └── components/ ← UploadZone, GradeBadge, EvidenceTable, etc.
├── requirements.txt
├── verify_setup.py     ← Run this first to check everything
└── README.md
```

---

## 1. Install Python dependencies

```bash
# Create a virtual environment (recommended)
python -m venv .venv
# Activate it:
#   Windows:  source .venv/Scripts/activate
#   Linux/Mac: source .venv/bin/activate

# Install all dependencies:
pip install -r requirements.txt
```

### Stage 2 Segmentation Dependencies

Stage 2 requires three specialised toolkits for retinal structure segmentation.
These are included in `requirements.txt` but may need special attention:

```bash
pip install huggingface_hub safetensors segmentation_models_pytorch
# Lesion segmentation (MA, EX, HE, CWS)
pip install fundus-lesions-toolkit

# OD / Fovea-Macula localization (git dependency)
pip install "git+https://github.com/ClementPla/fundus-data-toolkit.git"
pip install "git+https://github.com/ClementPla/fundus-odmac-toolkit.git"

# Supporting libraries
pip install segmentation_models_pytorch>=0.3.3
pip install huggingface_hub>=0.20.0 safetensors>=0.4.0
pip install monai>=1.3.0
```

> **Note:** `fundus-lesions-toolkit` and `fundus-odmac-toolkit` will auto-download
> their pretrained weights on first run. Stage 2 degrades gracefully if they fail:
> - Vessel segmentation uses a classical CLAHE + Frangi pipeline that **always works offline**
> - Lesion/OD segmentation falls back to empty masks if the toolkit fails

> **Troubleshooting Stage 2:**
> - If `fundus-odmac-toolkit` fails to install, ensure `git` is available on your PATH
> - If pretrained weights fail to download, the pipeline continues with empty masks
> - On Windows, you may need `Microsoft Visual C++ Build Tools` for some packages

---

## 2. Verify setup

```bash
python verify_setup.py
```

This checks all packages, model files, and does a model loading dry-run.

---

## 3. Start the FastAPI backend

```bash
python -m uvicorn app.main:app --reload --port 8000
```

- Models are preloaded at startup
- Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

---

## 4. Start the React frontend

```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:5173**

---

## 5. Upgrading models

To replace the DR grading model with an improved version:
1. Copy new weights to `model.pt` (project root)
2. Restart the backend — it auto-reloads

To replace the quality classifier:
1. Copy new weights to `model_stage1.pt` (project root)
2. Restart the backend

**Nothing else needs to change** — all code adapts automatically.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/upload` | POST | Stage 1 quality gate (multipart/form-data, `file=`) |
| `/api/analyze/{image_id}` | POST | Stages 2→3→4 analysis |
| `/api/report/{report_id}` | GET | Full structured report |
| `/api/worklist` | GET | All cases, sorted by urgency |
| `/api/health` | GET | Health check |

---

## Pipeline Stages

| Stage | What it does | Model / Method |
|---|---|---|
| **Stage 1** | Quality gate — classifies image as Good/Usable/Reject | EfficientNet-B0 (3-class) |
| **Stage 2** | Retinal structure segmentation | `fundus-lesions-toolkit` (lesions), `fundus-odmac-toolkit` (OD/macula), Frangi vesselness (vessels) |
| **Stage 3** | DR severity grading (ICDR 0–4) | EfficientNet-B0 + CORAL ordinal head |
| **Stage 4** | Explainability — Grad-CAM + fused evidence overlay | `pytorch-grad-cam` |

### Stage 2 Output Details

Stage 2 produces the following outputs for each image:

- **Lesion masks** (MA, EX, HE, CWS) — binary masks at 512×512
- **Lesion features** — pixel count, connected component count, nearest distance to macula
- **Optic disc mask** — binary mask + area in pixels
- **Macula/fovea point** — (row, col) coordinates in canonical frame
- **Vessel mask** — binary mask with coverage percentage
- **Vessel density quadrants** — vessel density fraction for TL, TR, BL, BR quadrants
- **Overlay images** — individual and fused segmentation overlays as base64

---

## Configuration

All tunable parameters in [`app/config.py`](app/config.py):

| Parameter | Default | Effect |
|---|---|---|
| `REFERABLE_THRESHOLD_PROB` | 0.5 | Referable-DR probability cutoff |
| `TEMPERATURE` | 1.5 | Temperature scaling for calibration |
| `CLAHE_CLIP_LIMIT` | 2.0 | CLAHE enhancement strength |
| `LAPLACIAN_BLUR_THRESHOLD` | 50.0 | Pre-filter: blur reject threshold |
| `STAGE2_CANONICAL_SIZE` | 512 | All masks registered to this size |
