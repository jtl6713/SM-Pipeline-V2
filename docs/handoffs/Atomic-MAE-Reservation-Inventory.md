# Atomic MAE Scheduling Reservation Authority — Route & Binding Inventory

Status: implementation branch only; feature disabled by default.

Branch: `feat/atomic-mae-reservation-authority`  
Draft PR: #819  
Production behavior: unchanged.

## 1. Reservation lane

The serialization key is:

```
Content Profile record ID + normalized Platform
```

Examples:

- `recChicago...::facebook`
- `recChicago...::tiktok`
- `recNewYork...::tiktok`

Output type is deliberately **not** part of the lock key. MAE may still use an
output-type lane for balancing/sequencing, but the platform wall-clock occupancy
is shared across output types.

## 2. Existing Cloudflare bindings

The current Studio API binding contract has ten core bindings:

- AIRTABLE_BASE_ID
- AIRTABLE_CONTENT_TABLE_ID
- AIRTABLE_IDEA_TABLE_ID
- AIRTABLE_MEDIA_TABLE_ID
- AIRTABLE_MUSIC_VIEW_ID
- AIRTABLE_OUTPUT_TABLE_ID
- AIRTABLE_PAT
- ALLOWED_ORIGINS
- I3_DECISION_WEBHOOK_URL
- STUDIO_MEDIA (R2)

There are additional optional Factory rollout, pipeline-runner, Supabase, and
ElevenLabs bindings.

This branch adds two **optional** bindings to the contract:

- `STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED` — plain text feature flag.
- `STUDIO_SCHEDULE_RESERVATIONS` — Durable Object namespace.

The flag is false when absent. If the flag is explicitly enabled and the Durable
Object binding is unavailable, scheduling must fail closed with 503.

### Production rollout caveat

The current safe-rollout workflow rebuilds a Wrangler configuration from the
live Worker and explicitly preserves the existing core text/R2/secret binding
set. It does not yet define a Durable Object namespace or Durable Object
migration.

That is intentional during this phase: production must remain unchanged.

Before staging/production activation, add an explicit Durable Object binding and
migration, for example a Wrangler `durable_objects.bindings` entry plus a
`new_sqlite_classes` migration for `ScheduleReservationLane`. Do not add that
migration to production until deterministic concurrency/recovery tests pass.

## 3. Actual Platform Output schedule writers

### A. Canonical approval

Function:

`approveOutputRecordForPublishing(...)`

Callers include:

- Pipeline single-output review/approve via `reviewOutputCreative(...)`.
- Factory single-output approval via `factoryApproveOutput(...)`.
- Factory background batch approval, which funnels through Factory approval.
- Pipeline Approve All via `studioProcessApproveAllJobSlice(...)`.

Current behavior:

- Per-output R2 approval lock.
- Re-read the Platform Output.
- Read occupancy.
- Pick/recheck MAE.
- PATCH approval + schedule into Airtable.
- Write through to Supabase.

Concurrency risks:

1. The per-output lease serializes only the **same output**, not two different
   outputs competing for the same profile/platform.
2. Approve All passes `skipOccupancyRefresh: true` and relies on an in-memory
   batch occupancy snapshot. Another batch or Pipeline approval can commit while
   that snapshot is being used.
3. The canonical approval path currently calls `studioOccupiedForLane(...)`
   and then `maeScheduleNextSlot({ occupiedMs })`. The MAE engine itself
   supports separate `laneOccupiedMs` and `platformOccupiedMs`, but canonical
   approval is not currently supplying the platform-wide view. Therefore two
   different output types on the same platform can miss one another.
4. A successful Airtable PATCH is not re-read and compared with the selected
   schedule before the per-output approval transaction returns.

Migration:

- Preserve the existing per-output approval lock.
- Acquire profile/platform Durable Object while still inside the output lock.
- Re-read authoritative occupancy inside the lane lock.
- Compute both output-type lane occupancy and platform-wide occupancy.
- Merge durable committed reservations that may not yet appear in Airtable.
- Run existing MAE preference unchanged.
- Stage the selected reservation.
- Enter Verifying immediately before Airtable PATCH.
- PATCH Airtable.
- Re-read the output from Airtable and verify exact stored schedule.
- Commit reservation ledger.
- Release lane.
- Only after this may the next contender schedule.

