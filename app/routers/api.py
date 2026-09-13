"""FastAPI routers — all API endpoints."""
from __future__ import annotations

import uuid
import logging
from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.pipeline.orchestrator import (
    run_upload_stage, run_analysis_pipeline, get_report, list_worklist,
)
from app.utils.image_utils import read_image_rgb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg", "image/tiff"}


# ── POST /api/upload ──────────────────────────────────────────
@router.post("/upload")
async def upload_image(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Stage 1 — Quality gate (sync, <2s target).
    Accepts a fundus image, returns quality classification + rejection reason if any.
    """
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, f"Unsupported file type: {file.content_type}")

    raw_bytes = await file.read()
    if len(raw_bytes) == 0:
        raise HTTPException(400, "Empty file received.")
    if len(raw_bytes) > 20 * 1024 * 1024:  # 20 MB hard cap
        raise HTTPException(413, "File too large (max 20 MB).")

    try:
        img_rgb = read_image_rgb(raw_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))

    image_id = str(uuid.uuid4())
    result = run_upload_stage(image_id, img_rgb)
    return result


# ── POST /api/analyze/{image_id} ─────────────────────────────
@router.post("/analyze/{image_id}")
async def analyze_image(image_id: str) -> Dict[str, Any]:
    """
    Stage 2→3→4 analysis pipeline.
    Returns report_id which can be polled via GET /api/report/{report_id}.
    """
    try:
        report_id = run_analysis_pipeline(image_id)
        return {"report_id": report_id, "status": "complete"}
    except KeyError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.exception(f"Analysis failed for image_id={image_id}")
        raise HTTPException(500, f"Analysis failed: {e}")


# ── GET /api/report/{report_id} ──────────────────────────────
@router.get("/report/{report_id}")
async def get_report_endpoint(report_id: str) -> Dict[str, Any]:
    """Return the full structured report."""
    report = get_report(report_id)
    if report is None:
        raise HTTPException(404, f"Report {report_id} not found.")
    return report


# ── GET /api/worklist ────────────────────────────────────────
@router.get("/worklist")
async def worklist() -> list:
    """Return all processed cases sorted by urgency (referable first, then grade)."""
    return list_worklist()


# ── GET /api/health ──────────────────────────────────────────
@router.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
