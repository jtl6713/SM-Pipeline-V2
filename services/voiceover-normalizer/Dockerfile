FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY voiceover-normalizer/ /app/

ENV PORT=3012 \
    FFMPEG_PATH=ffmpeg \
    FILE_TTL_MS=900000

EXPOSE 3012
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3012/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "voiceover-normalizer.js"]
