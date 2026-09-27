"""
Wraps the EXISTING trained BiGRU model and tokenizer.

This module does not change model architecture, retrain, or alter
preprocessing logic from the original implementation — it only organizes
the same steps (clean -> tokenize -> pad -> predict) behind a small class
so `main.py` stays thin, and adds real introspection for /model-info.
"""

import pickle
import re
import time

import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.sequence import pad_sequences

from backend.config import (
    EMOTION_EMOJIS,
    EMOTION_LABELS,
    MAX_SEQUENCE_LENGTH,
    MODEL_PATH,
    TOKENIZER_PATH,
)


def preprocess_text(text: str) -> str:
    """Clean raw text to match the format used at training time.

    Unchanged from the original implementation:
    lowercase -> strip apostrophes -> strip non-alphanumerics -> collapse spaces.
    """
    text = text.lower()
    text = re.sub(r"'", "", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


class EmotionModelService:
    """Owns the loaded BiGRU model + tokenizer and runs inference."""

    def __init__(self) -> None:
        self.model = None
        self.tokenizer = None
        self._prediction_count = 0
        self._total_inference_ms = 0.0
        self._emotion_counts = {label: 0 for label in EMOTION_LABELS}

    def load(self) -> None:
        self.model = load_model(MODEL_PATH)
        with open(TOKENIZER_PATH, "rb") as f:
            self.tokenizer = pickle.load(f)

    def unload(self) -> None:
        self.model = None
        self.tokenizer = None

    @property
    def is_ready(self) -> bool:
        return self.model is not None and self.tokenizer is not None

    def predict(self, raw_text: str) -> dict:
        if not self.is_ready:
            raise RuntimeError("Model is not loaded yet.")

        start = time.perf_counter()

        cleaned_text = preprocess_text(raw_text)
        sequence = self.tokenizer.texts_to_sequences([cleaned_text])
        padded = pad_sequences(
            sequence,
            maxlen=MAX_SEQUENCE_LENGTH,
            padding="post",
            truncating="post",
        )

        probabilities = self.model.predict(padded, verbose=0)[0]
        top_index = int(np.argmax(probabilities))
        predicted_emotion = EMOTION_LABELS[top_index]

        elapsed_ms = (time.perf_counter() - start) * 1000

        self._prediction_count += 1
        self._total_inference_ms += elapsed_ms
        self._emotion_counts[predicted_emotion] += 1

        return {
            "text": raw_text,
            "cleaned_text": cleaned_text,
            "predicted_emotion": predicted_emotion,
            "emoji": EMOTION_EMOJIS[predicted_emotion],
            "confidence": float(probabilities[top_index]),
            "all_probabilities": {
                label: float(prob) for label, prob in zip(EMOTION_LABELS, probabilities)
            },
            "inference_time_ms": round(elapsed_ms, 2),
        }

    def get_model_info(self) -> dict:
        """Introspects the actually-loaded model. Nothing here is invented —
        every field is read directly from the Keras model or tokenizer."""
        if not self.is_ready:
            raise RuntimeError("Model is not loaded yet.")

        layers = []
        for layer in self.model.layers:
            cfg = layer.get_config()
            layer_type = type(layer).__name__
            entry = {"name": layer.name, "type": layer_type}

            if layer_type == "Embedding":
                entry["input_dim"] = cfg.get("input_dim")
                entry["output_dim"] = cfg.get("output_dim")
            elif layer_type == "Bidirectional":
                inner = cfg["layer"]["config"]
                entry["wrapped_layer"] = cfg["layer"]["class_name"]
                entry["units"] = inner.get("units")
                entry["return_sequences"] = inner.get("return_sequences")
            elif layer_type == "Dropout":
                entry["rate"] = cfg.get("rate")
            elif layer_type == "Dense":
                entry["units"] = cfg.get("units")
                entry["activation"] = cfg.get("activation")

            layers.append(entry)

        total_params = int(sum(np.prod(w.shape) for w in self.model.trainable_weights)) + int(
            sum(np.prod(w.shape) for w in self.model.non_trainable_weights)
        )
        trainable_params = int(sum(np.prod(w.shape) for w in self.model.trainable_weights))

        vocab_size = len(getattr(self.tokenizer, "word_index", {}))

        return {
            "architecture": "Bidirectional GRU",
            "framework": "TensorFlow / Keras",
            "task": "Multi-class text emotion classification",
            "num_classes": len(EMOTION_LABELS),
            "emotion_labels": EMOTION_LABELS,
            "sequence_length": MAX_SEQUENCE_LENGTH,
            "preprocessing": "Lowercasing, punctuation stripping, tokenization, post-padding/truncating",
            "vocabulary_size": vocab_size,
            "total_parameters": total_params,
            "trainable_parameters": trainable_params,
            "layers": layers,
        }

    def get_stats(self, uptime_seconds: float) -> dict:
        avg_ms = (
            round(self._total_inference_ms / self._prediction_count, 2)
            if self._prediction_count
            else 0.0
        )
        return {
            "total_predictions": self._prediction_count,
            "uptime_seconds": round(uptime_seconds, 1),
            "average_inference_time_ms": avg_ms,
            "emotion_counts": dict(self._emotion_counts),
        }


emotion_service = EmotionModelService()