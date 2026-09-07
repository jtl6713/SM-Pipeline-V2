FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY _shared/scratch_ttl.py /app/scratch_ttl.py
COPY frame-extractor/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY frame-extractor/ /app/

ENV PORT=3334 \
    HOST=0.0.0.0 \
    WORK_DIR=/scratch/work \
    FRAME_DIR=/scratch/frames \
    FRAME_EXTRACTOR_TTL_HOURS=24 \
    PYTHONUNBUFFERED=1

EXPOSE 3334
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3334/health', timeout=4)"

CMD ["python", "app.py"]
