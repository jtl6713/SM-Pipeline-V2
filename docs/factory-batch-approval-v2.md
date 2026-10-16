# Factory Batch Approval V2 — implementation and operational release gate

Status: **WIP / DRAFT PR #786. DO NOT MERGE OR DEPLOY AS RELEASE-COMPLETE.**

## What this branch changes

- Factory page: per-content and per-output checkboxes, deduplicated output selection, local selection persistence, sticky one-click submit, authoritative server activity at page top, inspect items, failed-only retry. The UI does not wait for all items.
- Factory API: `GET/POST /api/factory/approval-batches` for profile-scoped R2 jobs. Legacy Pipeline Approve All remains untouched as a separate endpoint.
- Shared output-approval mutex: conditional R2 per-output lease now wraps the canonical `approveOutputRecordForPublishing` transaction used by Factory, Pipeline single approvals and legacy Approve All. Re-reads the latest Airtable record inside the lease and returns `__already_approved` without a second write or publishing dispatch. Expired leases permit recovery; this still requires staging integration testing.
- Durable queue: R2 job JSON under `studio/state/factory-approvals/v2/jobs/{profile}/{request_id}.json`; conditional If-None-Match avoids duplicate request IDs and conditional ETag writes prevent lost job updates. Per-profile lease under `.../locks/{profile}.json` serializes Factory batches. Canonical `factoryApproveOutput` checks state and invokes canonical schedule/publish gates.
- Resume: Cloudflare cron calls `factoryBatchCronResume` without a browser. Crashed workers can be reclaimed after lease expiry, with canonical output state reread before any further approval.
- Quality: typed signatures and health checks, bounded transient backoff and safe state reconciliation. Terminal failures stay manual unless Retry Failed is clicked.

## HTTP contract

POST start: `{ action:"start", content_profile_id:"rec...", request_id:"UUID", record_ids:["rec..."], items:[{id,output_id,platform,format}], notes:"..." }`

POST retry: `{ action:"retry", content_profile_id:"rec...", request_id:"original-id" }`

GET status: `/api/factory/approval-batches?profile=rec...` (latest for profile) or `&request_id=original-id`.

Returns `job_id,profile_id,request_id,status,total,approved_count,skipped_count,pending_count,failed_count,done_count,items,can_retry`; items contain `id,output_id,platform,format,status,error`, and GET includes `quality_signals`. Successes and already-satisfied outputs never become pending on retry.

## Quality Agent signatures

| Code | Meaning | Safe action |
|---|---|---|
| QA-FACTORY-BATCH-STALLED | 20 minutes without status change while pending | Cron retries after lease expiry; verify output first |
| QA-FACTORY-BATCH-STATE-MISMATCH | Job status disagrees with derived item totals | CAS reconcile job status only; no extra approval |
| QA-FACTORY-BATCH-DUPLICATE-ITEM | Duplicate output identifiers in persisted batch | Block auto-advancement and ticket; never publish twice |
| QA-FACTORY-BATCH-TRANSIENT-WAIT | Pending transient failure waiting for backoff | Defer until retry time; cap attempts |
| QA-FACTORY-BATCH-FAILED-ITEM | Terminal per-item approval failure | Inspect; operator Retry Failed only |

## User-facing rules

Selected items only — no bulk approval of invisible/nonreviewable outputs. Content checkbox includes ready sibling outputs; incomplete Stories block content-wide checkbox. Mixed profile selections are refused with an explanation to preserve profile-specific MAE scheduling; future cross-profile support must split per-profile jobs with explicit parent tracking. Existing individual Approve and content Approve All remain available.

Reopening Factory fetches fresh state from R2, not local browser state. Selection is browser-local and persists ordinary navigation; submitted batch records are server-global and accessible on another authorized device. An ambiguous HTTP timeout preserves request identity for retry.

## Hardening completed (2026-10-16)

- **Worker-accurate scheduling budget:** The canonical Factory drain processes up to 25 outputs per invocation while observing a 20-second elapsed-work budget. Incomplete jobs remain persistent and eligible for later cron continuation, rather than stopping unconditionally after five approvals. An explicit bound/resume unit test covers the remainder.
- **Non-starving recovery:** Cron uses `factoryBatchCronScan` with a CAS-persisted rotating R2 listing cursor. This avoids perpetually rereading the lexically first 200 historical batches. Unit tests cover 307 records across three passes and wrap-around.
- **Global output idempotency:** Shared R2 per-output lease and fresh Airtable reread cover existing Factory, Pipeline single-item and legacy Approve All approval paths. A cross-job-ID test exercises already-satisfied behavior without a second canonical commit; an output-lease test checks lock contention, reclaim and ownership.
- **Profile isolation:** Every batch approval resolves its actual linked Content Profile ID; if ownership cannot be established or mismatches, the item fails closed.
- **Quality checks:** Five Factory batch conditions registered in the quality catalog; terminal failures require explicit operator retry.

## Acceptance evidence

1. **GitHub automated gates**: dedicated Factory CI, Worker source split and Wrangler bundle dry-run, Cloudflare source validation, Complete Profiles Overview, Scheduled Queue Counts, functional regression and isolated 20-output Worker runtime checks have passed in earlier runs. Final updated commit CI runs must all complete before merging.
2. **Isolated Cloudflare Worker runtime**: [Factory Batch Runtime Acceptance](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/38949121380) passed: 20 outputs, HTTP-client disconnect, server-backed status from a separate client, 19 initial approvals + one controlled failure, failed-only retry to 20, duplicate submission reuse, and persistence after Worker restart.
3. **Actual Cloudflare R2 integration**: [Remote R2 acceptance](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/38950037510) **passed** with the real Cloudflare R2 binding. It used only `recFactorySmokeOnly` and test-only storage prefixes; **no Airtable records, platform APIs, real publishing, or UI approval routes were invoked**. Final stored totals: 20 approved, 0 failed, 20 unique commits. After restart, records persisted. Cleanup deleted 43 synthetic objects and confirmed test prefixes empty.
4. The disposable R2 bucket creation attempt was denied by existing Cloudflare token scope (Cloudflare API code 10000). The safe alternative was to use a synthetic namespace in the existing R2 bucket, with tightly scoped cleanup. No real content objects were removed.

## Remaining requirements before production merge

- **Production-route and scheduling integration:** A staging environment with review-ready Airtable outputs is required to validate the *actual* canonical Factory/Pipeline routes, correct MAE scheduling, Stories, TikTok/YouTube publishing gates and exactly-once handoff. The nonpublishing R2 smoke Worker intentionally cannot exercise these external side effects.
- **Device/browser UX acceptance:** Verify the actual Factory screen's top progress, mobile/tablet layout, and permissions across another authorized browser/device. Runtime HTTP-client disconnection and process restart were verified, but physical cross-device UI checks are not yet evidenced.
- **Quality Agent live inventory:** Verify signatures surface in its operator-facing alerts, not merely in the validated catalog and API status.
- **Release:** Complete repository-wide Worker/UI version bump, run all CI checks, review rollback point, merge to main and deploy through controlled Cloudflare workflows. Do not ship based solely on synthetic approval data.

**PR #786 stays draft until production-route acceptance and release gates are satisfied.**
