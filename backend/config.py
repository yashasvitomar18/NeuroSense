import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

ARTIFACTS_DIR = PROJECT_ROOT / "Artifacts"
STATIC_DIR = PROJECT_ROOT / "static"

MODEL_PATH = ARTIFACTS_DIR / "BiGRU_Model.keras"
TOKENIZER_PATH = ARTIFACTS_DIR / "tokenizer.pkl"

MAX_SEQUENCE_LENGTH = 50

EMOTION_LABELS = [
    "sadness",
    "joy",
    "love",
    "anger",
    "fear",
    "surprise",
]

EMOTION_EMOJIS = {
    "sadness": "😢",
    "joy": "😄",
    "love": "❤️",
    "anger": "😠",
    "fear": "😨",
    "surprise": "😲",
}

MODEL_METADATA = {
    "architecture": "Bidirectional GRU",
    "framework": "TensorFlow / Keras",
    "task": "Multi-class text emotion classification",
    "num_classes": len(EMOTION_LABELS),
    "sequence_length": MAX_SEQUENCE_LENGTH,
    "preprocessing": (
        "Lowercasing, punctuation stripping, tokenization, "
        "post-padding/truncating"
    ),
}


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


CORS_ORIGINS = _split_csv(
    os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "http://localhost:8000,"
        "http://127.0.0.1:8000",
    )
)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

IS_PRODUCTION = ENVIRONMENT.lower() == "production"

MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "2000"))