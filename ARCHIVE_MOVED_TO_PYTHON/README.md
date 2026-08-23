# ARCHIVE_MOVED_TO_PYTHON

Make.com scenarios replaced by `services/pipeline-runner/` (Python on `pipeline.chicagoshining.com`).

| Stage | Make scenario ID | Python path | Archived blueprint |
| --- | --- | --- | --- |
| SMV1 | 5894885 | `POST /stages/smv1` | `smv1-5894885-studio-media-variant-worker.json` |
| R2 | 5569495 | `POST /stages/r2` | `r2-5569495-auto-asset-selection.json` |

## Cutover (2026-08-23)

Worker env vars:

```
STAGE_BACKEND_SMV1=python
STAGE_BACKEND_R2=python
PIPELINE_RUNNER_URL=https://pipeline.chicagoshining.com
PIPELINE_RUNNER_SHARED_SECRET=<secret>
```

After deploy, Make scenarios **5894885** and **5569495** should remain **inactive**. Reactivate only for emergency rollback.

## Rollback

1. Set `STAGE_BACKEND_SMV1=make` and/or `STAGE_BACKEND_R2=make` on `chicagoshining-studio-api`
2. Reactivate archived scenarios in Make from blueprints in this folder
3. Redeploy Worker without Python routing (or leave routing; Make wins when vars unset)

## Archive manifest

See `MANIFEST.json` for archive metadata and deactivation status.
