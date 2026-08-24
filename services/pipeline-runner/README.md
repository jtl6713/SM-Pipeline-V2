# pipeline-runner

Python stage workers that replace Make.com scenarios for SM Pipeline V2.

- **Git path:** `services/pipeline-runner/`
- **Runtime path:** `D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service`
- **Local port:** `3350`
- **Stack:** Flask + requests (same pattern as Frame Extractor)
- **Local health:** `http://localhost:3350/health`
- **Public route:** `https://pipeline.chicagoshining.com` (Cloudflare Tunnel)
- **Make scenarios (migration order):** SMV1 `5894885`, R2 `5569495`, R3–R5, RR1 `5576363`, P2 `5530955`, P3 `5531703`, RR2 `5576353`, AP0/publish

## Status

| Stage | Python | Production |
| --- | --- | --- |
| **SMV1** | Full (`5894885` replacement) | `STAGE_BACKEND_SMV1=python` |
| **LETTER** | Native JPEG lower-third compositor (`POST /stages/letter`) | Worker pulses Python directly; no Make scenario |
| **R2** | Full (`5569495` replacement, OpenAI module 7 port) | `STAGE_BACKEND_R2=python` |
| **R3** | Full (`5557966` — render prep from `Selected_Assets_JSON`, batch 10) | Make until `STAGE_BACKEND_R3=python` |
| **R4** | Full (`5556716` — Remotion POST, 3 routes, batch 1) | Make until `STAGE_BACKEND_R4=python` |
| **R5** | Full (`5565333` — poll, Drive upload, R2 preview, batch 5) | `STAGE_BACKEND_R5=python` |
| **RR1** | Full (`5576363` — batched review email, max 10) | Make until `STAGE_BACKEND_RR1=python` |
| **P2** | Full (`5530955` — voiceover + thumbnail, 3 routes) | `STAGE_BACKEND_P2=python` |
| **P3** | Full (`5531703` — studio parent enrich + legacy create) | `STAGE_BACKEND_P3=python` |
| **RR2** | Full (`5576353` — review decision webhook) | `STAGE_BACKEND_RR2=python` |
| **R2B** | Full (`5576620` — retry asset selection, max 10) | Make until `STAGE_BACKEND_R2B=python` |
| **AP0 / publish_*** | Constants only (`publish/constants.py`) | Make |

Wave 2 render chain (R3–R5), SMV1/R2, RR1, P2, P3, and RR2 are on Python in production. RR1 email buttons call `/hooks/rr2/<token>`. Make `5576353` is deactivated.

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

## R2 behavior

One `POST /stages/r2` == one Platform Output (Make module 1 `maxRecords=1`).

| Path | Python | Make pointer |
| --- | --- | --- |
| Eligibility + candidate gather | Yes | Module 1 formula in `r2/formulas.py` |
| Canonical OpenAI selection | Yes | Modules 7–9 on scenario `5569495` |

Dry-run probe (no writes):

```powershell
curl -X POST http://localhost:3350/stages/r2 `
  -H "Content-Type: application/json" `
  -H "X-Pipeline-Secret: $env:PIPELINE_RUNNER_SHARED_SECRET" `
  -d '{"extra":{"dry_run":true}}'
