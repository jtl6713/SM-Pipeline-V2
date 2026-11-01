# QA Test Center implementation contract (foundation)

Status: **Design and versioned initial catalog only; not implemented or deployed.** This branch must not be merged as a finished QA Test Center.

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
