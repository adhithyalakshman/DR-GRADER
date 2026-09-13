"""Stage 3 DR grading model + Grad-CAM — loader and inference.

Drop-in replaceable: swap model.pt in the project root.

Architecture (matches DR_Stage3_Grading.ipynb):
  - timm EfficientNet-B0 backbone (features only, num_classes=0)
  - CORAL ordinal head: CoralHead(feat_dim, 5) → 4 threshold logits
  - Checkpoint: {"model_state_dict": ..., "epoch": ..., ...}
  - Grad-CAM: hooks backbone.conv_head, computed w.r.t. P(grade≥2)
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image

from app.config import (
    IMAGENET_MEAN, IMAGENET_STD,
    STAGE3_IMG_SIZE, STAGE3_MODEL_ARCH, STAGE3_NUM_CLASSES,
    STAGE3_USE_ORDINAL, STAGE3_MODEL_PATH,
    STAGE3_GRADE_LABELS, REFERABLE_GRADE_CUTOFF,
    REFERABLE_THRESHOLD_PROB, TEMPERATURE,
    GRADCAM_ALPHA,
)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# CORAL ordinal head  (mirrors notebook exactly)
# ──────────────────────────────────────────────
class CoralHead(nn.Module):
    """Shared single-logit trunk + per-threshold bias (Cao et al. 2020)."""

    def __init__(self, in_features: int, num_classes: int):
        super().__init__()
        self.num_thresholds = num_classes - 1
        self.fc = nn.Linear(in_features, 1, bias=False)
        self.biases = nn.Parameter(torch.zeros(self.num_thresholds))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        logit = self.fc(x)           # (B, 1)
        return logit + self.biases   # (B, num_thresholds) via broadcast


class GradingModel(nn.Module):
    """EfficientNet backbone + CORAL or softmax head."""

    def __init__(self, arch: str, num_classes: int, ordinal: bool = True):
        super().__init__()
        self.ordinal = ordinal
        self.backbone = timm.create_model(arch, pretrained=False, num_classes=0)
        feat_dim = self.backbone.num_features
        self.head = CoralHead(feat_dim, num_classes) if ordinal else nn.Linear(feat_dim, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.backbone(x))

    def forward_features_for_cam(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        feats_map = self.backbone.forward_features(x)
        pooled    = self.backbone.forward_head(feats_map, pre_logits=True)
        return feats_map, pooled


# ──────────────────────────────────────────────
# CORAL decoding helpers  (mirrors notebook)
# ──────────────────────────────────────────────
def coral_probs(threshold_logits: torch.Tensor) -> torch.Tensor:
    """Convert CORAL threshold logits → class probability distribution."""
    p_gt = torch.sigmoid(threshold_logits)                          # (B, K-1)
    B = p_gt.size(0)
    ones  = torch.ones(B,  1, device=p_gt.device)
    zeros = torch.zeros(B, 1, device=p_gt.device)
    p_ext = torch.cat([ones, p_gt, zeros], dim=1)                   # (B, K+1)
    probs = (p_ext[:, :-1] - p_ext[:, 1:]).clamp(min=1e-6)         # (B, K)
    return probs / probs.sum(dim=1, keepdim=True)


def coral_grade(threshold_logits: torch.Tensor) -> torch.Tensor:
    """Rank-consistent grade prediction."""
    return (torch.sigmoid(threshold_logits) > 0.5).sum(dim=1)


# ──────────────────────────────────────────────
# Transforms
# ──────────────────────────────────────────────
_eval_transform = T.Compose([
    T.Resize((STAGE3_IMG_SIZE, STAGE3_IMG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])


# ──────────────────────────────────────────────
# Singleton state
# ──────────────────────────────────────────────
_model:     GradingModel | None = None
_device:    torch.device         = torch.device("cpu")
_temperature: float              = TEMPERATURE
_ref_threshold: float            = REFERABLE_THRESHOLD_PROB


def load_model() -> GradingModel:
    """Load Stage 3 model from disk. Called once at startup."""
    global _model, _device, _temperature, _ref_threshold

    if _model is not None:
        return _model

    path = Path(STAGE3_MODEL_PATH)
    if not path.exists():
        raise FileNotFoundError(
            f"Stage 3 model not found at {path}. "
            "Place model.pt in the project root."
        )

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"[Stage3] Loading grading model from {path} on {_device}")

    checkpoint = torch.load(path, map_location=_device, weights_only=False)
    state = checkpoint.get("model_state_dict", checkpoint)

    _model = GradingModel(STAGE3_MODEL_ARCH, STAGE3_NUM_CLASSES, ordinal=STAGE3_USE_ORDINAL)
    _model.load_state_dict(state)
    _model.to(_device).eval()

    # Restore calibration parameters if saved in checkpoint
    if "temperature" in checkpoint:
        _temperature = float(checkpoint["temperature"])
    if "referable_threshold" in checkpoint:
        _ref_threshold = float(checkpoint["referable_threshold"])

    logger.info(
        f"[Stage3] Grading model loaded (epoch={checkpoint.get('epoch','?')}, "
        f"T={_temperature:.3f}, ref_thresh={_ref_threshold:.3f})"
    )
    return _model


# ──────────────────────────────────────────────
# Grad-CAM
# ──────────────────────────────────────────────
class GradCAM:
    """Grad-CAM computed w.r.t. referable-DR score P(grade ≥ cutoff)."""

    def __init__(self, model: GradingModel):
        self.model = model
        self._activations: Optional[torch.Tensor] = None
        self._gradients:   Optional[torch.Tensor] = None

        # Hook onto backbone.conv_head (EfficientNet's last conv layer)
        if hasattr(model.backbone, "conv_head"):
            target = model.backbone.conv_head
        else:
            # Generic fallback: last child of backbone
            target = list(model.backbone.children())[-1]

        target.register_forward_hook(self._save_activation)
        target.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, _mod, _inp, out):
        self._activations = out.detach()

    def _save_gradient(self, _mod, _gin, grad_out):
        self._gradients = grad_out[0].detach()

    def __call__(self, x: torch.Tensor) -> Tuple[np.ndarray, float]:
        """
        Args:
            x: (1, 3, H, W) preprocessed tensor on the correct device.
        Returns:
            cam: (H, W) heatmap in [0, 1]
            ref_score: scalar referable-DR probability
        """
        self.model.eval()
        x = x.clone().requires_grad_(True)

        feats_map, pooled = self.model.forward_features_for_cam(x)
        outputs = self.model.head(pooled)

        T_clamp = max(_temperature, 0.05)
        if STAGE3_USE_ORDINAL:
            probs = coral_probs(outputs / T_clamp)
        else:
            probs = F.softmax(outputs / T_clamp, dim=1)

        ref_score = probs[:, REFERABLE_GRADE_CUTOFF:].sum()

        self.model.zero_grad()
        ref_score.backward()

        grads = self._gradients[0]  # (C, h, w)
        acts  = self._activations[0]  # (C, h, w)
        weights = grads.mean(dim=(1, 2))               # (C,)
        cam = torch.relu((weights[:, None, None] * acts).sum(dim=0))
        cam_np = cam.cpu().detach().numpy()
        cam_np = cam_np / (cam_np.max() + 1e-8)

        return cam_np, float(ref_score.item())


_gradcam: GradCAM | None = None


def get_gradcam() -> GradCAM:
    global _gradcam
    if _gradcam is None:
        _gradcam = GradCAM(load_model())
    return _gradcam


# ──────────────────────────────────────────────
# Inference
# ──────────────────────────────────────────────
@torch.no_grad()
def predict_grade(image_rgb: np.ndarray) -> Dict:
    """
    Grade a fundus image for DR severity.

    Args:
        image_rgb: HxWx3 uint8 RGB (already quality-gated and optionally enhanced).

    Returns:
        {
          "icdr_grade":           int (0-4),
          "icdr_label":           str,
          "class_probabilities":  {label: float, ...},
          "referable":            bool,
          "referable_probability":float,
          "referable_threshold":  float,
        }
    """
    load_model()
    pil_img = Image.fromarray(image_rgb)
    tensor  = _eval_transform(pil_img).unsqueeze(0).to(_device)

    outputs = _model(tensor)
    T_clamp = max(_temperature, 0.05)
    if STAGE3_USE_ORDINAL:
        probs_t = coral_probs(outputs / T_clamp)
    else:
        probs_t = F.softmax(outputs / T_clamp, dim=1)

    probs_np  = probs_t.squeeze(0).cpu().numpy()
    grade     = int(probs_np.argmax())
    ref_prob  = float(probs_np[REFERABLE_GRADE_CUTOFF:].sum())
    referable = ref_prob >= _ref_threshold

    return {
        "icdr_grade":            grade,
        "icdr_label":            STAGE3_GRADE_LABELS[grade],
        "class_probabilities":   {STAGE3_GRADE_LABELS[i]: float(p) for i, p in enumerate(probs_np)},
        "referable":             bool(referable),
        "referable_probability": ref_prob,
        "referable_threshold":   _ref_threshold,
    }


def compute_gradcam_overlay(image_rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Compute Grad-CAM for one image.

    Returns:
        cam_raw:  (H, W) float heatmap [0,1]
        overlay:  HxWx3 uint8 RGB overlay image
        ref_score: referable-DR probability
    """
    pil_img = Image.fromarray(image_rgb)
    tensor  = _eval_transform(pil_img).unsqueeze(0).to(_device)

    gradcam = get_gradcam()
    cam_raw, ref_score = gradcam(tensor)

    # Resize cam to match display image
    h, w = image_rgb.shape[:2]
    cam_resized = cv2.resize(cam_raw, (w, h))
    heatmap = cv2.applyColorMap(np.uint8(255 * cam_resized), cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    overlay = np.uint8(image_rgb * (1 - GRADCAM_ALPHA) + heatmap * GRADCAM_ALPHA)

    return cam_raw, overlay, ref_score
