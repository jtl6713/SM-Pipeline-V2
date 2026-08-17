# ChicagoShining Frame Extractor

Local Python/FFmpeg frame extraction service used by SM Pipeline V2.

- Local port: `3334`
- Local health: `http://localhost:3334/health`
- Permanent route: `https://frames.chicagoshining.com`
- Runtime folder: `D:\Content Creation\ChicagoShining Pipeline\Services\Frame_Extractor`

Endpoints: `GET /health`, `POST /extract`, `GET /frames/<job>/<frame>.jpg`.

Runtime-only `.venv/`, `work/` and `public/frames/` are intentionally excluded from Git. The obsolete Quick Tunnel launcher from the historical source archive is not promoted to current authority because production uses the permanent route.

See `docs/LOCAL_SERVICE_ARTIFACT_CLEANUP_TODO.md` for the planned transaction-aware + TTL cleanup design.
