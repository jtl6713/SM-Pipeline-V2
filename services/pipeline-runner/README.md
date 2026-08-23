# pipeline-runner

Python stage workers that replace Make.com scenarios for SM Pipeline V2.

- **Git path:** `services/pipeline-runner/`
- **Runtime path:** `D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service`
- **Local port:** `3350`
- **Stack:** Flask + requests (same pattern as Frame Extractor)
- **Local health:** `http://localhost:3350/health`
- **Public route:** `https://pipeline.chicagoshining.com` (Cloudflare Tunnel)
- **Make scenarios (migration order):** SMV1 `5894885`, R2 `5569495`

## Status

| Stage | Python | Make fallback | Notes |
| --- | --- | --- | --- |
| **SMV1** | Implemented | Default until `STAGE_BACKEND_SMV1=python` | Full queue drain |
| **R2** | Scaffold | Default until `STAGE_BACKEND_R2=python` | Fail-fast + eligibility; OpenAI (modules 7–9) still on Make |

Other stages return `501 not_implemented`.

## Quick start (dev)

```powershell
cd "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2\services\pipeline-runner"
copy .env.example .env
# Edit .env — AIRTABLE_PAT, Google Drive OAuth, pipeline secret
.\start-pipeline-runner.bat
```

Verify:

```powershell
curl http://localhost:3350/health
curl http://localhost:3350/stages
python -m pytest tests/
```

## SMV1 behavior

One `POST /stages/smv1` == one queue row (matches Make Module 1 `maxRecords=1`).

| Queue state | Action |
| --- | --- |
| Master Original + Pending | CDN staging → Google Drive → Media Asset |
| Platform Variant + Pending | Drive source → `fill-crop-v2` → Drive → Media Asset |
| Platform Variant + Drive Uploaded | Media Asset registration |
| Ready + Preview Pending | Drive → R2 preview cache |

Batch drain: `POST /stages/smv1/drain` with `extra.max_runs` (default 8).

## R2 behavior (scaffold)

One `POST /stages/r2` == one Platform Output (Make module 1 `maxRecords=1`).

| Path | Python | Make pointer |
| --- | --- | --- |
| Eligibility + candidate gather | Yes | Module 1 formula in `r2/formulas.py` |
| Zero video candidates | Yes (fail-fast + P4 webhook) | Modules 14, 21 |
| Canonical OpenAI selection | **Deferred** | Modules 7, 8, 9 on scenario `5569495` |

When OpenAI is not ported, `/stages/r2` returns HTTP `202` with `status: deferred` and `make_fallback_required: true`. The Studio Worker falls back to Make automatically.

Dry-run probe (no writes):

```powershell
curl -X POST http://localhost:3350/stages/r2 `
  -H "Content-Type: application/json" `
  -H "X-Pipeline-Secret: $env:PIPELINE_RUNNER_SHARED_SECRET" `
  -d '{"extra":{"dry_run":true}}'
```

Blueprint reference: `repair/_tmp_make/r2.json`

## Enable in Studio Worker

```
PIPELINE_RUNNER_URL=https://pipeline.chicagoshining.com
PIPELINE_RUNNER_SHARED_SECRET=<shared secret>

# Opt-in per stage (unset or "make" keeps Make.com):
STAGE_BACKEND_SMV1=python
STAGE_BACKEND_R2=python
```

Until set, Worker continues Make on-demand pulses. R2 deferrals also fall back to Make when Python cannot complete OpenAI selection.

## API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness + version |
| `GET` | `/stages` | List planned stages |
| `POST` | `/stages/{name}` | Run one stage |
| `POST` | `/stages/smv1/drain` | Process up to N queue rows for one Production Request |
| `POST` | `/stages/r2/drain` | Process up to N eligible Platform Outputs |

POST body fields: `output_record_id`, `production_request_record_id`, `test_run_id`, `intended_stage`, `idempotency_key`, `extra.max_runs`, `extra.dry_run`, etc.

Header `X-Pipeline-Secret` required when `PIPELINE_RUNNER_SHARED_SECRET` is set.

## Migration order (remaining)

1. ~~SMV1~~ (Python ready; cutover when tests pass)
2. **R2** (scaffold; port OpenAI modules 7–9 next)
3. R3 → R5 render chain
4. P2, P3, P1
5. AP0 + publish platforms
6. RR1, RR2, intake

## Source-only rule

Never commit `.env`, `.venv/`, or `logs/`. Deploy with `Deploy-SMService.ps1 -Service pipeline-runner` once the runtime folder exists.

## Repository placement

Lives in **SM-Pipeline-V2** under `services/pipeline-runner/` alongside the other local services.
