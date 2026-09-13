"""FastAPI application entrypoint."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import STATIC_DIR, UPLOADS_DIR
from app.routers.api import router

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title="EyeQ DR Screening Pipeline",
    description=(
        "Diabetic Retinopathy screening pipeline: "
        "Stage 1 quality gate → Stage 2 segmentation → Stage 3 grading → Stage 4 explainability."
    ),
    version="1.0.0",
)

# ── CORS (allow local React dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files
STATIC_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── Routes
app.include_router(router)


# ── Startup — preload models
@app.on_event("startup")
async def startup_event():
    logger.info("Preloading Stage 1 and Stage 3 models …")
    try:
        from app.models.stage1_model import load_model as load_s1
        load_s1()
        logger.info("Stage 1 model loaded ✓")
    except Exception as e:
        logger.error(f"Stage 1 model load failed: {e}")

    try:
        from app.models.stage3_model import load_model as load_s3
        load_s3()
        logger.info("Stage 3 model loaded ✓")
    except Exception as e:
        logger.error(f"Stage 3 model load failed: {e}")

    logger.info("Startup complete. API ready at http://localhost:8000")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
