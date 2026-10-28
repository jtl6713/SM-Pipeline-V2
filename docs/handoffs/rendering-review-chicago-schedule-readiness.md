# Chicago Rendering Review — schedule readiness gate (inactive)

## 2026-10-28 verified context
- Read-only UI 0.6.764 is deployed and custom-domain verified through #1213; backend queue is authorized, with 5 Chicago entries and latest batch-read time 2.904840 seconds through #1214.
- Independent Airtable read of the authoritative Platform Outputs table found **zero Chicago Instagram Reel outputs** that simultaneously had Render_Status=Rendered, Final_File_ID populated, Scheduled_Post_Date empty, Platform_Post_ID empty, and Publish_Started_At empty. Two outputs matched this exact query across all profiles, neither Chicago. This is a time-bounded observation, not proof no Chicago candidate can ever exist.
- Consequently, the first safe manual Chicago review likely requires changing an existing future schedule. Merely flipping admission to true is unsafe.

## New fail-closed contract
The server-only `enrollManualReviewCommand` must call `operations.assertScheduleRevocationReady` under the same per-output approval lock, **before** writing any review hold or touching Airtable schedules. The authoritative output identity, profile, platform, output type, original schedule, prior approval and exact review owner are supplied from the locked server read. Only an explicit boolean `true` passes. Missing, unavailable or false capability denies enrollment with `SCHEDULE_REVOCATION_UNAVAILABLE` and **zero writes**.

The production Airtable adapter leaves `scheduleRevocationReady=null` by default. Its preflight checks `mutationGate` before executing. Tests inject an explicit mock capability; this is not evidence the live scheduler is connected. Revalidating the schedule under the lease and performing the actual hold-first atomic vacate, Airtable readback and session creation still happen separately.

## Activation blockers
1. Implement an authenticated, server-owned `scheduleRevocationReady` that checks effective atomic MAE lane availability or an independently safe legacy writer. Never accept a client-provided readiness bit.
2. Provide `revokeScheduleUnderHold` through the existing shared schedule authority, verify the exact previous slot is vacated, and refuse ambiguous legacy/atomic lease states. Preserve unrelated holds.
3. Wire manual enrollment under the same authorization and R2 per-output approval lease as the existing publisher. Only after tests and a protected canary should the gate become available for a single Chicago Reel.
4. Build durable, versioned message APIs with model-backed Producer reasoning and validated assets; connect immutable render attempts/outbox/callbacks, then exact approved-attempt scheduling and held-release proof.
5. Reconcile live Airtable review counts and publishing fences at every stage. No public post canary or automatic selection.

## Safety unchanged
Airtable remains write SoR; Google Drive remains media authority. `REVIEW_PILOT.enabled=false`, sampling 0, integration unverified; no new output is enrolled, held, rescheduled or published by this change.
