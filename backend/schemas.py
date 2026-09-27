"""Request/response models for the NeuroSense API."""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.config import MAX_TEXT_LENGTH


class _NoProtectedNamespace(BaseModel):
    """Base class silencing Pydantic's 'model_' prefix warning — our schemas
    legitimately use fields like `model_loaded` that have nothing to do with
    Pydantic's own internals."""

    model_config = ConfigDict(protected_namespaces=())


class TextInput(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=MAX_TEXT_LENGTH,
        description="The sentence to analyze",
        json_schema_extra={"example": "I feel so happy and excited"},
    )

    @field_validator("text")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text cannot be empty or whitespace only.")
        return value


class PredictionResponse(BaseModel):
    text: str
    cleaned_text: str
    predicted_emotion: str
    emoji: str
    confidence: float
    all_probabilities: dict[str, float]
    inference_time_ms: float


class HealthResponse(_NoProtectedNamespace):
    status: str
    model_loaded: bool
    environment: str


class ModelInfoResponse(_NoProtectedNamespace):
    architecture: str
    framework: str
    task: str
    num_classes: int
    emotion_labels: list[str]
    sequence_length: int
    preprocessing: str
    vocabulary_size: int
    total_parameters: int
    trainable_parameters: int
    layers: list[dict]


class StatsResponse(BaseModel):
    total_predictions: int
    uptime_seconds: float
    average_inference_time_ms: float
    emotion_counts: dict[str, int]


class ErrorResponse(BaseModel):
    detail: str