### B. Pipeline / Operations manual schedule route

Function:

`scheduleStudioPublishOutput(...)`

Route:

`/api/operations/outputs/:recordId/schedule`

Current behavior:

- Manual override intentionally skips occupancy loading and keeps the requested
  time (unless blackout handling rejects/adjusts it in schedule-field logic).
- Automatic save can load platform occupancy.
- Direct Airtable PATCH.
- Supabase write-through.

Risk:

Two manual or automatic writes can race. An explicit manual time currently has
no lane-level concurrency/conflict serialization.

Migration:

- Manual override retains the operator's exact requested time when valid.
- Still acquire profile/platform lane.
- Refresh platform occupancy inside lock.
- Validate explicit time for blackout/conflict.
- If conflict exists, return a clear 409; do not silently choose another time.
- Use action `move` when replacing an existing schedule.
- Verify Airtable stored the requested time before releasing.

### C. Schedule regeneration

Function:

`studioProcessScheduleRegenJobSlice(...)`

Current behavior:

- Durable schedule-regeneration job and drain leases.
- Builds an MAE plan, persists plan checkpoints, then applies Airtable updates in
  chunks with `airtableBatchUpdate(...)`.
- Tracks `lane_reserved_ms` and `platform_reserved_ms` within one regen job.

Risk:

The regen job lease protects the regen job, not the profile/platform scheduling
lane. A Pipeline approval, Factory batch, another regen job, or manual move can
commit after the plan snapshot was built but before a plan chunk is written.

Migration:

- Keep the existing regen job lease for job progress.
- Every individual schedule move must also use the shared profile/platform
  reservation authority.
- Revalidate each planned slot against fresh occupancy at commit time.
- If the originally planned slot is no longer valid, re-run MAE under the lock
  rather than forcing the stale plan.
- Treat each change as a two-phase `move`: old output occupancy remains
  represented until the replacement schedule is verified and committed.
- A whole chunk must not hold one lane lock while doing unrelated output work.

### D. Missing-schedule cron heal

Function:

`studioHealApprovedMissingSchedule(...)`

Current behavior:

- Scans Approved-for-Publishing rows with blank schedules.
- Caches occupancy by profile.
- Picks MAE/Story companion time.
- Direct Airtable PATCH.
- Adds the booked time only to the in-memory output-type lane.

Risk:

Concurrent cron, batch approval, Pipeline approval, or another Worker isolate can
choose the same slot. It also does not add the booking to every same-platform
output type in its local occupancy view.

Migration:

- One atomic reservation transaction per healed output.
- Fresh authoritative occupancy under lane lock.
- No fail-soft scheduling when authority is enabled.

### E. Story companion drift heal

Function:

`studioHealStoryCompanionDrift(...)`

Current behavior:

- Finds approved Stories that should move to same-platform main + 10 minutes.
- Direct Airtable PATCH.

Risk:

The move can race manual scheduling, regen, approval, or another heal.

Migration:

- Use action `move` under the shared lane authority.
- The companion rule remains unchanged.
- Verify the final stored companion schedule before release.

### F. Factory output delete / skip

Function:

`factoryDeleteDeskItem(...)`

Current behavior:

- Can clear `Scheduled_Post_Date` for one or multiple unpublished sibling
  outputs using `airtableBatchUpdate(...)`.

Risk:

A cancellation can clear a date while another transaction is moving or
reserving the same output/lane. The reservation ledger could otherwise continue
to claim a vacated slot or, worse, remove occupancy before the Airtable clear is
known to be durable.

Migration:

- Resolve each target's profile/platform.
- Use action `vacate` under the shared lane.
- Keep the old committed occupancy represented until Airtable is verified blank.
- Do not batch-clear unrelated profile/platform lanes under one lock.

## 4. Schedule-related writes that are not independent occupancy commitments

These must be reviewed but should not be treated as separate slot allocators:

### Native-photo approve-incomplete heal

`studioCompleteNativePhotoPublishArming(...)`

It reads/preserves the existing `Scheduled_Post_Date` while repairing approval
arming. It does not independently select a new time.

### TikTok resend

