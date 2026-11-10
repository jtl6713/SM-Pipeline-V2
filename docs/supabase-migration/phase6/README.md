# Phase 6 — Production Requests, media metadata, transfer queue, cron

Production Request write-through is confirmed live. Media asset metadata write-through is confirmed live on Worker `0.10.789-supabase-phase6-media-writes` by gate [42694210051](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42694210051) at 2:34 PM CT on November 9, 2026. Transfer queue write-through ships in Worker `0.10.791-supabase-phase6-queue-writes` and runner `2026-11-09-supabase-phase6-queue-writes`. It mirrors `studio_media_transfer_queue` only. studio_media_transfer_targets are not written. Cron writers are not started. Airtable remains the write source of truth. Drive remains the media authority.

**Supabase Migration Gate Read-Only** [run 42654476347](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42654476347) at 10:24 AM CT on November 9, 2026 showed Worker `0.10.787-home-parity-after-publish`, `studio_supabase_phase6_writes_v1` true, `phase6_writes=airtable_sor_write_through`, and `phase6_write_tables` `production_requests`. It shipped in Worker `0.10.784-supabase-phase6-request-writes` and stayed on through the Home parity release. Confirm the queue slice only after a later gate shows `studio_media_transfer_queue` in `phase6_write_tables` on Worker `0.10.791-supabase-phase6-queue-writes`.

`phase5_writes` stayed `airtable_sor_write_through` on that gate. The four list-read flags stayed `supabase`, `studio_read_source` stayed `airtable`, the runner write source stayed `airtable`, and the last sync was `completed` with the circuit closed.

The list-read cutover is already live. Phase 6 does not redo Pipeline, Content, Factory, Ops, or Home overview reads. It also does not flip `STUDIO_WRITE_SOURCE`. That switch is the Phase 5 remainder and stays off while the pipeline runner still reads Airtable.

## In scope, when execution is approved

Move these from "Airtable is the source, Supabase is a mirror" toward Airtable-first write-through, one writer at a time:

| Airtable area | Supabase table already sketched in Phase 1 |
|---|---|
| Production Requests | `production_requests` |
| Media asset metadata | `media_assets` (Drive file ids only; Drive stays the file authority) |
| Media transfer queue | `studio_media_transfer_queue`, `studio_media_transfer_targets` |
| Autonomous and cron jobs that still list those tables from Airtable | same tables, after the write-through for that table is proven |

The half-hour sync may keep copying Airtable into Supabase while Airtable is still the source. A Phase 6 change must not make that cron read Supabase and write Airtable in the same release that starts write-through.

## First slice

Production Request write-through, in Worker `0.10.784-supabase-phase6-request-writes`, matching Phase 5:

- After a successful Airtable PATCH or POST, upsert the returned row into `production_requests`.
- A Supabase error is logged and does not fail the Airtable write.
- A partial body must not blank the Supabase row.
- No new read flag. Factory and Ops keep the read flag they already have.
- No change to `STUDIO_WRITE_SOURCE`, `STUDIO_HOME_READ_SOURCE`, or `STUDIO_HOME_PROFILE_SUMMARY_READS`.
- No pipeline-runner read change in that same change.

Media metadata, the transfer queue, and cron writers come after that slice has a completed sync and a closed circuit. Each of those is its own change.

## Out of scope

- `STUDIO_WRITE_SOURCE=supabase` for Platform Outputs or Content Items.
- Pipeline-runner reads moving to Supabase. That is the Phase 5 remainder.
- `resolveAuthorization` on `studio_users` / `studio_memberships`.
- Deleting, archiving, or stopping Airtable records. That is Phase 7 and is not started.
- Putting originals in Supabase or treating R2 as the media authority.
- Using the tasks-api Supabase project.
- Re-enabling a global `STUDIO_READ_SOURCE=supabase` path. `studioReadSource()` stays `airtable`.

## Gate before any production flag or secret

1. Joseph has explicitly said to execute Phase 6.
2. A fresh **Supabase Migration Gate Read-Only** run shows the four list-read flags still `supabase`, `studio_read_source=airtable`, `phase5_writes=airtable_sor_write_through`, runner `studio_write_source=airtable`, and the last sync `completed` with `ok=true` and the circuit closed.
3. The Worker version that contains the new write-through is deployed and the gate confirms that version. Do not set a new secret in the same pull request as the first deploy.

Rollback of a Phase 6 write-through is "stop calling the upsert." Airtable is still the source, so a failed mirror must leave the Airtable row in place.
