# Phase 6 handoff (new agent start here)

**Date:** November 9, 2026, 12:18 AM CT. Updated after Joseph said to execute Phase 6.  
**Status:** Production Request, media metadata, transfer-queue, and transfer-target write-through are confirmed live. Gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688) at 8:55 PM CT on November 11, 2026 showed Worker `0.10.820-supabase-phase6-transfer-targets`, runner `2026-11-11-supabase-phase6-transfer-targets`, `phase6_writes=airtable_sor_write_through`, and `studio_media_transfer_targets` in `phase6_write_tables`. A follow-up count the same evening showed 16 join rows and 4 Production Request Output anchors. The first slice shipped in Worker `0.10.784-supabase-phase6-request-writes`. Phase 7 retirement is not started.  
**Joseph’s ask:** Execute Phase 6. The first slice is Production Request write-through only. Later slices wait for a confirming gate and a separate go-ahead.

Read [the migration index](../supabase-migration/README.md) and [Phase 6](../supabase-migration/phase6/README.md) before editing code.

## What is already done (do not redo)

Studio list reads are on Supabase. Writes are still Airtable for the other skip paths. Held-reschedule note readback reads Supabase when `STUDIO_WRITE_SOURCE=supabase`. Stale Ready for Review, phantom rerender, live-failed publish, and TikTok TTD0 candidate lists read Supabase when `STUDIO_WRITE_SOURCE=supabase` and do not list Airtable. Creative-master review-media, Instagram stale-upload recovery, and the other heals still list Airtable. Production Request, Media Asset, and transfer-queue creates commit to Supabase first when `STUDIO_PHASE6_WRITE_SOURCE=supabase`. A successful Airtable create still returns Airtable's `rec` id. A failed Airtable create keeps the Supabase row. A create without the insert identity still requires Airtable. Schedule and approve MAE verify reads Supabase when `maeSupabaseVerify` is set. Strict MAE occupancy reads Supabase when `STUDIO_WRITE_SOURCE=supabase` and does not walk Airtable. The half-hour job still reads Airtable and does not overwrite an existing Supabase-owned output schedule or Phase 6 row. Output and Content Item updates use Supabase first, with an Airtable legacy export. Phase 6 updates commit to Supabase first when `STUDIO_PHASE6_WRITE_SOURCE=supabase` (`deploy/enable-studio-phase6-write-source.txt`). `STUDIO_WRITE_SOURCE` does not cover these tables. Drive is still the media authority.

| Work | Production |
|---|---|
| B1 Pipeline + schedule grid | `studio_pipeline_read_source=supabase` |
| B2 `GET /api/content` | `studio_content_read_source=supabase` (`STUDIO_CONTENT_READ_SOURCE`, `secret_text`) |
| B3 Factory desk + Ops queue | `studio_factory_ops_read_source=supabase` (`STUDIO_FACTORY_OPS_READ_SOURCE`, `secret_text`). Secret install [run 42569635049](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42569635049) |
| Home `GET /api/profiles/overview` | `studio_home_read_source=supabase` (`STUDIO_HOME_READ_SOURCE`, `secret_text`). Code and Worker deploy [#1741](https://github.com/jtl6713/SM-Pipeline-V2/pull/1741). Secret install [run 42571757974](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42571757974) |
| Phase 5 write-through | `phase5_writes=supabase_sor_legacy_export` for `platform_outputs` and `content_items`. Runner `studio_write_source=supabase` |
| Global `studioReadSource()` | Hard-coded `airtable`. Do not make Home follow `STUDIO_READ_SOURCE` again |

Health gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688) at 8:55 PM CT on November 11, 2026:

- Worker `0.10.820-supabase-phase6-transfer-targets`
- Runner `2026-11-11-supabase-phase6-transfer-targets`, `studio_write_source=supabase`
- `phase5_writes=supabase_sor_legacy_export`
- `phase6_writes=airtable_sor_write_through` with `studio_media_transfer_targets` in `phase6_write_tables`
- Music, Asset Manager, and authorization reads are `supabase`. `studio_read_source` stays `airtable`
- Last sync finished 8:34 PM CT, `status=completed`, `ok=true`, circuit closed (`open=false`, `failures=0`)

The November 9 baseline was Worker `0.10.783-supabase-home-reads` and runner `2026-11-09-its1-exact-scene-count-v1` on gate [42571989580](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/42571989580).

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
3. Read the artifact. Continue only when `studio_pipeline_read_source`, `studio_content_read_source`, `studio_factory_ops_read_source`, and `studio_home_read_source` are `supabase`, `studio_read_source` is `airtable`, and the latest sync is `completed` / `ok=true` with the circuit closed. The live bar on gate [43144632688](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43144632688) is `phase5_writes=supabase_sor_legacy_export` and runner `studio_write_source=supabase`. Do not treat `airtable_sor_write_through` or runner `studio_write_source=airtable` as the current requirement.
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
