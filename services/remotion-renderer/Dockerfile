FROM node:20-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY remotion-renderer/package.json remotion-renderer/package-lock.json /app/
RUN npm ci
RUN npx remotion browser ensure
COPY remotion-renderer/ /app/

ENV PORT=3333 \
    PIPELINE_RUNNER_INTERNAL_URL=http://pipeline-runner:3350 \
    REMOTION_STALE_CLEANUP_HOURS=72 \
    REMOTION_STALE_SWEEP_INTERVAL_MS=3600000 \
    PUPPETEER_SKIP_DOWNLOAD=true

EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3333/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "render-server.js"]
