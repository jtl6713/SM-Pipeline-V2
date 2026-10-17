# Factory Batch Approval V2 — implementation and operational release gate

Status: **Release candidate in DRAFT PR #789. New multi-select batch approval POST is server-side gated off by default.**

## What this branch changes

- Factory page: per-content and per-output checkboxes, deduplicated output selection, local selection persistence, sticky one-click submit, authoritative server activity at page top, inspect items, failed-only retry. The UI does not wait for all items.
- Factory API: `GET/POST /api/factory/approval-batches` for profile-scoped R2 jobs. Legacy Pipeline Approve All remains untouched as a separate endpoint.
- Shared output-approval mutex: conditional R2 per-output lease now wraps the canonical `approveOutputRecordForPublishing` transaction used by Factory, Pipeline single approvals and legacy Approve All. Re-reads the latest Airtable record inside the lease and returns `__already_approved` without a second write or publishing dispatch. Expired leases permit recovery; this still requires staging integration testing.
- Durable queue: R2 job JSON under `studio/state/factory-approvals/v2/jobs/{profile}/{request_id}.json`; conditional If-None-Match avoids duplicate request IDs and conditional ETag writes prevent lost job updates. Per-profile lease under `.../locks/{profile}.json` serializes Factory batches. Canonical `factoryApproveOutput` checks state and invokes canonical schedule/publish gates.
- Resume: Cloudflare cron calls `factoryBatchCronResume` without a browser. Crashed workers can be reclaimed after lease expiry, with canonical output state reread before any further approval.
- Quality: typed signatures and health checks, bounded transient backoff and safe state reconciliation. Terminal failures stay manual unless Retry Failed is clicked.

## Controlled rollout guard (added after staging)

- New `POST /api/factory/approval-batches` requests are **disabled by default**. Only an explicit Worker environment variable `FACTORY_BATCH_APPROVALS_ENABLED=true` enables batch approval mutations. With the flag unset, POST returns HTTP 503 **before** reading the request body or creating any batch, and individual Factory/Pipeline approval routes remain available.
- `GET /api/factory/approval-batches` remains read-only and returns `approvals_enabled`. Factory UI disables Submit Approvals with a descriptive tooltip if that value is false; existing approved/failed batch status remains visible.
- **Release sequence:** synchronize the branch with current `main`, use the next Worker and UI version **after comparing the latest main versions**, pass all CI, merge and deploy with the flag absent/false, inspect health/read-only Factory, then enable the flag only after a live nonpublishing staging write test is independently validated. Feature activation is separate from code deployment.
- Rollback activation by setting the flag false/unset, independent of restoring the previous Worker/UI versions. Never enable the flag simply to make CI pass or exercise unapproved production content.

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

## Staging validation with real Airtable review-ready records — 2026-10-16

The only linked Airtable content base is **the production Content Creator base**, not a separate staging base. For safety, the following **actual-record read-only audit** and **isolated staging execution replay** were performed without making a real approval or platform request.

