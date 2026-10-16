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

Approve, schedule, publish-status, and heal paths already go through `airtableFetch`, so they are covered here. The older schedule and approve write-through calls stay; a second upsert of the same row is safe.

## Side-effect outbox

`docs/supabase-migration/phase5/003_side_effect_outbox.sql` defines `studio_side_effect_outbox`. The Worker inserts a small status snapshot after each mirrored row. If the table is not created yet, the insert is skipped (`PGRST205` / schema cache). Make and pipeline-runner still read Airtable. Nothing in this slice consumes the outbox.

## Health

`/api/health` includes `studio_supabase_phase5_writes_v1: true`.

`GET /api/ops/supabase/sync` includes `phase5_writes: "airtable_sor_write_through"` and `phase5_write_tables`.

## Still out of scope

- Flipping writes off Airtable. The assessment gate (“no dual-write; Airtable becomes legacy export”) waits until Phase 3/4 reads stay clean and Make / pipeline-runner writes move.
- Deleting or stopping Airtable records.
- Production Requests, media metadata, and cron as a write source of truth (Phase 6).
- `resolveAuthorization` on Supabase user tables.

## Operator notes

Keep `STUDIO_READ_SOURCE=supabase` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Write-through runs whenever those secrets are set, including when reads are still on Airtable. Drive remains the media authority.
