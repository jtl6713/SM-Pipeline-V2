# QA Test Center — implementation and release contract

**Status (November 6, 2026): working draft implementation on PR #1429, NOT merged, NOT deployed, NOT production-validated.** The former foundation-only description is obsolete. Do not claim that the user has a functioning production QA Test Center until GitHub deployments and live authenticated user testing are verified.

## Implemented draft capabilities

- Admin-only navigation under **QA Test Center**, responsive catalog, search, exact procedural steps, prerequisites and expected outcomes.
- 88 versioned functional/regression cases in `docs/qa-test-center/catalog.v1.json`; runtime snapshot in `apps/studio-api/qa-catalog.mjs`.
- API authenticated by existing Studio membership and `tenant_admin` authorization; POST uses existing origin/write safeguards and bounded JSON. No public QA API.
- Airtable canonical **QA Test Runs** (`tblYwzehVtmyUMzj5`) and **QA Executions** (`tblsg5E1cq8nb240c`) were provisioned in base `appe33zkZn35yirTL`. No historical QA runs or results were backfilled. Current event kinds include manual results, automated observations, human review and waiver. All events append; there are no PATCH/DELETE endpoints.
- Manual Pass/Fail/Blocked with notes, evidence references, persisted UTC server timestamps and actor identity. **Manual Pass requires observed notes or evidence**; Fail and Blocked require explanatory notes.
- Safe allowlisted, bounded automated observations with real evidence; unregistered test IDs/URLs/scripts never execute. An unavailable diagnostic returns Error/Blocked, never a fabricated Pass. Current safe actions in the HTTP layer: `QA-DIAG-001` Worker health, `QA-CAT-001` catalog integrity and `QA-AT-001` canonical QA run read. Other diagnostic recipes are deliberately not exposed as an arbitrary executor.
- An independent administrator must approve an automated Pass (self approval prohibited). Saved event timeline, per-run serialized write lease, idempotent retry, canonical Airtable readback, release gate and previous-run regression comparison. A run can be explicitly finalized as Approved/Rejected/Incomplete with an immutable `RunFinalized` event; further writes are denied.
- Release gate deliberately fails closed on missing evidence, failed/blocked cases, pending AI review, and unattested Runner deployment. Waivers remain visible but **cannot silently override a failed release gate**.

## API routes (all require authenticated tenant administrator)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/qa/catalog` | Catalog version, allowed automation IDs, instructions |
| GET/POST | `/api/admin/qa/runs` | Bounded run listing / append run |
| GET | `/api/admin/qa/runs/:runId` | Run and immutable event history |
| POST | `/api/admin/qa/runs/:runId/results` | Append a manual observation |
| POST | `/api/admin/qa/runs/:runId/execute/:testId` | Only allowlisted read-only registered checks |
| POST | `/api/admin/qa/runs/:runId/approvals` | Independent human approval/rejection |
| POST | `/api/admin/qa/runs/:runId/waivers` | Append bounded risk acknowledgment (no automatic gate bypass) |
| POST | `/api/admin/qa/runs/:runId/finalize` | Atomically finalize a run with append-only release decision; block further writes |
| GET | `/api/admin/qa/runs/:runId/gate` | Deterministic fail-closed release gate |
| GET | `/api/admin/qa/runs/:runId/regressions?baseline=:runId` | Compare two same-revision runs |

## Human test operator procedure

1. After *verified* deployment, authenticate as a tenant administrator and open **QA Test Center** in Studio Admin. The navigation must be unavailable to non-admins, and every unauthorized API request must return 401/403.
2. Select production, staging or development; start a run. Read the catalog revision and captured Worker/UI/Runner deployment metadata. Do not infer an actual production deployment from the selector alone.
3. Expand each test. Follow its prerequisites and ordered steps. Verify its expected results against actual Studio/Airtable/Worker behavior; enter observed notes and a traceable evidence reference. Select Pass, Fail or Blocked. A failed test without a narrative must be rejected.
4. For a test displaying **Run safe check**, click once. Inspect observed source/version/status and recorded evidence. A false observation must produce Fail or Blocked/Error. Another administrator must separately approve an automated Pass.
5. Select the run's **Release gate** and **Immutable run history**. Reopen the run from saved history to prove persistence, inspect UTC timestamps, and compare it against a baseline for regressions.
6. A failed Critical/High test, missing QA evidence, unattested deployment or human approval pending must block release. No QA action is permission to schedule, dispatch or publish a social post.
7. Record a completion rationale and explicitly finalize the run as Incomplete or Rejected if any gate remains blocked. Only a fully ready gate may be finalized as Approved. Afterward, all results become read-only and additional testing requires a new run.

## Operational and security constraints

- Airtable is the only QA write authority; Supabase remains a non-authoritative mirror and is not required for this pilot. No Supabase-first writes.
- Protected GitHub deployment workflows must apply any Worker and Pages releases. Follow `AGENTS.md`: Studio UI release `0.6.897` and matching shared cache key `0.6.897-qa-center-pilot` must be strictly higher than actual production when merged. Worker draft reports `0.10.765-qa-center-v1`. If production moves ahead before merging, rebase and bump again.
- R2 conditional lease protects idempotent append against concurrent duplicate submissions; callers should reuse `client_request_id` after uncertain responses. Airtable history is an audit ledger, not a mutable checklist.
- No generated code, arbitrary external URL, unattended publication, destructive record operation, unscoped Supabase query or production synthetic mutation is allowed.
- **Outstanding before release:** pass complete CI at the final head SHA; run a live authenticated Admin/reader deny test; verify an actual Airtable round trip and UI walkthrough; attest real Worker/Pages/Runner identifiers; exercise a deliberately failing assertion; verify production safety and no publishing. Finish or explicitly defer remaining 88-case automation coverage with reviewed read-only observer implementations.
- Do not mark draft PR #1429 complete/ready or deploy just because isolated tests pass.

