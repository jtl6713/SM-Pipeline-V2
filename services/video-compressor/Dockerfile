FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY video-compressor/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY video-compressor/ /app/
COPY _shared/scratch_ttl.py /app/scratch_ttl.py

ENV PORT=3335 \
    HOST=0.0.0.0 \
    WORK_DIR=/scratch/work \
    OUTPUT_DIR=/scratch/compressed \
    MAX_CONCURRENT_JOBS=1 \
    VIDEO_COMPRESSOR_TTL_HOURS=24 \
    PYTHONUNBUFFERED=1

EXPOSE 3335
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3335/health', timeout=4)"

CMD ["python", "app.py"]
