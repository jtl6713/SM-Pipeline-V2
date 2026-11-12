# Phase 6 handoff (new agent start here)

**Date:** November 9, 2026, 12:18 AM CT. Updated after Joseph said to execute Phase 6.  
**Status:** Production Request write-through is confirmed live. It shipped in Worker `0.10.784-supabase-phase6-request-writes`. Media metadata write-through is confirmed live on Worker `0.10.789-supabase-phase6-media-writes`. Transfer queue write-through is confirmed live on Worker `0.10.792-video-unbilled-poc-reconciliation`. Scheduled runner writes of Production Requests and Media Assets mirror through the runner Airtable client in `2026-11-09-supabase-phase6-cron-writers`. Half-hour media and queue backfill ships in Worker `0.10.799-supabase-phase6-media-queue-backfill` (`media_assets` + `studio_media_transfer_queue`). `studio_media_transfer_targets` mirror linked Production Request Output ids in Worker `0.10.820-supabase-phase6-transfer-targets` and runner `2026-11-11-supabase-phase6-transfer-targets`. Confirm join rows on the next gate. Phase 7 is not started.  
**Joseph’s ask:** Execute Phase 6. The first slice is Production Request write-through only. Later slices wait for a confirming gate and a separate go-ahead.

Read [the migration index](../supabase-migration/README.md) and [Phase 6](../supabase-migration/phase6/README.md) before editing code.

## What is already done (do not redo)

Studio list reads are on Supabase. Writes are still Airtable. Drive is still the media authority.

| Work | Production |
|---|---|
| B1 Pipeline + schedule grid | `studio_pipeline_read_source=supabase` |
| B2 `GET /api/content` | `studio_content_read_source=supabase` (`STUDIO_CONTENT_READ_SOURCE`, `secret_text`) |
| B3 Factory desk + Ops queue | `studio_factory_ops_read_source=supabase` (`STUDIO_FACTORY_OPS_READ_SOURCE`, `secret_text`). Secret install [run 42569635049](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42569635049) |
| Home `GET /api/profiles/overview` | `studio_home_read_source=supabase` (`STUDIO_HOME_READ_SOURCE`, `secret_text`). Code and Worker deploy [#1741](https://github.com/jtl6713/SM-Pipeline-V2/pull/1741). Secret install [run 42571757974](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42571757974) |
| Phase 5 write-through | `phase5_writes=airtable_sor_write_through` for `platform_outputs` and `content_items` |
| Global `studioReadSource()` | Hard-coded `airtable`. Do not make Home follow `STUDIO_READ_SOURCE` again |

Health gate [42571989580](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42571989580) at 12:16 AM CT:

- Worker `0.10.783-supabase-home-reads`
- Runner `2026-11-09-its1-exact-scene-count-v1`, `studio_write_source=airtable`
- Last sync finished 12:03 AM CT, `status=completed`, `ok=true`, circuit closed (`open=false`, `failures=0`)

The B3 installer refuses to run unless the live Worker still contains `0.10.782-supabase-b3-factory-ops-reads`. Do not re-run **Enable Studio B3 Factory Ops Supabase Reads**. The Factory/Ops secret is already installed.

## What this handoff is

Phase 6 is the next write-through domain: Production Requests, then media metadata, then the transfer queue, then the autonomous/cron writers for those tables. The shape is the Phase 5 pattern in `apps/studio-api/supabase-pipeline-reads.mjs` and `services/pipeline-runner/supabase_pipeline.py`: Airtable commit first, Supabase upsert after, Supabase failure does not fail the Airtable write.

The first code change is Production Request write-through in Worker `0.10.784-supabase-phase6-request-writes`. Leave every read flag and `STUDIO_WRITE_SOURCE` alone. Do not start media metadata, the transfer queue, or cron writers in that same change.

## What this handoff is not

- Not the Phase 5 remainder write switch. That ships separately as Worker `0.10.801-supabase-phase5-write-sor` plus `deploy/enable-studio-write-sor.txt`. Runner reads enable with `deploy/enable-runner-supabase-reads.txt`. Creates still mint `rec` ids in Airtable. Phase 7 is not started.
- Not Home profile-summary reads (`STUDIO_HOME_PROFILE_SUMMARY_READS`).
- Not `resolveAuthorization`.
- Not Phase 7. Do not delete or stop Airtable records.
- Not a Worker deploy by itself. Shipping a script change still requires a strictly higher Worker version and a new line in `deploy/cloudflare-worker-production.txt`. Do not bump a version when the only change is this document.

## Before writing code

1. The Production Request slice is already the Worker change above. The next slice still waits for Joseph to ask for it.
2. Dispatch is not available to the cloud agent (`workflow_dispatch` returns 403). Ask Joseph to run **Supabase Migration Gate Read-Only** on `main`.
3. Read the artifact. Continue only when `studio_pipeline_read_source`, `studio_content_read_source`, `studio_factory_ops_read_source`, and `studio_home_read_source` are `supabase`, `studio_read_source` is `airtable`, `phase5_writes` is `airtable_sor_write_through`, runner `studio_write_source` is `airtable`, and the latest sync is `completed` / `ok=true` with the circuit closed.
4. If the circuit is open or the sync is `partial`, `failed`, or lease-skipped, stop and report. Do not start Phase 6.

## Files the first slice will touch

- `apps/studio-api/supabase-pipeline-reads.mjs` — add the Production Request upsert next to the Output and Content Item write-through. Do not change `studioReadSource` or the four read-source functions.
- `apps/studio-api/supabase-pipeline-reads.test.mjs` — partial-body and failure tests, same shape as the Phase 5 content tests.
- The Worker call site that already write-throughs Airtable PATCH/POST. Production Request tables must be included explicitly. Other tables stay unchanged.
- `docs/supabase-migration/phase6/README.md` — mark only the Production Request slice live after the gate confirms it.
- Worker version in `apps/studio-api/worker.js` and one new line in `deploy/cloudflare-worker-production.txt` when the behavior ships. Health should report the new write-through as on, and `phase5_writes` must remain `airtable_sor_write_through`.

Do not add a secret installer in that first slice. There is no new flag.

## Stop conditions

Stop and report, without a follow-up deploy, if any of these happen:

- A change would set `STUDIO_WRITE_SOURCE`, `STUDIO_READ_SOURCE`, or any of the four read secrets.
- A Supabase error would fail or roll back the Airtable write.
- The change reads the pipeline runner from Supabase.
- The change writes media bytes, or stores anything other than a Drive id, into `media_assets`.
- The pool circuit opens during verification.
- The deploy workflow rolls the Worker back. Fix the deploy forward. Do not weaken the 1042/1104 probe or the binding contract.

## Verify after the first slice is deployed

Ask Joseph to run **Supabase Migration Gate Read-Only** again. Confirm the Worker version increased, the four read flags stayed `supabase`, both write sources stayed `airtable`, and the circuit stayed closed. Then spot-check one Production Request PATCH: the Airtable row is the committed row, and the Supabase `production_requests` row matches the identity fields from that response.
