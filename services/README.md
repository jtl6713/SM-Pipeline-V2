# Local Services Source Authority

This directory contains **source code and reproducible configuration only** for local SM Pipeline V2 services.

## Authority model

- GitHub `services/`: editable source authority for local service code that has been captured from the live Windows service host and verified.
- `D:\Content Creation\ChicagoShining Pipeline\Services\...`: production runtime location on the Windows host.
- Runtime dependencies, secrets, virtual environments, generated media, caches, logs, backups, and temporary files are never committed.

## Captured services

| Service | GitHub path | Local runtime path | Port | Status |
| --- | --- | --- | ---: | --- |
| Frame Extractor | `services/frame-extractor/` | `Services\Frame_Extractor` after relocation | 3334 | Source captured from the 2026-08-17 live-folder archive. |
| Remotion Renderer | `services/remotion-renderer/` | `Services\Remotion_Renderer` | 3333 | Authoritative source captured after Item 3 native-overlap acceptance. |
| Watermark | _pending live capture_ | current local service host | 3011 | Do not promote an older archive to authority. |
| Voiceover Normalizer | _pending live capture_ | `Services\voiceover-normalizer\service` | 3012 | Do not promote an older archive to authority. |
| YouTube Uploader | _pending live capture_ | `Services\youtube-uploader\service` | 3340 | Do not promote an older archive to authority; `.env` must never be committed. |

## Source-only rule

Examples of files that belong in Git:

- Python/JavaScript/TypeScript source
- `package.json` / lockfiles / `requirements.txt`
- non-secret config templates
- service-specific README/runbook files

Examples that do **not** belong in Git:

- `node_modules/`, `.venv/`, `venv/`
- `.env` or tokens/credentials
- `public/frames/`, `work/`, Remotion `out/`, `render-assets/`, `render-props/`
- rendered images/video/audio
- logs, caches, local backups, ZIPs

## Future GitHub -> local deployment path

The target is a guarded, one-service-at-a-time deployment mechanism rather than an automatic blind pull:

1. Select an exact Git commit/ref.
2. Compare live source hashes with the expected pre-deploy baseline.
3. Back up the live source files only.
4. Copy source from Git without touching secrets or runtime media.
5. Reinstall dependencies only when dependency manifests changed.
6. Restart exactly one local service.
7. Verify local and permanent public health endpoints.
8. Roll back automatically if any gate fails.
9. Record deployed commit SHA locally.

A Windows self-hosted GitHub Actions runner with protected/manual deployment is the preferred future implementation. Until that is deliberately installed and hardened, GitHub is source authority but not an unattended production deployment trigger.
