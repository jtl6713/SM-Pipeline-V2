# Phase 5 — Output and Content Item write-through

Airtable remains the write source of truth. This slice mirrors successful Studio Worker writes so Supabase reads do not lag approve, schedule, publish, and heal updates.

## What changed

After `airtableFetch` gets a successful **PATCH** or **POST** for:

| Airtable table | Supabase table |
|---|---|
| Platform Outputs | `platform_outputs` |
| Content Items | `content_items` |

the Worker awaits a write-through of the records Airtable returned. GET, HEAD, and DELETE are ignored. A Supabase error is logged and does not fail the Airtable write.

Rows are mirrored only when the Airtable body includes an identity field (`Output_ID` / `Platform`, or `Content_ID` / `Content_Title` / `Content_Status`). A partial body cannot blank the Supabase projection. Content rows whose profile uuid is not resolved yet are patched in place and do not clear `content_profile_id`.

Approve, schedule, publish-status, and heal paths remain authoritative Airtable writes. For schedule-changing operations (Factory/legacy approve, atomic/legacy regeneration, vacate, and calendar save), the verified Airtable mutation is completed under the scheduling reservation lock, and exactly **one** Supabase mirror is issued **after** release. These callers pass `skipSupabaseWriteThrough: true` to suppress the ordinary `airtableFetch` hook for the in-lock mutation. **Never restore the former second upsert:** it was a production pool-saturation bug. Ordinary Platform Output and Content Item PATCH/POST operations continue using the `airtableFetch` hook.

## Side-effect outbox

`docs/supabase-migration/phase5/003_side_effect_outbox.sql` defines `studio_side_effect_outbox`. The Worker inserts a small status snapshot after each mirrored row. If the table is not created yet, the insert is skipped (`PGRST205` / schema cache). Nothing in this slice reads that table. The pipeline runner still reads Airtable.

## Health

`/api/health` includes `studio_supabase_phase5_writes_v1: true`.

`GET /api/ops/supabase/sync` includes `phase5_writes: "airtable_sor_write_through"` and `phase5_write_tables`.

## Second half — pipeline runner

The pipeline runner is the other writer. `AirtableClient` create, update, and atomic upsert of Platform Outputs and Content Items now mirror the Airtable response into Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set on the runner. A Supabase error does not fail the Airtable write. Other tables are unchanged.

`STUDIO_WRITE_SOURCE` stays `airtable`. Setting it to `supabase` makes those two tables commit to Supabase first and treats the Airtable update as a best-effort legacy export. Creates still go to Airtable first so Airtable can mint `rec` ids. Leave the flag on `airtable` until the runner host has the Supabase secrets and the project is on Pro. Pipeline-runner reads are still Airtable.

`/health` on the runner reports `studio_write_source` and `supabase_pipeline_writes`.

## Still out of scope

- Turning on `STUDIO_WRITE_SOURCE=supabase` in production. That is the legacy-export switch, and it stays off while reads in the runner still come from Airtable.
- Deleting or stopping Airtable records.
- Production Requests, media metadata, and cron as a write source of truth (Phase 6).
- `resolveAuthorization` on Supabase user tables.

## Operator notes

`studioReadSource()` always returns `airtable`. Home does not follow `STUDIO_READ_SOURCE`. Workstream **B1** restores Phase 3 Pipeline + schedule-grid via `studioPipelineReadSource()` (`STUDIO_PIPELINE_READ_SOURCE=supabase`, or legacy `STUDIO_READ_SOURCE=supabase` when the narrower flag is unset). Roll back Pipeline reads with `STUDIO_PIPELINE_READ_SOURCE=airtable`. Workstream **B2** restores `GET /api/content` only via `studioContentReadSource()`. It does not follow the Pipeline or legacy read flag. Set `STUDIO_CONTENT_READ_SOURCE=supabase` to turn it on, and `airtable` (or unset) to roll it back. Workstream **B3** restores `GET /api/factory/desk` and `GET /api/operations/queue` only via `studioFactoryOpsReadSource()`. It does not follow the Pipeline, Content, or legacy read flag. Set `STUDIO_FACTORY_OPS_READ_SOURCE=supabase` to turn it on, and `airtable` (or unset) to roll it back. As of 12:16 AM CT on November 9, 2026, the Factory/Ops secret is `supabase` in production. Home restores `GET /api/profiles/overview` only via `studioHomeReadSource()`. It does not follow `STUDIO_READ_SOURCE`, the Pipeline flag, the Content flag, or the Factory/Ops flag. Set `STUDIO_HOME_READ_SOURCE=supabase` to turn it on, and `airtable` (or unset) to roll it back. That Home secret is also `supabase` as of the same gate. See [the migration index](../README.md). Keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured on the Worker and the pipeline runner for mirroring. Leave `STUDIO_WRITE_SOURCE=airtable` on **both** services. Drive remains the media authority. Do not turn `STUDIO_HOME_PROFILE_SUMMARY_READS` on with this flag.

## Half-hour synchronization safety

Cron at UTC minute 0 and 30 still mirrors Airtable profiles, outputs, content, ideas, and open production requests. A separate R2 conditional-write lease (`studio/state/phase5-sync-lease.json` under `STUDIO_MEDIA`) prevents cron and manual sweeps from overlapping across Worker isolates; absent R2 or an unknown lease state causes a fail-closed skip/error, not an unlocked sweep. The lease uses compare-and-swap renewal and expires after a hung Worker; stale owners cannot release a newer owner's lease. This is unrelated to MAE scheduling reservation locks.

`GET /api/ops/supabase/sync` includes the last run `status`, `duration_ms`, per-table upsert `chunks`, `rows`, and `duration_ms`, circuit snapshot, and per-profile failures. Only `completed` with `ok=true` counts as success. `partial`, `failed`, `circuit_open`, and lease-skipped invocations do **not** prove health. The in-memory two-error / 15-minute Supabase pool circuit remains active; do not weaken it.

**Activation gate:** this read gate is closed. The list reads were restored per route, Home last, after completed syncs and a closed pool circuit. Phase 6 Production Request write-through is confirmed live (shipped in Worker `0.10.784-supabase-phase6-request-writes`, still on in `0.10.787-home-parity-after-publish`). Media asset metadata write-through is confirmed live on Worker `0.10.789-supabase-phase6-media-writes`. Transfer queue write-through is in Worker `0.10.791-supabase-phase6-queue-writes`. Cron writers are not started. See [Phase 6](../phase6/README.md) and the [Phase 6 handoff](../../handoffs/supabase-phase6-handoff.md).
