import pydantic


class TextInput(pydantic.BaseModel):
    text: str = pydantic.Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The sentence to analyze",
        json_schema_extra={
            "example": "I feel so happy and excited"
        },
    )


class PredictionResponse(pydantic.BaseModel):
    text: str
    cleaned_text: str
    predicted_emotion: str
    emoji: str
    confidence: float
    all_probabilities: dict[str, float]
    inference_time_ms: float


class HealthResponse(pydantic.BaseModel):
    status: str
    model_loaded: bool
    environment: str


class ModelLayerInfo(pydantic.BaseModel):
    name: str
    type: str
    input_dim: int | None = None
    output_dim: int | None = None
    wrapped_layer: str | None = None
    units: int | None = None
    return_sequences: bool | None = None
    rate: float | None = None
    activation: str | None = None


class ModelInfoResponse(pydantic.BaseModel):
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


class StatsResponse(pydantic.BaseModel):
    total_predictions: int
    uptime_seconds: float
    average_inference_time_ms: float
    emotion_counts: dict[str, int]