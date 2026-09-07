FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pipeline-runner/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY pipeline-runner/ /app/

ENV PORT=3350 \
    HOST=0.0.0.0 \
    ALLOW_DOCKER_INTERNAL=1 \
    PYTHONUNBUFFERED=1

EXPOSE 3350
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3350/health', timeout=4)"

CMD ["python", "app.py"]
