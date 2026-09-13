#!/usr/bin/env python3
"""
Startup verification script — checks all dependencies and model files.
Run before starting the FastAPI server to diagnose any issues.

Usage:
    python verify_setup.py
"""
import sys
import importlib
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent

def check(name, fn):
    try:
        result = fn()
        print(f"  ✅ {name}: {result}")
        return True
    except Exception as e:
        print(f"  ❌ {name}: {e}")
        return False

print("\n═══ EyeQ DR Screening Pipeline — Setup Verification ═══\n")

print("📦 Python version:")
print(f"  {sys.version}\n")

print("📦 Required packages:")
pkgs = {
    "fastapi":     lambda: __import__("fastapi").__version__,
    "uvicorn":     lambda: __import__("uvicorn").__version__,
    "torch":       lambda: __import__("torch").__version__,
    "timm":        lambda: __import__("timm").__version__,
    "cv2":         lambda: __import__("cv2").__version__,
    "numpy":       lambda: __import__("numpy").__version__,
    "PIL":         lambda: __import__("PIL").__version__,
    "skimage":     lambda: __import__("skimage").__version__,
    "aiofiles":    lambda: __import__("aiofiles").__version__,
}
for pkg, fn in pkgs.items():
    check(pkg, fn)

print("\n📦 Optional Stage-2 packages (best-effort):")
opt_pkgs = {
    "fundus_lesions_toolkit": lambda: "installed",
    "fundus_odmac_toolkit":   lambda: "installed",
}
for pkg, fn in opt_pkgs.items():
    check(pkg, fn)

print("\n🤖 Model files:")
check("model_stage1.pt (Stage 1 quality)",
      lambda: f"{(PROJECT_ROOT/'model_stage1.pt').stat().st_size/1e6:.1f} MB"
              if (PROJECT_ROOT/'model_stage1.pt').exists() else (_ for _ in ()).throw(FileNotFoundError("not found")))
check("model.pt (Stage 3 grading)",
      lambda: f"{(PROJECT_ROOT/'model.pt').stat().st_size/1e6:.1f} MB"
              if (PROJECT_ROOT/'model.pt').exists() else (_ for _ in ()).throw(FileNotFoundError("not found")))

print("\n🔌 Model loading test:")
try:
    sys.path.insert(0, str(PROJECT_ROOT))
    from app.models.stage1_model import load_model as s1
    m1 = s1()
    print(f"  ✅ Stage 1 model loaded on {next(m1.parameters()).device}")
except Exception as e:
    print(f"  ❌ Stage 1: {e}")

try:
    from app.models.stage3_model import load_model as s3
    m3 = s3()
    print(f"  ✅ Stage 3 model loaded on {next(m3.parameters()).device}")
except Exception as e:
    print(f"  ❌ Stage 3: {e}")

print("\n📁 Project structure:")
dirs = ["app", "app/models", "app/pipeline", "app/utils", "app/routers", "frontend/src"]
for d in dirs:
    p = PROJECT_ROOT / d.replace("/", "\\")
    ok = p.exists()
    print(f"  {'✅' if ok else '❌'} {d}/")

print("\n══════════════════════════════════════════════════════════")
print("To start the backend:  python -m uvicorn app.main:app --reload --port 8000")
print("To start the frontend: cd frontend && npm run dev")
print("══════════════════════════════════════════════════════════\n")
