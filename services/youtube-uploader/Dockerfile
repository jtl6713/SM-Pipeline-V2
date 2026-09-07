FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY youtube-uploader/package.json /app/package.json
COPY youtube-uploader/ /app/

ENV PORT=3340 \
    YOUTUBE_TEMP_DIR=/scratch/tmp \
    YOUTUBE_JOB_STORE=/scratch/data/youtube-jobs.json \
    YOUTUBE_JOB_RETENTION_HOURS=24

EXPOSE 3340
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3340/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "youtube-upload-service.js"]
