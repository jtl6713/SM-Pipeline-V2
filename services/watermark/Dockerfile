FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY watermark/package.json watermark/package-lock.json /app/
RUN npm ci --omit=dev
COPY watermark/ /app/

ENV PORT=3011
EXPOSE 3011
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3011/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