- Read the real Platform Outputs, Content Items and Content Profiles tables using the connected Airtable account. More than 170 records showed `Ready for Review` Output_Status; the canonical `studioOutputReadyForPublishApproval` guard excluded already-approved/published/Do_Not_Publish cases even when that old output label remained.
- Selected 20 actual review-ready records belonging to LA Content Profile `recF7UAn0LkMZZrWZ`, exactly five each for Instagram, Facebook, YouTube and TikTok. Independently verified that all nine related Content Items pointed to that LA Content Profile, with `America/Los_Angeles` timezone.
- Ran the *real MAE schedule module* against those IDs read-only. All 20 prospective slots were priority slots in the correct local timezone with no intra-platform collisions or overnight blackout. Slots were **not written** to Airtable.
- Added a staging-browser test with these actual 20 record IDs (a read-only snapshot) and the **real Factory HTML, JavaScript and CSS**. Isolated HTTP handlers intercepted all API calls. Chromium desktop selected nine content groups / 20 outputs, tested an individual checkbox and the toolbar, submitted once, closed the first browser session and opened a separate mobile browser session. It restored authoritative counts, inspected 20 results, and retried only the one controlled failure. No Airtable writes, social publishing or external API calls occurred. [Green screenshot-producing browser staging run](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/38954015415). Screenshots are in that run's `factory-stage-20-real-record-ids` artifact.
- **Fixed two production-code defects discovered by this browser test:** the per-card `state` string shadowed Factory batch state and broke Needs Eyes rendering; output/content checkbox handlers omitted `updateFactoryBatchToolbar()`, leaving the Submit button disabled/stale. Both fixes are in this feature branch and have passed the browser staging run.
- Added `factory-real-record-publish-route.staging.test.mjs` to replay the real canonical `factoryApproveOutput` handler with those same real record identities, in-memory Airtable replicas and a no-op publishing transport. The test asserts 20 distinct state writes and MAE placements, no duplicate re-dispatch on repeat, and fail-closed handling of already-approved, published, Do_Not_Publish, and still-rendering cases. **This is an isolated publishing-route behavioral test, not a live platform-publish test.** The focused Factory CI suite includes this test.
- The *live* Cloudflare R2 integration previously passed 20 synthetic outputs and cleaned all 43 synthetic objects [R2 run](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/38950037510).

**Safe staging completed**: read-only live records + isolated Factory browser and publishing route replay. **Not completed**: an environment with independently writeable nonproduction Airtable records and disabled real platform dispatch, which would be necessary to assert an actual multi-output route POST updated Airtable and generated real scheduled platform handoffs without risk to existing production content.

## Remaining requirements before production merge

- **Production-route and scheduling integration:** A staging environment with review-ready Airtable outputs is required to validate the *actual* canonical Factory/Pipeline routes, correct MAE scheduling, Stories, TikTok/YouTube publishing gates and exactly-once handoff. The nonpublishing R2 smoke Worker intentionally cannot exercise these external side effects.
- **Device/browser UX acceptance:** Verify the actual Factory screen's top progress, mobile/tablet layout, and permissions across another authorized browser/device. Runtime HTTP-client disconnection and process restart were verified, but physical cross-device UI checks are not yet evidenced.
- **Quality Agent live inventory:** Verify signatures surface in its operator-facing alerts, not merely in the validated catalog and API status.
- **Release:** Complete repository-wide Worker/UI version bump, run all CI checks, review rollback point, merge to main and deploy through controlled Cloudflare workflows. Do not ship based solely on synthetic approval data.

**PR #789 is the clean-main release candidate. Deploy only with batch approval disabled; do not activate real posting without controlled, explicitly authorized live test records.**

## Controlled gated production release (2026-10-16)

- **Clean main integration:** Release PR #789 (`release/factory-batch-v2-main-sync-20261016`) reapplies the Factory changes onto the latest main without replacing the newer duplicate-purge, Supabase and Factory worker changes.
- **Version identifiers:** Studio UI `0.6.708-factory-batch-gated`; Worker `0.10.650-factory-batch-gated`.
- **Feature flag:** `FACTORY_BATCH_APPROVALS_ENABLED` is checked by `POST /api/factory/approval-batches`; only the exact case-insensitive value `true` enables batch writes. Missing/false returns HTTP 503 before parsing the payload; legacy Pipeline single approval and Approve All are unaffected. The GET status endpoint exposes `approvals_enabled: false` so the UI disables new batch submission while showing history.
- **Safe activation order:** deploy default-off Worker first; verify Worker health/version and GET Factory batch status; deploy new UI and verify live script version, Needs Eyes card rendering and disabled Submit; check no unexpected dispatches or R2 active jobs. When separately authorized, provision nonproduction writable test outputs and disable social-platform transport; perform the actual API POST staging exercise, then enable the flag only through a controlled release decision.
- **Rollback:** disable/remove flag first (disables POST immediately upon Worker env redeploy); revert deployment through Cloudflare's verified last-active-version capture if needed. Do not delete existing queue ledgers or historical R2 state to roll back.
- **Important:** the permanent release branch does not contain a developer backdoor to force approvals or bypass platform publishing safeguards.

