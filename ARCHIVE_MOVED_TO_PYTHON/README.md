# ARCHIVE_MOVED_TO_PYTHON

Make.com scenarios replaced by `services/pipeline-runner/` (Python on `pipeline.chicagoshining.com`).

| Stage | Make scenario ID | Python path | Archived blueprint | Production |
| --- | --- | --- | --- | --- |
| SMV1 | 5894885 | `POST /stages/smv1` | `smv1-5894885-studio-media-variant-worker.json` | Python |
| R2 | 5569495 | `POST /stages/r2` | `r2-5569495-auto-asset-selection.json` | Python |
| R3 | 5557966 | `POST /stages/r3` | `r3-5557966-deterministic-render-prep.json` | Python |
| R4 | 5556716 | `POST /stages/r4` | `r4-5556716-start-remotion-render.json` | Python |
| R5 | 5565333 | `POST /stages/r5` | `r5-5565333-render-poller-final-upload.json` | Python |

Wave 2 cutover guide: `WAVE2_R3_R4_R5.md`

## Cutover (2026-08-23)

Worker env vars:

```
STAGE_BACKEND_SMV1=python
STAGE_BACKEND_R2=python
STAGE_BACKEND_R3=python
STAGE_BACKEND_R4=python
STAGE_BACKEND_R5=python
PIPELINE_RUNNER_URL=https://pipeline.chicagoshining.com
PIPELINE_RUNNER_SHARED_SECRET=<secret>
```

Make scenarios **5557966**, **5556716**, and **5565333** are **inactive** as of Wave 2 cutover. Reactivate only for emergency rollback.

## Rollback

1. Set `STAGE_BACKEND_SMV1=make` and/or `STAGE_BACKEND_R2=make` on `chicagoshining-studio-api`
2. Reactivate archived scenarios in Make from blueprints in this folder
3. Redeploy Worker without Python routing (or leave routing; Make wins when vars unset)

## Archive manifest

See `MANIFEST.json` for archive metadata and deactivation status.
