# Timing Engine

Local FastAPI + Librosa service that turns music (and later other timing sources) into one Remotion-ready transition timeline.

- Local port: `3336`
- Local health: `http://localhost:3336/health`
- Planned public route: `https://timing.chicagoshining.com`
- Runtime folder: `D:\Content Creation\ChicagoShining Pipeline\Services\timing-engine\service`
- START / STOP / VERIFY tab: `8 LOC Timing Engine :3336` (operator scripts live in `Source Control\Production-Start-Stop-Verify-Services`, not under `Services\`)

Endpoints: `GET /health`, `POST /timeline`.

`POST /timeline` accepts `music_url` or a local `music_path` written by pipeline-runner after a Drive download. Only the requested playback window is analyzed. Beat detection is one `TimingSource`; the response is always a Transition Timeline.

Runtime-only `.venv/` and `work/` are excluded from Git. Do not persist analyzed audio on R2.
