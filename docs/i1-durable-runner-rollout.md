# Durable manual AI Ideas (I1) runner — opt-in rollout

## Why
Old POST /api/ideas/generate returned 202 then completed multi-minute Python work
inside Cloudflare ctx.waitUntil. This feature moves manual I1 to a runner-owned
persistent queue, independent of the Worker request lifetime.

## Contract
- Studio creates an Airtable Idea Generation Batch (Airtable stays write authority).
- With Worker flag STUDIO_I1_DURABLE_JOBS=1, Studio submits the existing batch
  record ID to authenticated POST /jobs/i1-durable.
- Runner validates and commits an idempotent SQLite job BEFORE responding 202.
- A dedicated runner thread processes one job at a time and heartbeats a lease.
- On restart an expired lease is reclaimed, and linked Idea Candidates are
  reconciled before generating only missing ideas.
- Ambiguous Airtable writes stop for human review, never auto-retry.
- Runner writes Running, Generated_Count, Complete or Failed, UTC timestamps
  and error descriptions to the canonical Airtable batch.
- New candidates are seeded in Waiting for existing photo-listening cron.
  Immediate per-idea photo matching is no longer part of I1 completion.
- Daily I1 and legacy manual I1 remain unchanged until flags are enabled.

## Safe rollout
1. Provision a truly persistent and backed-up runner filesystem or volume.
   Set I1_JOB_DB_PATH to an absolute path on that volume. Docker writable
   layers and /tmp are not persistent and are unacceptable.
2. Restrict storage permissions and configure PIPELINE_RUNNER_SHARED_SECRET.
3. Enable I1_DURABLE_ENABLED=1 on the runner. Verify /health shows
   i1_durable_jobs=true, and missing authentication fails closed.
4. Prove SQLite persistence across actual runner restart and recovery from
   interrupted batches with isolated synthetic Airtable records. Never use
   live publishing or a real customer batch for the canary.
5. Enable Worker STUDIO_I1_DURABLE_JOBS=1 only after runner verification and
   deploy through guarded GitHub Worker workflow.
6. Test a small batch end to end: immediate acknowledgement, Pending to
   Running to Complete, canonical linked candidates equals requested count.
   Compare elapsed time, 429s, error rate, model requests and Airtable reads.

## Recovery and rollback
- A dispatch timeout is ambiguous. The Worker leaves the existing batch
  Pending with dispatch_unconfirmed; check authenticated runner job status
  before re-enqueueing the SAME batch. Submitting an identical batch is safe.
- An explicit admission rejection marks the batch Failed, clearing overrides.
- Partial or uncertain Airtable creates are preserved and fail closed.
- To roll back, disable the Worker feature flag FIRST, then allow already
  accepted runner jobs to drain. Disabling runner first strands jobs.
- Persistent volume survives process restarts; it is NOT cross-region HA.
- No automatic repair of admission-time network ambiguity is included yet.
  Do not label this fully highly-available before those controls are tested.

## Tests
- PYTHONPATH=services/pipeline-runner python -m pytest -q services/pipeline-runner/tests/test_i1_durable_jobs.py
- node --test apps/studio-api/idea-generation-durable.test.mjs
- node --test apps/studio-api/idea-generation-error-boundary.test.mjs

Do not deploy until existing source-split, CI and Factory canary gates pass.
