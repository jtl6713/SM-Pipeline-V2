FROM python:3.12-slim-bookworm

WORKDIR /app
COPY scratch_ttl.py /app/scratch_ttl.py
COPY sweep.py /app/sweep.py

ENV SCRATCH_ROOT=/scratch \
    FRAME_EXTRACTOR_TTL_HOURS=24 \
    VIDEO_COMPRESSOR_TTL_HOURS=24 \
    TIMING_ENGINE_TTL_HOURS=24 \
    REMOTION_STALE_CLEANUP_HOURS=72 \
    YOUTUBE_JOB_RETENTION_HOURS=24 \
    PYTHONUNBUFFERED=1

CMD ["python", "sweep.py"]
