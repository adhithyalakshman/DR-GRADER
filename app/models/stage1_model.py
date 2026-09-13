"""Stage 1 quality classifier model — loader and inference.

Drop-in replaceable: swap model_stage1.pt in the project root and this module
automatically picks up the new weights. No other file needs editing.

Architecture (matches training notebook stage1_quality_classifier_fast.ipynb):
  - timm EfficientNet-B0 backbone, pretrained=False at inference time
  - 3-class linear head: Good (0) / Usable (1) / Reject (2)
  - Checkpoint keys: {"model_state_dict": ..., "epoch": ..., "score": ...}
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image

from app.config import (
    IMAGENET_MEAN, IMAGENET_STD,
    STAGE1_IMG_SIZE, STAGE1_MODEL_ARCH, STAGE1_NUM_CLASSES,
    STAGE1_MODEL_PATH, STAGE1_QUALITY_LABELS,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Model definition  (same as notebook's Stage 1)
# ──────────────────────────────────────────────
class QualityModel(nn.Module):
    """EfficientNet-B0 with a 3-class linear head for image quality classification."""

    def __init__(self, arch: str = STAGE1_MODEL_ARCH, num_classes: int = STAGE1_NUM_CLASSES):
        super().__init__()
        # pretrained=False: we load weights from the checkpoint file
        self.backbone = timm.create_model(arch, pretrained=False, num_classes=num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)


# ──────────────────────────────────────────────
# Transforms
# ──────────────────────────────────────────────
_eval_transform = T.Compose([
    T.Resize((STAGE1_IMG_SIZE, STAGE1_IMG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])


# ──────────────────────────────────────────────
# Loader (singleton pattern — loaded once at startup)
# ──────────────────────────────────────────────
_model: QualityModel | None = None
_device: torch.device = torch.device("cpu")


def load_model() -> QualityModel:
    """Load Stage 1 model from disk. Called once at FastAPI startup."""
    global _model, _device

    if _model is not None:
        return _model

    path = Path(STAGE1_MODEL_PATH)
    if not path.exists():
        raise FileNotFoundError(
            f"Stage 1 model not found at {path}. "
            "Place model_stage1.pt in the project root."
        )

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"[Stage1] Loading quality model from {path} on {_device}")

    checkpoint = torch.load(path, map_location=_device, weights_only=False)

    _model = QualityModel()
    state = checkpoint.get("model_state_dict", checkpoint)
    _model.load_state_dict(state)
    _model.to(_device).eval()

    logger.info(f"[Stage1] Quality model loaded (epoch={checkpoint.get('epoch', '?')})")
    return _model


# ──────────────────────────────────────────────
# Inference
# ──────────────────────────────────────────────
@torch.no_grad()
def predict_quality(image_rgb: np.ndarray) -> Dict:
    """
    Classify a fundus image's quality.

    Args:
        image_rgb: HxWx3 uint8 RGB numpy array.

    Returns:
        {
          "label":      "Good" | "Usable" | "Reject",
          "confidence": float  (0-1),
          "probs":      {"Good": float, "Usable": float, "Reject": float},
          "class_idx":  int
        }
    """
    model = load_model()
    pil_img = Image.fromarray(image_rgb)
    tensor = _eval_transform(pil_img).unsqueeze(0).to(_device)  # (1, 3, H, W)

    logits = model(tensor)
    probs = F.softmax(logits, dim=1).squeeze(0).cpu().numpy()  # (3,)

    class_idx = int(probs.argmax())
    label = STAGE1_QUALITY_LABELS[class_idx]
    confidence = float(probs[class_idx])

    return {
        "label":      label,
        "confidence": confidence,
        "probs":      {STAGE1_QUALITY_LABELS[i]: float(p) for i, p in enumerate(probs)},
        "class_idx":  class_idx,
    }