## Writable isolated Airtable staging acceptance — 2026-10-16

The isolated base `appJ0ox62OMfZuE1v` has synthetic linked Profile / Content Item / Platform Output records. A GitHub Actions staging-only personal access token (`STAGING_AIRTABLE_API_TOKEN`) is restricted to this base. The trusted release-branch workflow `.github/workflows/factory-live-airtable-staging.yml` exercises the **actual Worker source handlers** `factoryBatchSubmitRoute` → `factoryBatchProcess` → `factoryApproveOutput` → `approveOutputRecordForPublishing`, plus the production MAE schedule-fields handler, with real HTTP reads and PATCHes against this *staging* Airtable base. R2 storage and external publishing/Supabase transports are intentionally intercepted in-process; neither Cloudflare Worker staging HTTP deployment nor real social-platform handoff was tested.

[Green writable staging acceptance run](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/38987014023) verified: four real synthetic output approval writes; one `Do_Not_Publish` output rejected; duplicate submission idempotence; failed-only retry without duplicate writes; scheduled dates in Los Angeles MAE windows; flag-disabled POST rejected and GET status still readable. The five temporary output records were deleted by the test cleanup. It did not approve, schedule, or dispatch any real production content. The Worker production deploy workflow explicitly writes `FACTORY_BATCH_APPROVALS_ENABLED=false` and rejects its own release if the active binding is not false.

**This supports a guarded, default-OFF code deployment. It does not authorize enabling real Factory batch submissions.** Enabling requires a separately authorized, isolated deployed-Worker HTTP test (with dedicated Cloudflare R2 and no publishing credentials), additional UI/Quality Agent acceptance, and an activation decision.

## Deployed isolated staging Worker HTTP acceptance — passed (2026-10-17 UTC)

A separate Cloudflare script `sm-pipeline-v2-factory-approval-staging`, dedicated R2 bucket of the same name and isolated staging Airtable base `appJ0ox62OMfZuE1v` were provisioned manually by the operator and bound by `wrangler.factory-staging.jsonc`. The actual eight canonical Factory Worker handler implementations were included in the staging-only Worker build, but external social-platform publishing and Supabase calls were deliberately intercepted. The staging script is authenticated with an ephemeral bearer key; the Airtable PAT is a Cloudflare Worker secret scoped to the staging-only base. No production credentials/buckets were bound.

**Evidence:** [Deployed HTTP acceptance run #38992358333](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/38992358333) passed against the real workers.dev HTTPS Worker URL. Logged PASS: existing dedicated binding preflight, pinned Wrangler compile, initial disabled deployment, secret and R2 allowlist isolation, unauthenticated request denied, feature-off POST denied, brief staging-only activation, batch POST with five unique synthetic records (duplicate selection deduped), real waitUntil background processing and durable Cloudflare R2 status (four approved / one `Do_Not_Publish` failed), four real staging Airtable approval writes, idempotent duplicate submission, failed-only retry with no rescheduling of successful outputs, cleanup deleting all five temporary Airtable records, staging flag re-locked false, status preserved across Worker redeploy, and synthetic R2 ledger cleanup. Original four `Do_Not_Publish` canary outputs remain untouched in the isolated base.

**Production flag remains OFF.** This completes the deployed Worker + real staging Airtable/R2 integration gate previously untested by the in-memory replay. It is **not** approval to activate production Factory batch submissions: still verify device/browser Factory UI behavior and Quality Agent operator visibility, review Story/platform-specific routes, and obtain explicit production activation authorization. If future staging CI fails to relock automatically, open only the staging Worker's Cloudflare Settings and restore `FACTORY_BATCH_APPROVALS_ENABLED=false`; never change the production Worker's flag for a staging test.
