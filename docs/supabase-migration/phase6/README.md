# Phase 6 — Production Requests, media metadata, transfer queue, cron

Production Request write-through is confirmed live. Media asset metadata write-through is confirmed live on Worker `0.10.789-supabase-phase6-media-writes` by gate [42694210051](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42694210051) at 2:34 PM CT on November 9, 2026. Transfer queue write-through is confirmed live by gate [42744965777](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42744965777) at 8:46 PM CT on November 9, 2026, on Worker `0.10.792-video-unbilled-poc-reconciliation`, with `phase6_write_tables` `production_requests`, `media_assets`, and `studio_media_transfer_queue`. It shipped in Worker `0.10.791-supabase-phase6-queue-writes` and runner `2026-11-09-supabase-phase6-queue-writes`. It mirrors `studio_media_transfer_queue`. Worker `0.10.820-supabase-phase6-transfer-targets` and runner `2026-11-11-supabase-phase6-transfer-targets` also mirror `studio_media_transfer_targets` from `Target_Production_Request_Outputs` (queue payload ids plus join rows). Missing Production Request Output rows are inserted as Airtable-id anchors only. Production Request Output reads stay on Airtable. Gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688) at 8:55 PM CT on November 11, 2026 showed Worker `0.10.820-supabase-phase6-transfer-targets`, runner `2026-11-11-supabase-phase6-transfer-targets`, `phase6_writes=airtable_sor_write_through`, and `studio_media_transfer_targets` in `phase6_write_tables`. A follow-up count the same evening showed 16 join rows and 4 Production Request Output anchors. Scheduled Worker jobs already commit through `airtableFetch`, which mirrors these tables. Scheduled runner stages that write Production Requests or Media Assets mirror through the runner Airtable client in `2026-11-09-supabase-phase6-cron-writers`. The half-hour media and queue backfill ships in Worker `0.10.799-supabase-phase6-media-queue-backfill`: the existing heavy cron / manual sync lease upserts newest Media Assets into `media_assets` and open Studio Media Transfer Queue rows into `studio_media_transfer_queue` (Airtable → Supabase only; no Supabase → Airtable). The half-hour queue backfill refreshes those join rows for the open queue page. Airtable remains the write source of truth. Updates to Production Requests, Media Assets, and the transfer queue can commit to Supabase first only when `STUDIO_PHASE6_WRITE_SOURCE=supabase`. That flag is separate from `STUDIO_WRITE_SOURCE`. `deploy/enable-studio-phase6-write-source.txt` sets it after Worker `0.10.824-overview-awaiting-approval` and runner `2026-11-11-supabase-phase6-update-sor` are already live. Confirm `phase6_writes=supabase_sor_legacy_export` on the next read-only gate. When `STUDIO_PHASE6_WRITE_SOURCE=supabase`, Production Request, Media Asset, and transfer-queue creates commit to Supabase first. Those creates are not exported. Callers keep the minted `rec` id. A create that fails in Supabase still requires Airtable. A create that lacks the Supabase insert identity still requires Airtable. Schedule and approve paths that pass `maeSupabaseVerify` verify the slot from Supabase. The half-hour Airtable copy is stopped while `STUDIO_WRITE_SOURCE=supabase`. Existing rows stay. A successful Supabase commit is not exported. Drive remains the media authority.

**Supabase Migration Gate Read-Only** [run 42654476347](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42654476347) at 10:24 AM CT on November 9, 2026 showed Worker `0.10.787-home-parity-after-publish`, `studio_supabase_phase6_writes_v1` true, `phase6_writes=airtable_sor_write_through`, and `phase6_write_tables` `production_requests`. It shipped in Worker `0.10.784-supabase-phase6-request-writes` and stayed on through the Home parity release. Confirm the queue slice only after a later gate shows `studio_media_transfer_queue` in `phase6_write_tables` on Worker `0.10.791-supabase-phase6-queue-writes`.

`phase5_writes` stayed `airtable_sor_write_through` on that gate. The four list-read flags stayed `supabase`, `studio_read_source` stayed `airtable`, the runner write source stayed `airtable`, and the last sync was `completed` with the circuit closed.

The list-read cutover is already live. Phase 6 does not redo Pipeline, Content, Factory, Ops, or Home overview reads. It also does not flip `STUDIO_WRITE_SOURCE` for Production Requests, media, or the transfer queue. Output/Content write SoR is the Phase 5 remainder (`deploy/enable-studio-write-sor.txt`) and does not change Phase 6 Airtable-first write-through.

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

- Using `STUDIO_WRITE_SOURCE` to change Production Request / media / queue SoR. That flag only covers Platform Outputs and Content Items (Phase 5 remainder).
- Setting `STUDIO_PHASE6_WRITE_SOURCE` in the same pull request that first deploys the update path. Turn the flag on only from `deploy/enable-studio-phase6-write-source.txt` after that deploy is live.
- `resolveAuthorization` on `studio_users` / `studio_memberships`.
- Deleting Airtable records. That is not started. When the write flags are `supabase`, the half-hour copy and the legacy export are stopped and the existing rows stay.
- Putting originals in Supabase or treating R2 as the media authority.
- Using the tasks-api Supabase project.
- Re-enabling a global `STUDIO_READ_SOURCE=supabase` path. `studioReadSource()` stays `airtable`.

## Gate before any production flag or secret

1. Joseph has explicitly said to execute Phase 6.
2. A fresh **Supabase Migration Gate Read-Only** run shows the four list-read flags still `supabase`, `studio_read_source=airtable`, and the last sync `completed` with `ok=true` and the circuit closed. The first Phase 6 slice also required `phase5_writes=airtable_sor_write_through` and runner `studio_write_source=airtable`. Gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688) is the current bar: `phase5_writes=supabase_sor_legacy_export`, runner `studio_write_source=supabase`, and `phase6_write_tables` includes `studio_media_transfer_targets`.
3. The Worker version that contains the new write-through is deployed and the gate confirms that version. Do not set a new secret in the same pull request as the first deploy.

Rollback of a Phase 6 write-through is "stop calling the upsert." Airtable is still the source, so a failed mirror must leave the Airtable row in place.
