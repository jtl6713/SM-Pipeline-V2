FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY _shared/scratch_ttl.py /app/scratch_ttl.py
COPY timing-engine/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY timing-engine/ /app/

ENV PORT=3336 \
    HOST=0.0.0.0 \
    WORK_DIR=/scratch/work \
    TIMING_ENGINE_TTL_HOURS=24 \
    PYTHONUNBUFFERED=1

EXPOSE 3336
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3336/health', timeout=4)"

CMD ["python", "app.py"]
