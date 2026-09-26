"""
NeuroSense — AI Emotion Intelligence Platform
FastAPI backend serving the trained BiGRU emotion classifier.

This preserves the original prediction pipeline exactly:
  text -> preprocess -> tokenizer -> pad_sequences -> BiGRU -> probabilities
The only changes from the original main.py are structural (config split
out, schemas split out, model logic wrapped in a service class) plus two
new read-only endpoints (/model-info, /stats) and configurable CORS.
"""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import CORS_ORIGINS, ENVIRONMENT, STATIC_DIR
from schemas import (
    HealthResponse,
    ModelInfoResponse,
    PredictionResponse,
    StatsResponse,
    TextInput,
)
from services.model_service import emotion_service

_server_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading BiGRU model and tokenizer...")
    emotion_service.load()
    print("Model loaded successfully.")

    yield

    emotion_service.unload()


app = FastAPI(
    title="NeuroSense API",
    description="Inference API for the NeuroSense BiGRU emotion classifier.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
def serve_ui():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(
        status="Server is running",
        model_loaded=emotion_service.is_ready,
        environment=ENVIRONMENT,
    )


@app.post(
    "/predict",
    response_model=PredictionResponse,
    responses={503: {"description": "Model not loaded"}},
)
def predict_emotion(text_input: TextInput):
    if not emotion_service.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded yet. Please try again in a moment.",
        )

    try:
        result = emotion_service.predict(text_input.text)
    except Exception:
        # Never leak internal stack traces to the client.
        raise HTTPException(
            status_code=500,
            detail="Something went wrong while analyzing the text. Please try again.",
        )

    return PredictionResponse(**result)


@app.get("/model-info", response_model=ModelInfoResponse)
def model_info():
    if not emotion_service.is_ready:
        raise HTTPException(status_code=503, detail="Model is not loaded yet.")
    return ModelInfoResponse(**emotion_service.get_model_info())


@app.get("/stats", response_model=StatsResponse)
def stats():
    uptime = time.time() - _server_start_time
    return StatsResponse(**emotion_service.get_stats(uptime))