---

## Original design contract (retained for traceability)

## Existing repository integration points
- Studio Admin: `apps/studio-web/index.html` and `apps/studio-web/assets/`; use established navigation and authorization.
- Worker: `apps/studio-api/worker.js`; all QA endpoints must reuse production authentication and enforce admin authorization server-side.
- Pipeline runner: `services/pipeline-runner/`; diagnostic integrations must default to read-only.
- Deploy through protected GitHub Actions. Follow `AGENTS.md` strictly, including a strictly increasing Studio UI version and the Pages release-contract tests.

## Data model and authority
Airtable is the sole write authority for QA catalog metadata (if mutable), test runs, test execution records and approvals. Supabase is an optional non-authoritative write-through/read mirror. No QA action may change the production pipeline's source of truth.

Suggested tables:
1. `QA Test Definitions`: stable test_id, revision, title, domain, severity, prerequisites JSON, steps JSON, expected JSON, automation_id, safety_class, enabled, reviewed_by.
2. `QA Test Runs`: run_id, catalog_revision, deployment identifiers (Worker/UI/runner SHA and build), scope, owner, created_at_utc, finalized_at_utc, release_decision; run may have changing status but history events must be append-only.
3. `QA Executions`: execution_id, run_id, test_id, catalog_revision, attempt, status (Pass/Fail/Blocked/Error/Needs Review), requested_by, executed_by, server_started_at_utc, server_finished_at_utc, evidence JSON with source and observation, environment identifiers, assertion version. **Append-only, with no PATCH or DELETE route.**
4. `QA Approvals`: approval_id, execution_id, reviewer, decision, created_at_utc, rationale. Append-only; never silently alter an AI execution.
5. `QA Waivers`: waiver_id, run_id, test_id, authorized approver, reason, expires_at_utc, risk acceptance. Append-only.

Airtable record IDs are retained in Supabase mirror rows. Missing mirror rows are reconciliation failures, not grounds to rewrite Airtable. Use unique idempotency keys for result submission to avoid retries making duplicate assertions.

## API contract
- `GET /api/admin/qa/catalog`: admin-only versioned catalog.
- `POST /api/admin/qa/runs`: admin-only creation with server UTC and deployment snapshot.
- `GET /api/admin/qa/runs?limit=&cursor=`: bounded historical listing.
- `GET /api/admin/qa/runs/:id`: details and immutable execution history.
- `POST /api/admin/qa/runs/:id/results`: append manual result, validate result enum/evidence/test ID; derive tester server-side.
- `POST /api/admin/qa/runs/:id/execute/:testId`: execute only a registry-enrolled safe assertion; never accept user-provided URLs or arbitrary scripts.
- `POST /api/admin/qa/runs/:id/approvals`: append authorized human review.
- `GET /api/admin/qa/runs/:id/gate`: deterministic severity-aware release gate with evidence links.

All write endpoints must validate CSRF/origin where applicable, enforce admin auth, rate-limit, bound payload sizes, reject arbitrary hostnames and retain audit records. UTC timestamps must be generated on the trusted server, not the browser.

## Automation executor
Registry declares test ID, assertions, allowed resource IDs, read-only/synthetic classification, timeout, bounded call budget, evidence schema and approval requirement. Only allowlisted test IDs can execute. Capture raw observed facts (redacted), HTTP status, error codes, sample counts, data source, environment and assertion version. Missing data, timeout or unavailable dependency => Blocked/Error; never automatic Pass. Forbid writes to production records, public publishing, destructive operations, secret disclosure, arbitrary scripts, general URL fetches or unbounded scans.

Safe first registrations:
- Worker /health version, auth, status, bounded latency (GET).
- Explicit allowlisted Airtable canonical read and Supabase mirror comparison, non-authoritative.
- Rendering metadata and preview HEAD/GET with strict media budgets; visual watermark judgment requires human.
- MAE pure planning dry-run without mutations or queue insertion.
- Synthetic fixture tests only in isolated QA namespaces with unique IDs, publish exclusion, deterministic cleanup and proof.

## UI contract
Admin → QA Test Center: catalog grouped by domain, expanded exact instructions and expected outcomes, prerequisites, severity, manual Pass/Fail/Blocked, evidence attachment/link and notes. Separate buttons for safely automated tests and AI assessment; prominently mark AI outputs as provisional until human signoff. Provide run history, regression comparison, release gate explanation and immutable execution timeline.

## Release acceptance
- Auth/access denial tests, append-only records and idempotency tests pass.
- A deliberately false assertion **fails** rather than passing.
- UI uses incremented build + shared asset cache key + matching `BUILD_ID`.
- Existing Worker/Pages/runner regression tests pass.
- Deploy via GitHub Actions; verify live custom-domain build and authenticated end-to-end test.
- No release marked complete until all above have evidence.
