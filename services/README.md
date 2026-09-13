# Local Services Source Authority

This directory contains **source code and reproducible configuration only** for local SM Pipeline V2 services.

## Authority model

- GitHub `services/`: approved editable source authority for the local services.
- `D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2`: local Git checkout only; production does not run from this folder.
- `D:\Content Creation\ChicagoShining Pipeline\Services\...`: production runtime location on the Windows host.
- Runtime dependencies, secrets, virtual environments, generated media, caches, logs, backups, runtime job state, and temporary files are never committed.

Linux/ARM containers for a free-tier VM live next to each service (`Dockerfile`) and are composed from [`deploy/cloud-vm/`](../deploy/cloud-vm/README.md). Windows START/STOP/VERIFY remains production until that cutover. Scratch TTL lives in [`services/_shared/scratch_ttl.py`](_shared/scratch_ttl.py); see [`_shared/README.md`](_shared/README.md) for the vendored copies Windows deploy and the cloud-vm sidecar still need.

## Captured and managed services

| Service | GitHub path | Local runtime path | Port | Status |
| --- | --- | --- | ---: | --- |
| Frame Extractor | `services/frame-extractor/` | `Services\Frame_Extractor` | 3334 | Source captured and controlled deployment validated. |
| Timing Engine | `services/timing-engine/` | `Services\timing-engine\service` | 3336 | FastAPI + Librosa; `POST /timeline` returns a Remotion edit plan. |
| Remotion Renderer | `services/remotion-renderer/` | `Services\Remotion_Renderer` | 3333 | Authoritative source captured after Item 3 native-overlap acceptance; controlled deployment validated. |
| Watermark | `services/watermark/` | `Services\Watermark` | 3011 | Source captured; PLAN/deploy/rollback/redeploy proof completed. |
| Voiceover Normalizer | `services/voiceover-normalizer/` | `Services\voiceover-normalizer\service` | 3012 | Source captured and controlled deployment validated. |
| YouTube Uploader | `services/youtube-uploader/` | `Services\youtube-uploader\service` | 3340 | Source captured and controlled deployment validated; `.env`, OAuth material, and runtime job data remain local only. |
| YouTube Uploader NYC | `services/youtube-uploader/` | `Services\youtube-uploader-nyc\service` | 3342 | Same Git source as Chicago; separate `.env` refresh token and `data/youtube-jobs.json`. Public route `youtube-upload-nyc.chicagoshining.com`. |
| Pipeline Runner | `services/pipeline-runner/` | `Services\pipeline-runner\service` | 3350 | Source controlled; retain existing deployment/health contract. |
| Video Compressor | `services/video-compressor/` | `Services\Video_Compressor` | 3335 | Deployed and integrated with central start/stop/verify; authenticated private-Drive A1 compression proven end to end. |
| Ops Dashboard | `services/ops-dashboard/` | `Services\ops-dashboard` | 3361 | Operator site for START/STOP/VERIFY/SYNC/PLAN/DEPLOY. Local `:3361`; optional `ops.chicagoshining.com` behind Cloudflare Access + token. |

## Source-only rule

Examples of files that belong in Git:

- Python/JavaScript/TypeScript source
- `package.json` / lockfiles / `requirements.txt`
- non-secret config templates
- service-specific README/runbook files

Examples that do **not** belong in Git:

- `node_modules/`, `.venv/`, `venv/`
- `.env` or tokens/credentials
- `public/frames/`, `public/compressed/`, `work/`, Remotion temp/output working directories
- YouTube runtime `data/youtube-jobs.json`
- rendered images/video/audio
- logs, caches, local backups, ZIPs

## GitHub -> local deployment path

The guarded deployment framework is implemented under:

`deploy/local-services/`

It:

1. selects an exact approved Git commit;
2. requires a clean local checkout and fast-forwards `main`;
3. materializes the exact commit in an isolated Git worktree;
4. verifies baseline service health;
5. backs up the current live source;
6. copies source without touching secrets/runtime state;
7. reinstalls dependencies only when required/missing;
8. restarts exactly one local service;
9. verifies local and permanent public health endpoints;
10. records the deployed commit SHA locally;
11. automatically attempts rollback if deployment fails.

Use the full runbook:

`Documentation/GITHUB_SOURCE_CONTROL_AND_LOCAL_SERVICE_DEPLOYMENT_RUNBOOK.md`

The Video Compressor installer and central start/stop/verify integration are under `deploy/local-services/`. Its live runtime and `compress.chicagoshining.com` route are validated. It remains outside the general `Deploy-SMService.ps1` selector, so compressor source updates use the dedicated installer/integration workflow until that selector is extended.

A self-hosted GitHub Actions runner may be considered later, but it is **not** required for the current proven manual/guarded deployment model and should not be introduced without a separate security and operational design.
