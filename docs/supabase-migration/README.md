# Supabase migration — current status

Airtable is still the write source of truth. Google Drive is still the media authority. The isolated Studio project is the one named in [phase 3](./phase3/README.md). Do not use the tasks-api Supabase project.

The original roadmap in the [Phase 1 assessment](./phase1/SM_Pipeline_V2_Airtable_to_Supabase_Phase_1_Assessment.md) numbered a full write cutover as Phase 5 and Production Requests / media / cron as Phase 6. Production diverged: Phase 5 shipped Airtable-first write-through, and the list reads were restored one flag at a time after a global `STUDIO_READ_SOURCE=supabase` setting saturated the Postgres pool on Home polls. `studioReadSource()` stays hard-coded to `airtable` so that global flag cannot turn Home, Content, or Factory back on.

## What is live

Confirmed by **Supabase Migration Gate Read-Only** run [42571989580](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42571989580) at 12:16 AM CT on November 9, 2026. Worker `0.10.783-supabase-home-reads`. Pipeline runner `2026-11-09-its1-exact-scene-count-v1`.

| Surface | Route | Flag | Live value |
|---|---|---|---|
| Pipeline list, latest, review, schedule grid | `GET /api/outputs`, `GET /api/outputs/schedule-grid` | `STUDIO_PIPELINE_READ_SOURCE` (legacy `STUDIO_READ_SOURCE` only if the narrower flag is unset) | `supabase` |
| Content list | `GET /api/content` | `STUDIO_CONTENT_READ_SOURCE` (`secret_text`) | `supabase` |
| Factory desk and Ops queue | `GET /api/factory/desk`, `GET /api/operations/queue` | `STUDIO_FACTORY_OPS_READ_SOURCE` (`secret_text`) | `supabase` |
| Home overview | `GET /api/profiles/overview` | `STUDIO_HOME_READ_SOURCE` (`secret_text`) | `supabase` |
| Global read flag reported as `studio_read_source` | — | `studioReadSource()` | `airtable` (hard-coded) |
| Worker and runner writes | Platform Outputs and Content Items | `STUDIO_WRITE_SOURCE` | `airtable` |
| Phase 5 mirror | after a successful Airtable PATCH/POST | — | `airtable_sor_write_through` |

The last sync in that gate finished at 12:03 AM CT with `status=completed`, `ok=true`, and the pool circuit closed. Each read flag rolls back to Airtable by setting that secret to `airtable` or unsetting it. The flags do not follow each other.

## What is still Airtable

- Every write, including approve, schedule, publish, produce, and Factory mutations.
- Pipeline-runner reads (`services/pipeline-runner/`). Runner `2026-11-10-supabase-phase5-runner-record` can list Platform Outputs and Content Items and can load one marked row by its Airtable `rec` id. `STUDIO_RUNNER_OUTPUT_READ_SOURCE` and `STUDIO_RUNNER_CONTENT_READ_SOURCE` stay `airtable`. Formula and view selectors stay on Airtable. Older rows stay on Airtable.
- The half-hour cron that copies Airtable into Supabase. Supabase is the replica, not the source of that job.
- `resolveAuthorization` and the other record-detail routes that were never in the list-read cutover.
- Asset and music library metadata.
- `STUDIO_HOME_PROFILE_SUMMARY_READS`. That is a separate Durable Object summary, and this cutover did not turn it on.

## Remaining phases

| Phase | State | Where to read |
|---|---|---|
| 1 Assessment | Done | [phase1](./phase1/README.md) |
| 2 Isolated POC | Done | [phase2](./phase2/README.md) |
| 3 Pipeline reads | Live as B1 | [phase3](./phase3/README.md) |
| 4 Content, Factory, Ops, Home list reads | Live as B2, B3, and the Home flag. Authorization reads were not moved | [phase4](./phase4/README.md) |
| 5 Output and Content Item write-through | Live. The legacy-export switch `STUDIO_WRITE_SOURCE=supabase` is not on | [phase5](./phase5/README.md) |
| 5 remainder | List and single-record reads are in runner `2026-11-10-supabase-phase5-runner-record`. Both flags stay `airtable`. Formula and view selectors stay on Airtable. A single-record Supabase read requires the full-record marker. `STUDIO_WRITE_SOURCE` stays `airtable`. Creates still mint Airtable `rec` ids. Turning the flags on is a later change. Phase 7 is not started | This file |
| 6 Production Requests, media metadata, transfer queue, and the cron/autonomous writers | Production Request, media metadata, and transfer-queue write-through are confirmed live. Scheduled runner writes of those tables mirror through the runner Airtable client in `2026-11-09-supabase-phase6-cron-writers`. The half-hour media and queue backfill is not started | [phase6](./phase6/README.md), [handoff](../handoffs/supabase-phase6-handoff.md) |
| 7 Retire Airtable | Not started. Do not delete or stop Airtable records in Phase 6 | This file |

Phase 6 Production Request, media metadata, and transfer-queue write-through are confirmed live. Scheduled runner writes mirror through the runner Airtable client in `2026-11-09-supabase-phase6-cron-writers`. The half-hour media and queue backfill is not started. Phase 7, retiring Airtable, is not started either. `STUDIO_WRITE_SOURCE` stays `airtable`.
