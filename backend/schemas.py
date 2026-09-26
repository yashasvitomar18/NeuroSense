from pydantic import BaseModel, Field


class TextInput(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The sentence to analyze",
        json_schema_extra={
            "example": "I feel so happy and excited"
        },
    )


class PredictionResponse(BaseModel):
    text: str
    cleaned_text: str
    predicted_emotion: str
    emoji: str
    confidence: float
    all_probabilities: dict[str, float]
    inference_time_ms: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    environment: str


class ModelLayerInfo(BaseModel):
    name: str
    type: str
    input_dim: int | None = None
    output_dim: int | None = None
    wrapped_layer: str | None = None
    units: int | None = None
    return_sequences: bool | None = None
    rate: float | None = None
    activation: str | None = None


class ModelInfoResponse(BaseModel):
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
    layers: list[ModelLayerInfo]


class StatsResponse(BaseModel):
    total_predictions: int
    uptime_seconds: float
    average_inference_time_ms: float
    emotion_counts: dict[str, int]