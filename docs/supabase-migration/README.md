# Supabase migration — current status

Airtable is still the write source of truth for creates (Airtable mints `rec` ids), Phase 6 tables, and formula/view selectors. Platform Output and Content Item **updates** flip to Supabase SoR with Airtable legacy export when `deploy/enable-studio-write-sor.txt` runs. Google Drive is still the media authority. The isolated Studio project is the one named in [phase 3](./phase3/README.md). Do not use the tasks-api Supabase project.

The original roadmap in the [Phase 1 assessment](./phase1/SM_Pipeline_V2_Airtable_to_Supabase_Phase_1_Assessment.md) numbered a full write cutover as Phase 5 and Production Requests / media / cron as Phase 6. Production diverged: Phase 5 shipped Airtable-first write-through, and the list reads were restored one flag at a time after a global `STUDIO_READ_SOURCE=supabase` setting saturated the Postgres pool on Home polls. `studioReadSource()` stays hard-coded to `airtable` so that global flag cannot turn Home, Content, or Factory back on.

## What is live

Confirmed by **Supabase Migration Gate Read-Only** run [42571989580](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42571989580) at 12:16 AM CT on November 9, 2026. Worker `0.10.783-supabase-home-reads`. Pipeline runner `2026-11-09-its1-exact-scene-count-v1`.

| Surface | Route | Flag | Live value |
|---|---|---|---|
| Pipeline list, latest, review, schedule grid | `GET /api/outputs`, `GET /api/outputs/schedule-grid` | `STUDIO_PIPELINE_READ_SOURCE` (legacy `STUDIO_READ_SOURCE` only if the narrower flag is unset) | `supabase` |
| Content list | `GET /api/content` | `STUDIO_CONTENT_READ_SOURCE` (`secret_text`) | `supabase` |
| Factory desk and Ops queue | `GET /api/factory/desk`, `GET /api/operations/queue` | `STUDIO_FACTORY_OPS_READ_SOURCE` (`secret_text`) | `supabase` |
| Home overview | `GET /api/profiles/overview` | `STUDIO_HOME_READ_SOURCE` (`secret_text`) | `supabase` |
| Music library list | `GET /api/music` | `STUDIO_MUSIC_READ_SOURCE` (`secret_text`) | `supabase` |
| Asset Manager library list | `GET /api/library` | `STUDIO_ASSETS_READ_SOURCE` (`secret_text`) | dormant until `deploy/enable-studio-assets-reads.txt` after Worker `0.10.816-assets-densify-catchup` densify |
| Global read flag reported as `studio_read_source` | — | `studioReadSource()` | `airtable` (hard-coded) |
| Worker and runner writes | Platform Outputs and Content Items | `STUDIO_WRITE_SOURCE` | enable via `deploy/enable-studio-write-sor.txt` → `supabase` (creates still Airtable-first) |
| Phase 5 mirror mode | `/api/ops/supabase/sync` `phase5_writes` | — | `airtable_sor_write_through` until enable, then `supabase_sor_legacy_export` |

The last sync in that gate finished at 12:03 AM CT with `status=completed`, `ok=true`, and the pool circuit closed. Each read flag rolls back to Airtable by setting that secret to `airtable` or unsetting it. The flags do not follow each other.

## What is still Airtable

- Creates of Platform Outputs and Content Items (Airtable mints `rec` ids), then mirror to Supabase.
- Schedule/approve MAE verify still re-reads Airtable under the reservation lock even after the write SoR flip; those paths require a successful Airtable legacy export.
- Production Requests, media metadata, and transfer-queue writes (Phase 6 Airtable-first write-through).
- Pipeline-runner Airtable views and `FIND`/`ARRAYJOIN`/`OR` formula selectors. Allowlisted Output/Content formulas run on Supabase when runner read flags are enabled (`deploy/enable-runner-supabase-reads.txt`). Unmarked rows still fall back to Airtable.
- The half-hour cron that copies Airtable into Supabase. Supabase is the replica, not the source of that job.
- `resolveAuthorization` reads Supabase when `STUDIO_AUTH_READ_SOURCE=supabase` (Worker `0.10.813-auth-prove` + enable). Apply `docs/supabase-migration/phase4/001_auth_mirror_extras.sql` for densified keys (`User_ID`, Allowed_Brands, etc.); org-brand fallback covers missing extras.
- Asset Manager `GET /api/library` stays on Airtable until `STUDIO_ASSETS_READ_SOURCE=supabase`. Worker `0.10.816-assets-densify-catchup` densifies profile/classification/search into `media_assets.metadata` and ships a dormant loader with Airtable fallback. Enable via `deploy/enable-studio-assets-reads.txt` after densify is confirmed.
- `STUDIO_HOME_PROFILE_SUMMARY_READS`. That is a separate Durable Object summary, and this cutover did not turn it on.
- Phase 6 `studio_media_transfer_targets` mirror (write-through gap only; does not cut Airtable reads).

## Remaining phases

| Phase | State | Where to read |
|---|---|---|
| 1 Assessment | Done | [phase1](./phase1/README.md) |
| 2 Isolated POC | Done | [phase2](./phase2/README.md) |
| 3 Pipeline reads | Live as B1 | [phase3](./phase3/README.md) |
| 4 Content, Factory, Ops, Home list reads | Live as B2, B3, and the Home flag. Authorization reads were not moved | [phase4](./phase4/README.md) |
| 5 Output and Content Item write-through | Live. Write SoR flip is Worker `0.10.801` + `deploy/enable-studio-write-sor.txt` | [phase5](./phase5/README.md) |
| 5 remainder | Runner reads enabled via `deploy/enable-runner-supabase-reads.txt`. Write SoR flip via `deploy/enable-studio-write-sor.txt` after Worker `0.10.801-supabase-phase5-write-sor`. Creates still mint Airtable `rec` ids. Allowlisted formulas on Supabase in runner `2026-11-10-supabase-runner-formula-fallbacks`; views and FIND/ARRAYJOIN still Airtable. Phase 7 is not started | This file |
| 6 Production Requests, media metadata, transfer queue, and the cron/autonomous writers | Production Request, media metadata, and transfer-queue write-through are confirmed live. Scheduled runner writes of those tables mirror through the runner Airtable client in `2026-11-09-supabase-phase6-cron-writers`. Half-hour media and queue backfill ships in Worker `0.10.799-supabase-phase6-media-queue-backfill`. `studio_media_transfer_targets` are not written | [phase6](./phase6/README.md), [handoff](../handoffs/supabase-phase6-handoff.md) |
| 7 Retire Airtable | Not started. Do not delete or stop Airtable records in Phase 6 | This file |

Phase 6 Production Request, media metadata, and transfer-queue write-through are confirmed live. Scheduled runner writes mirror through the runner Airtable client in `2026-11-09-supabase-phase6-cron-writers`. Half-hour media and queue backfill ships in Worker `0.10.799-supabase-phase6-media-queue-backfill`. Phase 7, retiring Airtable, is not started either.
