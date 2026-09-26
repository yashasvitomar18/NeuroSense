"""
NeuroSense — AI Emotion Intelligence Platform

FastAPI backend for the trained BiGRU emotion classifier.

Pipeline:
Text → Preprocessing → Tokenizer → Padding → BiGRU → Probabilities
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

# Keep model service isolated from the FastAPI application.
# TensorFlow/model loading happens inside the service.
from services.model_service import emotion_service


_server_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle.

    The model is loaded once when the server starts and
    released when the server shuts down.
    """

    print("=" * 50)
    print("NeuroSense API starting...")
    print("=" * 50)

    try:
        print("Loading BiGRU model and tokenizer...")

        emotion_service.load()

        print("BiGRU model loaded successfully.")
        print("NeuroSense API is ready.")

    except Exception as exc:
        print(f"Model loading failed: {exc}")
        raise

    yield

    print("Shutting down NeuroSense API...")

    try:
        emotion_service.unload()
        print("Model unloaded successfully.")
    except Exception as exc:
        print(f"Error while unloading model: {exc}")


app = FastAPI(
    title="NeuroSense API",
    description=(
        "AI-powered emotion intelligence API using "
        "a Bidirectional GRU neural network."
    ),
    version="2.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Static Frontend
# ---------------------------------------------------------

app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static",
)


# ---------------------------------------------------------
# Homepage
# ---------------------------------------------------------

@app.get("/", include_in_schema=False)
def serve_ui():
    """
    Serve the NeuroSense frontend.
    """
    return FileResponse(
        str(STATIC_DIR / "index.html")
    )


# ---------------------------------------------------------
# Health Check
# ---------------------------------------------------------

@app.get(
    "/health",
    response_model=HealthResponse,
)
def health_check():
    """
    Check API and model status.
    """

    return HealthResponse(
        status="Server is running",
        model_loaded=emotion_service.is_ready,
        environment=ENVIRONMENT,
    )


# ---------------------------------------------------------
# Emotion Prediction
# ---------------------------------------------------------

@app.post(
    "/predict",
    response_model=PredictionResponse,
    responses={
        503: {
            "description": "Model is not ready"
        },
        500: {
            "description": "Prediction failed"
        },
    },
)
def predict_emotion(
    text_input: TextInput,
):
    """
    Predict the emotion expressed in the input text.
    """

    # Make sure model is available
    if not emotion_service.is_ready:
        raise HTTPException(
            status_code=503,
            detail=(
                "The emotion model is not ready yet. "
                "Please try again shortly."
            ),
        )

    try:
        result = emotion_service.predict(
            text_input.text
        )

        return PredictionResponse(
            **result
        )

    except Exception as exc:
        # Log the real error server-side
        print(
            f"Prediction error: {type(exc).__name__}: {exc}"
        )

        # Do not expose internal details to users
        raise HTTPException(
            status_code=500,
            detail=(
                "Something went wrong while "
                "analyzing the text."
            ),
        )


# ---------------------------------------------------------
# Model Information
# ---------------------------------------------------------

@app.get(
    "/model-info",
    response_model=ModelInfoResponse,
)
def model_info():
    """
    Return information about the loaded BiGRU model.
    """

    if not emotion_service.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded yet.",
        )

    return ModelInfoResponse(
        **emotion_service.get_model_info()
    )


# ---------------------------------------------------------
# Statistics
# ---------------------------------------------------------

@app.get(
    "/stats",
    response_model=StatsResponse,
)
def stats():
    """
    Return runtime and prediction statistics.
    """

    uptime = (
        time.time() - _server_start_time
    )

    return StatsResponse(
        **emotion_service.get_stats(uptime)
    )