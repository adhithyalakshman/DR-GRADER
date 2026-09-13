"""Image utility functions shared across pipeline stages."""
from __future__ import annotations

import base64
import io
from typing import Optional

import cv2
import numpy as np
from PIL import Image

from app.config import CLAHE_CLIP_LIMIT, CLAHE_TILE_GRID, ILLUM_SIGMA


def read_image_rgb(file_bytes: bytes) -> np.ndarray:
    """Decode uploaded bytes to HxWx3 uint8 RGB numpy array."""
    arr = np.frombuffer(file_bytes, np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Could not decode image — unsupported format or corrupted file.")
    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)


def clahe_illumination_normalize(img_bgr: np.ndarray) -> np.ndarray:
    """
    CLAHE + illumination normalization.
    Identical to Stage 1 notebook's enhancement function — kept in sync deliberately.
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID)
    l_eq = clahe.apply(l)
    img_clahe = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)

    b_ch, g_ch, r_ch = cv2.split(img_clahe)
    g_blur = cv2.GaussianBlur(g_ch, (0, 0), sigmaX=ILLUM_SIGMA)
    g_norm = cv2.divide(g_ch.astype(np.float32), g_blur.astype(np.float32) + 1e-6)
    g_norm = np.clip(g_norm * 128, 0, 255).astype(np.uint8)
    return cv2.merge([b_ch, g_norm, r_ch])


def enhance_usable_image(img_rgb: np.ndarray) -> np.ndarray:
    """Apply CLAHE + illumination normalization to a 'Usable' image (RGB in, RGB out)."""
    img_bgr     = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    enhanced_bgr = clahe_illumination_normalize(img_bgr)
    return cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2RGB)


def laplacian_blur_score(img_rgb: np.ndarray) -> float:
    """Variance of Laplacian — low value = blurry."""
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def histogram_spread_score(img_rgb: np.ndarray) -> float:
    """
    Mean standard deviation across histogram quadrants — low value = poor illumination.
    Splits image into 4 quadrants and returns average brightness std.
    """
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    quads = [
        gray[:h//2, :w//2], gray[:h//2, w//2:],
        gray[h//2:, :w//2], gray[h//2:, w//2:],
    ]
    return float(np.mean([q.std() for q in quads]))


def encode_image_b64(img_rgb: np.ndarray, fmt: str = "PNG") -> str:
    """Encode RGB numpy array to base64 data-URI string."""
    pil = Image.fromarray(img_rgb)
    buf = io.BytesIO()
    pil.save(buf, format=fmt)
    enc = base64.b64encode(buf.getvalue()).decode("utf-8")
    mime = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{enc}"


def resize_to_canonical(arr: np.ndarray, size: int, is_mask: bool = False) -> np.ndarray:
    """Resize a 2D mask or 3-channel image to size×size."""
    interp = cv2.INTER_NEAREST if is_mask else cv2.INTER_LINEAR
    return cv2.resize(arr, (size, size), interpolation=interp)


def save_image(img_rgb: np.ndarray, path: str) -> None:
    """Save RGB image to disk."""
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    cv2.imwrite(path, img_bgr)
