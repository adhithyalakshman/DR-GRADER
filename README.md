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
# In your Python environment (conda, venv, etc.):
pip install -r requirements.txt
```

> **Note:** `fundus-lesions-toolkit` and `fundus-odmac-toolkit` will auto-download
> their pretrained weights on first run. Stage 2 degrades gracefully if they fail
> (Frangi vesselness always works, lesion/OD falls back to empty masks).

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

## Configuration

All tunable parameters in [`app/config.py`](app/config.py):

| Parameter | Default | Effect |
|---|---|---|
| `REFERABLE_THRESHOLD_PROB` | 0.5 | Referable-DR probability cutoff |
| `TEMPERATURE` | 1.5 | Temperature scaling for calibration |
| `CLAHE_CLIP_LIMIT` | 2.0 | CLAHE enhancement strength |
| `LAPLACIAN_BLUR_THRESHOLD` | 50.0 | Pre-filter: blur reject threshold |
| `STAGE2_CANONICAL_SIZE` | 512 | All masks registered to this size |
