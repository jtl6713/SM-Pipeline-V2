# Atomic MAE Schedule Writer Inventory

Branch: `feat/atomic-mae-reservation-authority`

This inventory identifies code paths that can create, move, clear, or otherwise materially affect a Platform Output publishing time. The reservation boundary is Content Profile ID + Platform because output types on one platform share wall-clock capacity. Output-type lanes remain MAE sequencing inputs.

## Production scheduling writers

| Writer | Current behavior | Atomic-reservation requirement |
| --- | --- | --- |
| `approveOutputRecordForPublishing` (`worker-functions-04.mjs`) | Chooses MAE/story/manual time and PATCHes approval + schedule | Canonical reservation transaction; fresh occupancy inside lock; durable candidate; authoritative reread; commit then release |
| Factory single approve | Calls canonical approval with `recheckBestSlot:true` | Inherits canonical authority |
| Factory durable batch | Calls Factory single approve | Inherits canonical authority; batch-start snapshots are not final commit authority |
| Pipeline single approve | Calls canonical approval | Inherits canonical authority |
| Pipeline Approve All | Calls canonical approval, currently with in-memory occupancy and `skipOccupancyRefresh:true` | Flag-ON canonical commit must refresh authoritative occupancy inside the shared lane lock |
| AZ finished-video auto queue | Calls canonical approval after preplanning | Inherits canonical authority; preplanned time is only a preference until commit |
| Calendar/manual `POST /api/operations/outputs/:id/schedule` | Direct schedule PATCH | Same authority; exact manual time is conflict-validated and rejected rather than silently moved |
| Schedule regeneration | Durable MAE plan followed by chunked `airtableBatchUpdate` | Flag ON must serialize/revalidate each replacement commit; superseded occupancy remains protected until replacement verifies |
| `studioHealApprovedMissingSchedule` | Cron chooses MAE and directly PATCHes blank approved schedules | Same authority |
| `studioHealStoryCompanionDrift` | Cron directly moves a Story schedule | Same authority / recoverable move |
| Production Request fanout via `platformOutputSeedFields` | Initial Platform Output POST/PATCH may include `Scheduled_Post_Date` from `effective.scheduled_at` | The preapproval date is already visible to occupancy, so flag-ON writes must be mediated or deferred to canonical reservation |
| Continuation package stamping | Reuses seed builder but currently does not copy `seed.Scheduled_Post_Date` | Not a schedule writer today; preserve regression coverage |

## Non-writers / schedule consumers

Publish reconciliation, platform dispatch scans, schedule-grid reads, TikTok/Facebook/YouTube due selectors, and native-photo approve-incomplete repair consume an existing schedule but do not select a new occupied time. They do not need the authority unless later changed to write schedule fields.

## Existing coordination and occupancy

- `output-approval-lease.mjs` is a per-output R2 conditional lease. It remains in place. It prevents duplicate approval of one output but does not serialize different outputs competing for one platform.
- `studioLoadOccupiedScheduleRows` reads Airtable schedule dates and keeps published rows in the active lookback/horizon.
- `studioOccupiedForPlatform` merges output-type lanes for a platform; final reservation validation uses this platform-wide view.
- `studioOccupiedForLane` remains useful for output-type MAE sequencing.
- Regeneration's job/drain leases coordinate one regeneration job but do not fence concurrent Factory, Pipeline, manual, or healing writers.

## Cloudflare coordination and bindings

The production Worker currently has no scheduling Durable Object binding. The new authority is deliberately inactive until controlled rollout.

Optional bindings introduced by this branch:

- `STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED` — plain text feature flag. Missing/false leaves legacy behavior unchanged.
- `STUDIO_SCHEDULE_RESERVATIONS` — Durable Object namespace for `ScheduleReservationLane`, using SQLite storage.

The production deployment workflow generates configuration from the live Worker. Merely merging source changes does not enable the authority; the Durable Object binding plus flag-ON rollout is a separate gated production step.

## Cross-system commit rule

Cloudflare Durable Object storage and Airtable cannot share one database transaction. After a candidate is durably reserved, the caller moves the lane to `Verifying` before issuing the Airtable schedule write.

From `Verifying` onward, lease expiry never causes blind unlock. The lane is quarantined as `Recovery Required` until authoritative reconciliation proves:

1. Airtable contains the selected candidate: preserve it in the durable ledger and release the quarantine.
2. Airtable still contains the known previous value: only after the configured ambiguity settle period plus stable repeated reads may the incomplete reservation be abandoned.
3. Any other result: remain quarantined and escalate; never guess that the slot is free.

This fencing protocol prevents an expired writer and its replacement from independently committing competing slots across the Cloudflare/Airtable boundary.
