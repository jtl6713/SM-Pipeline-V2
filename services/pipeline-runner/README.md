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
| **R2B** | Full (`5576620` — retry asset selection, max 10) | `STAGE_BACKEND_R2B=python` |
| **P4** | Full (`5533802` — asset-need coverage) | `STAGE_BACKEND_P4=python`; R2 calls Python in-process |
| **P5** | Full (`5536624` — open-shot reminder email) | `STAGE_BACKEND_P5=python`; P4 daisy-chains Python P5 |
| **SAI1** | Full (`6023816` — Studio AI slide themer, request/response) | `STAGE_BACKEND_SAI1=python` |
| **C2** | Full (`5582071` — exact-parent AI slide images) | `STAGE_BACKEND_C2=python` |
| **C3** | Full (`5587853` — one-parent review email) | `STAGE_BACKEND_C3=python`; C2 daisy-chains Python C3 |
| **C3B** | Full (`5592384` — review buttons) | `STAGE_BACKEND_C3B=python`. Hook: `/hooks/c3b/<C3B_WEBHOOK_TOKEN>` |
| **C4** | Full (`5587860` — decision router → C5/C6/C7) | `STAGE_BACKEND_C4=python` |
| **C5** | Full (`5582074` — regenerate rejected slides) | `STAGE_BACKEND_C5=python` |
| **C6** | Full (`5589218` — watermark approved slides) | `STAGE_BACKEND_C6=python` |
| **C7** | Full (`5589819` — finalize gate) | `STAGE_BACKEND_C7=python` |
| **C8** | Full (`5589822` — create/update platform outputs) | `STAGE_BACKEND_C8=python` |
| **C9** | Full (`5589932` — Ready to Publish) | `STAGE_BACKEND_C9=python` |
| **I1** | Full (`5514334` — daily/manual idea slate) | `STAGE_BACKEND_I1=python` |
| **I2** | Full (`5516968` — idea review email) | `STAGE_BACKEND_I2=python`; I1 daisy-chains Python I2 |
| **I3** | Full (`5517182` — email + Studio promote decisions) | `STAGE_BACKEND_I3=python`. Hook: `/hooks/i3/<I3_WEBHOOK_TOKEN>` |
| **I4** | Full (`5524092` — promote Content Item) | `STAGE_BACKEND_I4=python`; I3 daisy-chains Python I4 |
| **A2** | Full (`5531974` — Drive intake + MIME routing) | `STAGE_BACKEND_A2=python` |
| **A2B** | Full (`5568863` — video-folder backfill) | `STAGE_BACKEND_A2B=python`; A2 daisy-chains A2B |
| **A3** | Full (`5569035` — classify Media Assets) | `STAGE_BACKEND_A3=python`; A2B daisy-chains A3 |
| **A4** | Full (`5578180` — deleted Drive reconciliation) | `STAGE_BACKEND_A4=python`; A3 daisy-chains A4 |
| **A1P** | Full (`5715500` — CloudConvert poll/finalize) | `STAGE_BACKEND_A1P=python`. Hook: `/hooks/a1p/<A1P_WEBHOOK_TOKEN>` |
| **AP0** | Full (`5612096` — Drive final MP4 → public R2) | `STAGE_BACKEND_AP0=python` |
| **AP1-IG** | Full (`5862882` — Instagram Reel Graph publish) | `STAGE_BACKEND_AP1_IG=python` |
| **AP1-IGS** | Full (`5612664` create + `5845193` poll — Instagram Story Graph) | `STAGE_BACKEND_AP1_IGS=python` |
| **FBS1 / FBS2** | Full (`5816409` render + `5816495` poll/stage — Facebook slideshow MP4) | `STAGE_BACKEND_FBS1=python` |
| **YT0 / YTP1 / YTS1 / YTS2 / YTS3** | Full (`5823572` package + `5830810` upload + `5830609`/`5830616` poll + `5830623` finalize) | `STAGE_BACKEND_YT0=python` |
| **TTD0 / TTD1 / TTD2 / TTD3 / TTD4** | Full (`5806658` assets + `5806644` init + `5806597` poll + `5806570` email + `5806518` completion) | `STAGE_BACKEND_TTD0=python` |
| **FB0 / FB1 / FB2 / FB2R / FB3** | Full (`5813436` assets + `5813463` unpublished photos + `5813487` publish + `5813511` reconcile + `5813534` finalize) | `STAGE_BACKEND_FB0=python` |
| **AP0C / AP1C / AP2C / AP3C / AP3P / AP4C / AP4R / AP5C** | Full (`5786899` assets + `5790745` children + `5791231` child poll + `5791273` parent + `5791336` parent poll + `5791356` publish + `5791396` reconcile + `5791424` finalize) | `STAGE_BACKEND_AP0C=python` |
| **FBS3 / FBS4** | Full (`5816502` create + `5816520` poll — Facebook Reel Graph) | `STAGE_BACKEND_FBS3=python` |