`resendStudioTiktokDraft(...)`

It passes the existing scheduled date into TikTok re-arm fields. It should not
create a second reservation.

### YouTube upload retry reset

`studioResetYoutubeUploadForRetry(...)`

It clears `YouTube_Scheduled_Publish_At` while leaving the canonical
`Scheduled_Post_Date` intact. Platform occupancy currently prefers
`Scheduled_Post_Date`, so this is a publisher-state reset, not a reservation
vacate. Migration must preserve that distinction.

### Production Request Output `Scheduled_At`

Upstream Production Request Output records may carry `Scheduled_At` metadata
when production outputs are created. This is not the authoritative Platform
Output publish occupancy and is outside the reservation authority until it
becomes a Platform Output schedule commitment.

## 5. Reservation authority state model

Owner states:

```
Waiting -> Acquired -> Reserving -> Verifying -> Committed -> Released
```

Failure/recovery states:

```
Retryable Failure
Recovery Required
Expired
Reconciled
```

A fencing generation increments on each new owner or recovery owner.

### External write safety boundary

`Acquired` and `Reserving` are pre-write states. If their lease expires, a
new owner may fence and replace them safely.

`Verifying` means an Airtable write may be in flight. If that owner's lease
expires:

1. The lane becomes Recovery Required.
2. A new scheduling owner is not granted.
3. Recovery increments the fencing generation, fencing the stale owner.
4. Airtable is inspected.
5. If the authoritative schedule matches the selected reservation, the ledger
   is reconciled as committed and the lane is released.
6. If Airtable does not show the write, the lane is still not immediately
   cleared. Automatic abandonment requires a conservative ambiguity settle
   window and two stable authoritative observations.
7. Any mismatch remains quarantined for Needs Eyes.

This avoids the unsafe pattern of "lease expired, therefore slot is free."

## 6. Durable reservation ledger

Each lane keeps durable reservation records keyed by reservation ID and a
bounded list of recently committed output schedules.

The recent committed list is not equivalent to lock ownership:

- Releasing a lock does **not** free a committed scheduled time.
- A committed schedule remains occupancy.
- A `move` replaces an output's old occupancy only after the replacement is
  verified.
- A `vacate` removes occupancy only after Airtable is verified blank.

When a new owner acquires the lane, the authority returns committed
reservations for other outputs so the scheduler can merge them with the fresh
Airtable occupancy read.

## 7. Quality Agent discoverability

Durable Object namespaces cannot be treated as an enumerable job table.

The authority therefore mirrors a sanitized lane snapshot to the existing
`STUDIO_MEDIA` R2 bucket under:

```
studio/state/schedule-reservation-lanes/v1/
```

The snapshot contains lane identity, generation, lock age, heartbeat age,
quarantine state, waiter count, and recent-reservation count; no secrets.

This R2 prefix is intended to become the Quality Agent scan index for:

- QA-SCHEDULE-LOCK-HUNG
- QA-SCHEDULE-LOCK-CONTENTION
- QA-SCHEDULE-RESERVATION-DRIFT
- QA-SCHEDULE-COLLISION
- QA-SCHEDULE-QUEUE-STALLED

Catalog entries must not be described as active monitoring until the runtime
cron actually scans this prefix and evaluates the checks.

## 8. Initial thresholds in the authority

- Lease: 90 seconds.
- Heartbeat warning: 60 seconds.
- Contention telemetry: 30 seconds.
- Queue warning: 2 minutes.
- Ambiguous external-write settle period before safe "not committed" recovery:
  5 minutes.
- Stable recovery observation spacing: 30 seconds.

These are constants now and should move to controlled configuration only after
load testing proves safe ranges.

## 9. Migration order

1. Durable Object authority + deterministic unit tests.
2. Canonical transaction adapter.
3. Canonical approval path (Pipeline/Factory/batch/Approve All).
4. Manual schedule route.
5. Missing-schedule and Story drift heals.
6. Regeneration commit path.
7. Factory cancellation/vacate.
8. Quality Agent runtime scan/recovery.
9. Staging Wrangler namespace + migration.
10. Concurrency/recovery stress tests.
11. Controlled canary.
12. Only then consider production flag activation.

Until step 10 passes, production flag remains disabled.
