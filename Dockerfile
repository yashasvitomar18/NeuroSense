# Pins the Python version directly, so this build no longer depends on
# Render's (or any platform's) native-runtime Python version detection —
# tensorflow-cpu==2.17.0 has no wheels for Python 3.13+, so we control
# the interpreter version ourselves.
FROM python:3.11-slim

WORKDIR /app

# System deps some TensorFlow wheels need at runtime for image/audio codecs
# used internally by its I/O ops. Kept minimal on purpose.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY Artifacts/ ./Artifacts/
COPY static/ ./static/

EXPOSE 8000

# Render (and most PaaS) inject $PORT at runtime; fall back to 8000 locally.
# We `cd backend` because main.py imports its sibling modules (config,
# schemas, services) as top-level names, not as a `backend.` package —
# so the working directory must be backend/ for those imports to resolve.
CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
