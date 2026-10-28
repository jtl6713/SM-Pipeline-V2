# Rendering Review — inactive atomic schedule-vacate adapter

Source: `apps/studio-api/rendering-review-schedule-owner.mjs`

This isolated adapter is a future dependency of Chicago manual Rendering Review. It is **not called by a production Worker route** and is **disabled by default**. It does not activate enrollment, change Airtable, reschedule, render or publish.

## Contract

- The caller owns the same R2 per-output approval lock as current Studio approval.
- The coordinator first invokes `scheduleRevocationReady` under the output lease. It returns true only if the protected write gate, existing `STUDIO_SCHEDULE_RESERVATIONS` Durable Object binding, and exact Chicago Instagram atomic lane are available.
- After a separate authoritative review-hold claim/readback, `revokeScheduleUnderHold` re-reads the exact Platform Output **and linked Content Item**. It validates Chicago profile, Reel type, hold ID/owner/session, `Do_Not_Publish=true`, and absence of remote media/post/dispatch evidence.
- It calls the existing `runAtomicScheduleTransaction` with action **vacate**. An unfenced legacy fallback is explicitly denied. Immediately before PATCH the same ownership, previous schedule and final artifact are reread and compared.
- The adapter delegates authoritative reads to injected `readOutput` and `readContentItem` callbacks and delegates the vacate PATCH **only** to injected `writeVacateUnderLane` from the canonical Worker scheduling owner. It has no direct Airtable writer. That guarded PATCH clears `Scheduled_Post_Date`, `Studio_Scheduled_At`, and `YouTube_Scheduled_Publish_At`, resets `Review_Status`, `Output_Status`, and `Publish_Status` to non-approved states while retaining the separately owned hold.
- The atomic transaction confirms authoritative readback before commitment. After commit, an injected mandatory `postCommit` callback handles non-authoritative mirror reconciliation. Failures remain held for audit rather than silently restoring old timestamps.
- All injected callbacks are trusted server-side integration points, not client payloads. Production must preserve protected binding/secret checks and the existing Supabase Phase 5 breaker.

## Still blocked

Actual protected Worker integration, live lane configuration proof, production readback, durable review session creation, conversational message APIs, rendering outbox, attempt-specific approval and hold release. Never use a production Reel or enable the pilot solely because these isolated tests are green.

Initial possible test output (read-only candidate, **not yet authorized**): Chicago Reel #8966, `rec277AJwhr5MS4tJ`, *Buckingham Fountain Night Dance*, saved December 16, 2026 schedule. No data was changed during candidate inspection.
