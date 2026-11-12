# Phase 5 — Output and Content Item write-through

Airtable remains the write source of truth for the default Airtable-first write-through path. This slice mirrors successful Studio Worker writes so Supabase reads do not lag approve, schedule, publish, and heal updates. The optional write SoR flip (`STUDIO_WRITE_SOURCE=supabase`) makes Output/Content updates and creates commit to Supabase first with Airtable as a best-effort legacy export. When an Output or Content Item create succeeds in Airtable, callers still receive Airtable's `rec` id. When that Airtable create fails, the Supabase row remains under a minted `rec` id. Production Request, Media Asset, and transfer-queue creates do the same when `STUDIO_PHASE6_WRITE_SOURCE=supabase`. Ideas and other tables still mint ids in Airtable.

## What changed

After `airtableFetch` gets a successful **PATCH** or **POST** for:

| Airtable table | Supabase table |
|---|---|
| Platform Outputs | `platform_outputs` |
| Content Items | `content_items` |

the Worker awaits a write-through of the records Airtable returned when write SoR is still Airtable. GET, HEAD, and DELETE are ignored. A Supabase error is logged and does not fail the Airtable write.

Rows are mirrored only when the Airtable body includes an identity field (`Output_ID` / `Platform`, or `Content_ID` / `Content_Title` / `Content_Status`). A partial body cannot blank the Supabase projection. Content rows whose profile uuid is not resolved yet are patched in place and do not clear `content_profile_id`.

Approve, schedule, publish-status, and heal paths that pass `skipSupabaseWriteThrough: true` still issue exactly **one** post-lock Supabase mirror. **Never restore the former second upsert:** it was a production pool-saturation bug. When `STUDIO_WRITE_SOURCE=supabase`, those PATCH paths commit the partial fields to Supabase first. Schedule and approve paths that pass `maeSupabaseVerify` verify the slot from Supabase after that commit. Other skip paths still require a successful Airtable export.

## Side-effect outbox

`docs/supabase-migration/phase5/003_side_effect_outbox.sql` defines `studio_side_effect_outbox`. The Worker inserts a small status snapshot after each mirrored row. If the table is not created yet, the insert is skipped (`PGRST205` / schema cache). Nothing in this slice reads that table.

## Health

`/api/health` includes `studio_supabase_phase5_writes_v1: true`, `studio_write_source`, and `studio_phase5_writes`.

`GET /api/ops/supabase/sync` includes `phase5_writes` (`airtable_sor_write_through` or `supabase_sor_legacy_export`) and `phase5_write_tables`. Gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688) showed `phase5_writes=supabase_sor_legacy_export` and runner `studio_write_source=supabase`.

## Second half — pipeline runner

The pipeline runner is the other writer. `AirtableClient` create, update, and atomic upsert of Platform Outputs and Content Items mirror into Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Other tables are unchanged.

Setting `STUDIO_WRITE_SOURCE=supabase` makes Output/Content updates and creates commit to Supabase first and treats the Airtable write as a best-effort legacy export. A successful create still returns Airtable's `rec` id. A failed Airtable create keeps the Supabase row.

Runner `2026-11-11-supabase-runner-p3-and-links` can list `platform_outputs` and `content_items`, and can load one record by its Airtable `rec` id, when `STUDIO_RUNNER_OUTPUT_READ_SOURCE` or `STUDIO_RUNNER_CONTENT_READ_SOURCE` is `supabase`. List and get behavior shipped in `2026-11-10-supabase-runner-formula-fallbacks`. Enable the read flags with `deploy/enable-runner-supabase-reads.txt`. Worker `0.10.800-supabase-phase5-runner-marker-backfill` densifies full-record markers during half-hour sync. Allowlisted formulas (equality, `!="literal"`, `BLANK()`, `!=""`, numeric `>`, `RECORD_ID()`, nested `AND`, `OR`, `NOT({checkbox})`) translate to PostgREST filters on typed columns or densified jsonb extras. The three Studio produce Platform Output lookups also translate, including when `AND` combines one of them with allowlisted predicates (P3 seeded and duplicate output selectors): a comma-bounded content number in `Content_Item`, a content record id in `Content_Item`, and a `Production_Request_Output` record id stored on the full-record bag. `OR` of a link lookup stays on Airtable. Views, every other `FIND`/`ARRAYJOIN`, `IS_BEFORE`, an unmapped sort, an unmapped requested field, a missing/unmarked page, and a Supabase error stay on Airtable. An empty link match falls back to Airtable. Phase 7 is not started.

Worker `0.10.801-supabase-phase5-write-sor` honors `STUDIO_WRITE_SOURCE` the same way. Enable both services together with `deploy/enable-studio-write-sor.txt`: that workflow waits for the live Worker build, puts the Worker secret, sets the runner `.env`, restarts the runner, and verifies `/health`.

`/health` on the runner reports `studio_write_source`, `supabase_pipeline_writes`, `studio_runner_output_read_source`, and `studio_runner_content_read_source`.

## Still out of scope

- Retiring Airtable views and the remaining `FIND`/`ARRAYJOIN` formulas. Allowlisted equality/`BLANK`/`RECORD_ID`/`AND`/`OR` formulas, plus the three Studio produce Platform Output link lookups, already run on Supabase when the runner read flags are `supabase`.
- Deleting or stopping Airtable records (Phase 7).
- Production Requests, media metadata, and cron as a write source of truth (Phase 6 stays Airtable-first write-through).
- `resolveAuthorization` on Supabase user tables.

## Operator notes

`studioReadSource()` always returns `airtable`. Home does not follow `STUDIO_READ_SOURCE`. Workstream **B1** restores Phase 3 Pipeline + schedule-grid via `studioPipelineReadSource()`. Workstream **B2** restores `GET /api/content` via `studioContentReadSource()`. Workstream **B3** restores Factory/Ops via `studioFactoryOpsReadSource()`. Home restores overview via `studioHomeReadSource()`. Keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured on the Worker and the pipeline runner. Drive remains the media authority. Do not turn `STUDIO_HOME_PROFILE_SUMMARY_READS` on with this flag. Roll back write SoR by setting `STUDIO_WRITE_SOURCE=airtable` on both services.

## Half-hour synchronization safety

Cron at UTC minute 0 and 30 still mirrors Airtable profiles, outputs, content, ideas, and open production requests. A separate R2 conditional-write lease (`studio/state/phase5-sync-lease.json` under `STUDIO_MEDIA`) prevents cron and manual sweeps from overlapping across Worker isolates. Only `completed` with `ok=true` counts as success. The in-memory two-error / 15-minute Supabase pool circuit remains active; do not weaken it.

**Activation gate:** list reads were restored per route. Phase 6 Production Request, media metadata, and transfer-queue write-through are confirmed live. Half-hour media and queue backfill ships in Worker `0.10.799`. Write SoR enable is `deploy/enable-studio-write-sor.txt` after Worker `0.10.801`. See [Phase 6](../phase6/README.md) and the [Phase 6 handoff](../../handoffs/supabase-phase6-handoff.md).