Wave 2 render chain (R3–R5), SMV1/R2, RR1, P2, P3, RR2, R2B, P4, P5, SAI1, C2–C9, I1–I4, A2–A4, A1P, AP0, AP1-IG, AP1-IGS, FBS1/FBS2, FBS3/FBS4, YT0–YTS3, TTD0–TTD4, FB0–FB3, and AP0C–AP5C are on Python in production. A1S stays Make and posts `poller_url` at `/hooks/a1p/<A1P_WEBHOOK_TOKEN>`. RR1 email buttons call `/hooks/rr2/<token>`. C3 review buttons call `/hooks/c3b/<token>`. I2 review buttons call `/hooks/i3/<token>`. TikTok inbox emails call `/hooks/ttd4`. R2 missing-asset handoffs call Python P4. Make `5576353`, `5576620`, `5533802`, `5536624`, `5582071`, `5587853`, `5592384`, `6023816`, `5587860`, `5582074`, `5589218`, `5589819`, `5589822`, `5589932`, `5514334`, `5516968`, `5517182`, `5524092`, `5602193`, `5531974`, `5568863`, `5569035`, `5578180`, `5715500`, `5612096`, `5862882`, `5612664`, `5845193`, `5816409`, `5816495`, `5816502`, `5816520`, `5823572`, `5830810`, `5830609`, `5830616`, `5830623`, `5806658`, `5806644`, `5806597`, `5806570`, `5806518`, `5813436`, `5813463`, `5813487`, `5813511`, `5813534`, `5786899`, `5790745`, `5791231`, `5791273`, `5791336`, `5791356`, `5791396`, and `5791424` are deactivated.

SAI1, C2–C9, and I1–I4 are on Python in production. C1 and C2M stay parked. Do not Approve live social posts. Python AP0 does not pulse IG/FB/TT/YT. Python AP1-IG publishes Instagram Reels. Python AP1-IGS publishes Instagram Stories. Python FBS1/FBS2 render or stage Facebook slideshow MP4s. Python FBS3/FBS4 publish Facebook Reels. Python YT0–YTS3 publish YouTube videos through the local uploader. Python TTD0–TTD4 create TikTok inbox drafts and send the manual-completion email. Python FB0–FB3 publish Facebook Single Image and Multi-Image posts. Python AP0C–AP5C publish Instagram carousels. Facebook photos and Instagram carousel no longer share a Make front door.

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
| Master Original + Pending | Private media bridge (`studio/master-assets/`) → Google Drive → Media Asset |
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
| `POST` | `/stages/p4` | Asset-need coverage for one Output_ID / record |
| `POST` | `/stages/p5` | Open-shot reminder email (max 200) |
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
8. ~~R2B~~ (Python live)
9. ~~P4/P5~~ (Python live)
10. ~~I1–I4 idea chain~~ (Python live)
11. ~~A2–A4 asset chain~~ (Python live; A0 parked)
12. ~~A1P~~ (Python live; A1S still Make on-demand)
13. AP0 + publish platforms

## Source-only rule

Never commit `.env`, `.venv/`, or `logs/`. Deploy with `Deploy-SMService.ps1 -Service pipeline-runner` once the runtime folder exists.

## Repository placement

Lives in **SM-Pipeline-V2** under `services/pipeline-runner/` alongside the other local services.