```

## R3 behavior (render prep)

One `POST /stages/r3` processes up to **10** Platform Outputs where `Asset_Selection_Status=Selected`, `Selected_Assets_JSON` is set, and `Render_Status` is blank (video formats). Parses the canonical JSON package and writes render fields when `selection_status=Selected` and `render_prep.render_status=Ready for Render`.

Shared helpers: `render/fields.py`, music fallback catalog URL in `r3/render_prep.py`.

## R4 behavior (start Remotion render)

One `POST /stages/r4` claims **1** output with `Render_Status=Ready for Render` and required clip/composition fields. Loads render server URL + music/voice volumes from Pipeline Settings, clears stale render job fields, then routes:

| Route | When |
| --- | --- |
| P020 Phase6 manifest | `Creative_Render_Manifest_JSON` present |
| Voiceover + spoken captions | No manifest, `Voiceover_URL` set |
| No voiceover | No manifest, no voiceover URL |

POST body built in `r4/render_request.py`; Remotion client in `render/remotion_client.py`.

## R5 behavior (poll + upload)

One `POST /stages/r5` polls up to **5** outputs in `Rendering` with a `Remotion_Status_URL`. On complete: download MP4, upload to Google Drive final folder, cleanup Remotion job, PUT R2 studio preview cache, set `Studio_Preview_*` fields. Failed jobs write validation errors and reset status.

## RR1 behavior (review email)

One `POST /stages/rr1` finds up to **10** review-eligible Platform Outputs (rendered video or native photo sets), builds one HTML email with decision buttons, sends via Gmail API, then stamps `Review_Status=Review Sent` and `Review_Email_Sent_At`.

Requires Google OAuth refresh token with **Gmail send** scope. Decision webhooks default to the existing Make hook URL.

## RR2 behavior (review decision)

One `POST /stages/rr2` applies a single email-button decision (`approved`, `changes`, `rejected`, `do_not_publish`) to one Platform Output.

| Decision | Airtable writes | Side effect |
| --- | --- | --- |
| `approved` | `Review_Status=Approved`, `Output_Status=Approved for Publishing`, `Publish_Status=Ready to Schedule`, `Auto_Publish_Enabled`, `Publish_Method=Automated` | Start IG/FB/TTD Make orchestrators (errors ignored) |
| `changes` | `Changes Requested` + `Render_Status=Needs Changes` | None |
| `rejected` | `Rejected` + `Do_Not_Publish` | None |
| `do_not_publish` | `Skipped` + `Do_Not_Publish` | None |

Email buttons stay on the Make hook until cutover. Optional public GET `/hooks/rr2/<RR2_WEBHOOK_TOKEN>` matches the Make query shape (`record_id`, `decision`).

## P3 behavior (platform outputs)

One `POST /stages/p3` takes a Content Item (`content_item_record_id` / `content_record_id`).

| Route | When | Action |
| --- | --- | --- |
| Studio parent | `Production_Request` set, not a child work item, caption + required media, status Thumbnail Ready / Ready for Thumbnail / Script Generated | Enrich up to 25 seeded `Planned` Platform Outputs, then mark the parent `Review_Status=Ready for Review`, `Render_Status=Not Ready`, `Content_Status=Assets Matched` |
| Legacy / child | `Production_Request` blank or `Studio_Is_Output_Work_Item` | Resolve platforms/formats, create missing mapping rows, skip duplicates |

Native photo types (Multi-Photo / Carousel / Multi-Image Post) stay `Ready for Review` with blank `Asset_Selection_Status`. Remotion Studio outputs go `In Production` with `Asset_Selection_Status=Selected`. When `STAGE_BACKEND_P3=python`, P2 success calls local P3 instead of the Make webhook. Production stays on Make `5531703` until that var is set on both the runner and the Worker.

## Enable in Studio Worker

```
PIPELINE_RUNNER_URL=https://pipeline.chicagoshining.com
PIPELINE_RUNNER_SHARED_SECRET=<shared secret>

# Opt-in per stage (unset or "make" keeps Make.com):
STAGE_BACKEND_SMV1=python
STAGE_BACKEND_R2=python
STAGE_BACKEND_R3=python
STAGE_BACKEND_R4=python
STAGE_BACKEND_R5=python
STAGE_BACKEND_RR1=python
STAGE_BACKEND_P2=python
STAGE_BACKEND_P3=python
STAGE_BACKEND_RR2=python
```

Until R3/R4/R5 vars are set, Worker continuation cron keeps pulsing Make on-demand for the render chain.

## API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness + version |
| `GET` | `/stages` | List planned stages |
| `POST` | `/stages/{name}` | Run one stage |
| `POST` | `/stages/smv1/drain` | Process up to N queue rows for one Production Request |
| `POST` | `/stages/r2/drain` | Process up to N eligible Platform Outputs |
| `POST` | `/stages/r3` | Render prep batch (max 10) |
| `POST` | `/stages/r4` | Start one Remotion render |
| `POST` | `/stages/r5` | Poll/upload batch (max 5) |
| `POST` | `/stages/rr1` | Review email batch (max 10) |
| `POST` | `/stages/p2` | Voiceover + thumbnail for one Content Item |
| `POST` | `/stages/p3` | Enrich seeded Studio outputs or create legacy mappings |
| `POST` | `/stages/rr2` | Apply one render-review decision |
| `POST` | `/stages/r2b` | Retry asset selection batch (max 10) |
| `GET`/`POST` | `/hooks/rr2/<token>` | Email-button entry (token required; no pipeline secret) |

POST body fields: `output_record_id`, `production_request_record_id`, `test_run_id`, `intended_stage`, `idempotency_key`, `extra.max_runs`, `extra.dry_run`, etc.

Header `X-Pipeline-Secret` required when `PIPELINE_RUNNER_SHARED_SECRET` is set.

## Migration order (remaining)

1. ~~SMV1~~ (Python live)
2. ~~R2~~ (Python live)
3. ~~R3 → R5 render chain~~ (Python live)
4. ~~RR1~~ (Python live)
5. ~~P2~~ (Python live)
6. ~~P3~~ (Python live)
7. ~~RR2~~ (Python live; email buttons use `/hooks/rr2/<token>`)
8. R2B, P4/P5, then AP0 + publish platforms

## Source-only rule

Never commit `.env`, `.venv/`, or `logs/`. Deploy with `Deploy-SMService.ps1 -Service pipeline-runner` once the runtime folder exists.

## Repository placement

Lives in **SM-Pipeline-V2** under `services/pipeline-runner/` alongside the other local services.
