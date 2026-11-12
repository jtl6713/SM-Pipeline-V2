# Supabase migration — current status

Airtable is still the write source of truth for creates (Airtable mints `rec` ids), Phase 6 tables, and formula/view selectors. Platform Output and Content Item **updates** commit to Supabase first, with Airtable as the legacy export (`STUDIO_WRITE_SOURCE=supabase`, enabled by `deploy/enable-studio-write-sor.txt`). Google Drive is still the media authority. The isolated Studio project is the one named in [phase 3](./phase3/README.md). Do not use the tasks-api Supabase project.

The original roadmap in the [Phase 1 assessment](./phase1/SM_Pipeline_V2_Airtable_to_Supabase_Phase_1_Assessment.md) numbered a full write cutover as Phase 5 and Production Requests / media / cron as Phase 6. Production diverged: Phase 5 shipped Airtable-first write-through, and the list reads were restored one flag at a time after a global `STUDIO_READ_SOURCE=supabase` setting saturated the Postgres pool on Home polls. `studioReadSource()` stays hard-coded to `airtable` so that global flag cannot turn Home, Content, or Factory back on.

## What is live

Confirmed by **Supabase Migration Gate Read-Only** run [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688) at 8:55 PM CT on November 11, 2026. Worker `0.10.820-supabase-phase6-transfer-targets`. Pipeline runner `2026-11-11-supabase-phase6-transfer-targets`.

| Surface | Route | Flag | Live value |
|---|---|---|---|
| Pipeline list, latest, review, schedule grid | `GET /api/outputs`, `GET /api/outputs/schedule-grid` | `STUDIO_PIPELINE_READ_SOURCE` (legacy `STUDIO_READ_SOURCE` only if the narrower flag is unset) | `supabase` |
| Content list | `GET /api/content` | `STUDIO_CONTENT_READ_SOURCE` (`secret_text`) | `supabase` |
| Factory desk and Ops queue | `GET /api/factory/desk`, `GET /api/operations/queue` | `STUDIO_FACTORY_OPS_READ_SOURCE` (`secret_text`) | `supabase` |
| Home overview | `GET /api/profiles/overview` | `STUDIO_HOME_READ_SOURCE` (`secret_text`) | `supabase` |
| Music library list | `GET /api/music` | `STUDIO_MUSIC_READ_SOURCE` (`secret_text`) | `supabase` |
| Asset Manager library list | `GET /api/library` | `STUDIO_ASSETS_READ_SOURCE` (`secret_text`) | `supabase` |
| Authorization | `resolveAuthorization` | `STUDIO_AUTH_READ_SOURCE` (`secret_text`) | `supabase` |
| Global read flag reported as `studio_read_source` | — | `studioReadSource()` | `airtable` (hard-coded) |
| Worker and runner writes | Platform Outputs and Content Items | `STUDIO_WRITE_SOURCE` | `supabase` (creates still Airtable-first; Airtable legacy export) |
| Phase 5 mirror mode | `/api/ops/supabase/sync` `phase5_writes` | — | `supabase_sor_legacy_export` |
| Phase 6 mirror mode | `/api/ops/supabase/sync` `phase6_writes` | — | `airtable_sor_write_through` for `production_requests`, `media_assets`, `studio_media_transfer_queue`, `studio_media_transfer_targets` |

The last sync in that gate finished at 8:34 PM CT with `status=completed`, `ok=true`, and the pool circuit closed. A follow-up count the same evening showed 16 `studio_media_transfer_targets` rows and 4 `production_request_outputs` anchors. Each read flag rolls back to Airtable by setting that secret to `airtable` or unsetting it. The flags do not follow each other. Authorization densify for `User_ID` and Allowed_Brands is `docs/supabase-migration/phase4/001_auth_mirror_extras.sql`; the org-brand fallback covers a missing extras column.

## What is still Airtable

- Creates of Platform Outputs and Content Items (Airtable mints `rec` ids), then mirror to Supabase.
- Schedule/approve MAE verify still re-reads Airtable under the reservation lock even after the write SoR flip; those paths require a successful Airtable legacy export.
- Production Requests, media metadata, and transfer-queue writes (Phase 6 Airtable-first write-through).
- Pipeline-runner Airtable views and `FIND`/`ARRAYJOIN` formula selectors other than the three Studio produce Platform Output link lookups (content number, content record id, and the stored Production Request Output record id). Allowlisted Output/Content formulas, including `OR`, run on Supabase when runner read flags are enabled (`deploy/enable-runner-supabase-reads.txt`). Unmarked rows and an empty link match still fall back to Airtable.
- The half-hour cron that copies Airtable into Supabase. Supabase is the replica, not the source of that job.
- `STUDIO_HOME_PROFILE_SUMMARY_READS`. That is a separate Durable Object summary, and this cutover did not turn it on.

## Remaining phases

| Phase | State | Where to read |
|---|---|---|
| 1 Assessment | Done | [phase1](./phase1/README.md) |
| 2 Isolated POC | Done | [phase2](./phase2/README.md) |
| 3 Pipeline reads | Live as B1 | [phase3](./phase3/README.md) |
| 4 Content, Factory, Ops, Home list reads | Live as B2, B3, and the Home flag. Authorization reads are live (`STUDIO_AUTH_READ_SOURCE=supabase`) | [phase4](./phase4/README.md) |
| 5 Output and Content Item write-through | Live. Write SoR flip is Worker `0.10.801` + `deploy/enable-studio-write-sor.txt` | [phase5](./phase5/README.md) |
| 5 remainder | Runner reads enabled via `deploy/enable-runner-supabase-reads.txt`. Write SoR is live (`phase5_writes=supabase_sor_legacy_export`, runner `studio_write_source=supabase`) after Worker `0.10.801-supabase-phase5-write-sor` and `deploy/enable-studio-write-sor.txt`. Creates still mint Airtable `rec` ids. Current runner is `2026-11-11-supabase-runner-or-filters`. Allowlisted formulas, `OR`, and the three Studio produce Platform Output link lookups stay on Supabase; views and other FIND/ARRAYJOIN stay on Airtable. Phase 7 is not started | This file |
| 6 Production Requests, media metadata, transfer queue, and the cron/autonomous writers | Production Request, media metadata, transfer-queue, and transfer-target write-through are confirmed live by gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688). `phase6_writes=airtable_sor_write_through`. Scheduled runner writes mirror through the runner Airtable client. Half-hour media and queue backfill includes open-queue target join rows. Phase 7 is not started | [phase6](./phase6/README.md), [handoff](../handoffs/supabase-phase6-handoff.md) |
| 7 Retire Airtable | Not started. Do not delete or stop Airtable records in Phase 6 | This file |

Phase 6 Production Request, media metadata, transfer-queue, and transfer-target write-through are confirmed live on gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688). Phase 7, retiring Airtable, is not started.
