"""
Central configuration for NeuroSense.

All paths are resolved relative to this file's location (not the current
working directory), so the app runs correctly no matter where `uvicorn`
is launched from — a common deployment gotcha.

Values that differ between local dev and production (CORS origins, debug
mode) are read from environment variables with sensible local defaults.
See .env.example for the full list.
"""

import os
from pathlib import Path

# ── Base paths ────────────────────────────────────────────────────────────
# backend/config.py -> backend/ -> project root
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

ARTIFACTS_DIR = PROJECT_ROOT / "Artifacts"
STATIC_DIR = PROJECT_ROOT / "static"

MODEL_PATH = ARTIFACTS_DIR / "BiGRU_Model.keras"
TOKENIZER_PATH = ARTIFACTS_DIR / "tokenizer.pkl"

# ── Model / NLP constants ───────────────────────────────────────────────
# These describe the ALREADY-TRAINED model. They must stay in sync with
# how the model was trained — changing them does not change model
# behaviour, it will just make preprocessing wrong.
MAX_SEQUENCE_LENGTH = 50
EMOTION_LABELS = ["sadness", "joy", "love", "anger", "fear", "surprise"]

EMOTION_EMOJIS = {
    "sadness": "😢",
    "joy": "😄",
    "love": "❤️",
    "anger": "😠",
    "fear": "😨",
    "surprise": "😲",
}

# Verified directly from the loaded model (see /model-info) — used only
# for display, never invented.
MODEL_METADATA = {
    "architecture": "Bidirectional GRU",
    "framework": "TensorFlow / Keras",
    "task": "Multi-class text emotion classification",
    "num_classes": len(EMOTION_LABELS),
    "sequence_length": MAX_SEQUENCE_LENGTH,
    "preprocessing": "Lowercasing, punctuation stripping, tokenization, post-padding",
}

# ── Environment-driven settings ─────────────────────────────────────────
def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]

# Comma-separated list, e.g. "https://neurosense.app,https://www.neurosense.app"
# Defaults to permissive localhost origins for local development only.
CORS_ORIGINS = _split_csv(
    os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000",
    )
)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT.lower() == "production"

# Max characters accepted for a single prediction request.
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "2000"))
