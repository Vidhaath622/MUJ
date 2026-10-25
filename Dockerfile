# RAGSeal backend (FastAPI + engine) for a host without Ollama: the generator, the judge and the
# embeddings are hosted models chosen by environment variables (see render.yaml and backend/HOSTING.md).
#
#   docker build -t ragseal-api .
#   docker run -p 8000:8000 --env-file backend/.env -e RAGSEAL_GENERATOR_PROVIDER=groq \
#     -e RAGSEAL_EMBED_PROVIDER=nvidia -e RAGSEAL_JUDGE_PROVIDER=groq -v ragseal-data:/data ragseal-api
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# tesseract reads image-only PDF pages (OCR); everything else is pure Python wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt /app/requirements-backend.txt
COPY engine/requirements.txt /app/requirements-engine.txt
RUN pip install -r requirements-backend.txt -r requirements-engine.txt

COPY engine /app/engine
COPY backend /app/backend

# Hosted models by default; every one can be overridden at deploy time.
ENV RAGSEAL_BACKEND_DATA=/data \
    RAGSEAL_GENERATOR_PROVIDER=groq \
    RAGSEAL_JUDGE_PROVIDER=groq \
    RAGSEAL_EMBED_PROVIDER=nvidia \
    RAGSEAL_JUDGE_FALLBACK_PROVIDER=none \
    PORT=8000

RUN useradd --create-home --uid 10001 ragseal && mkdir -p /data && chown ragseal /data
USER ragseal
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/health', timeout=8)"

CMD ["sh", "-c", "exec uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
