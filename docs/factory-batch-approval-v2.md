# Factory Batch Approval V2 — implementation and operational release gate

Status: **WIP / DRAFT PR #786. DO NOT MERGE OR DEPLOY AS RELEASE-COMPLETE.**

## What this branch changes

- Factory page: per-content and per-output checkboxes, deduplicated output selection, local selection persistence, sticky one-click submit, authoritative server activity at page top, inspect items, failed-only retry. The UI does not wait for all items.
- Factory API: `GET/POST /api/factory/approval-batches` for profile-scoped R2 jobs. Legacy Pipeline Approve All remains untouched as a separate endpoint.
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

## Release blockers and mandatory tests

1. Verify actual production R2 conditional `put(onlyIf)` behavior against Cloudflare, not merely the FakeR2 test.
2. Validate full Wrangler deploy dry-run and generated source modules after source-split markers.
3. Verify Quality Agent checks appear in the actual inventory, not only the catalog and R2 status endpoint.
4. Verify no duplicate approval under concurrent Factory batches AND overlapping existing single-item/Pipeline Approve All routes.
5. Run 20 live/review-ready approvals in a controlled staging environment, submit and instantly close browser, and verify later from a different device that every selected ID has exactly one result, with correct MAE schedule and no unintended publication.
6. Confirm mobile/tablet Factory and existing single-item, Story and TikTok draft regressions.
7. Bump versions via repository-wide standard and deploy only after all required workflows pass. Verify live Cloudflare Worker/UI versions and rollback readiness.

Do not declare complete until the real 20-output browser-close acceptance and single-item regression are verified.
