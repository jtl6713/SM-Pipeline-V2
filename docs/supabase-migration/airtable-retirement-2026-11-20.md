# Airtable retirement — implementation and release gate (2026-11-20)

## Scope and evidence
Reference: the November 16 SM Pipeline V2 Airtable CRUD and Egress Audit provided by the owner. Its counts are *static reference candidates*, not observed network requests: 1,664 Worker/runner wrapper invocations, 179 direct API URL literals, and 90 GitHub Actions workflows with direct URL literals. A zero-traffic monitor in the app alone does not cover independent GitHub Actions, maintenance scripts, or external Make scenarios.

## This PR (first safety boundary)
- Worker `airtableFetch`: no outbound Airtable branch. A Supabase read or write that is unsupported/uncommitted fails visibly (503), not `records: []`, a fake created ID, or a deleted:true echo.
- Profile Summary Durable Object: no direct Airtable reread; dirty events stay pending on failed Supabase reads.
- Runner `AirtableClient`: compatibility entrypoint requires Supabase, cannot make Airtable HTTP requests, and does not fabricate reads/mutations. Supported DELETE operations require exactly one returned Supabase row.
- Worker side-table DELETE: checks exactly one Supabase row was deleted, and isolates Pipeline Settings from Engagement Settings.
- Pipeline Settings mutations: require returned Supabase representation rather than trusting an unverified 204/zero-row PATCH.
- Python runner reads/writes default to Supabase.
- Retired **all 90 direct-URL GitHub Actions workflows identified in the attached November 16 audit** (88 together plus two individually), the closeout backfill workflow, five direct maintenance/bootstrap/diagnostic scripts, **22 additional historical repair, test-target and manual publish-once entrypoints**, and migrated the runner environment bootstrap to Supabase settings REST. This blocks every standalone direct URL execution path identified in the audit apart from inert test/staging fixtures and egress-monitoring utilities. This includes four historically deploy-oriented workflows; do not merge until their deployment responsibilities are either replaced or confirmed redundant. A pull-request CI guard rejects direct Airtable URLs in GitHub Actions YAML.

**Resolved in development, not production:** the runner media upsert now uses a transactional Supabase RPC and development-only uniqueness verification, as detailed below. Production schema and non-publishing verification remain hard release gates.

## Not complete; do not merge/deploy
- Ninety audit-listed legacy workflow implementations were retired; two functional successors for variant and LA TikTok are restored on the PR branch, and the two Studio-only paths map to the canonical Studio API production deploy. Confirm their replacement paths before merge. New workflows added after the audit must still be scanned; the new CI guard covers current YAML.
- The 22 audited one-off repair/test-target/manual-publishing entrypoints now fail without network access. Read-only monitor utilities, inactive staging templates and tests still retain historical Airtable references; do not mistake those references for active traffic. Continue auditing **new files added after the November 16 snapshot**.
- The runner bootstrap code now queries Supabase (five active Pipeline Settings keys confirmed in **dev**) and does not copy an Airtable token into the generated runtime .env. Existing production env/secret values, Windows runner .env, Cloudflare secrets and GitHub encrypted PAT envelopes have **not** been read or modified. A repo code change alone cannot guarantee external services or scheduled jobs have stopped.
- All 10 Worker read/write source selectors now select Supabase (or `unavailable` when credentials are missing), ignoring stale Airtable rollback flags. Run full functional regression tests because unsupported query/view mappings will now fail visibly.
- Validate Supabase schema and atomic-upsert constraints in the **production** database before enabling blocked mutation paths. Only the connected development project schema was inspected.
- Review legacy tests that assume Airtable REST responses and adjust them to Supabase-only behavior. Run the targeted new tests and full suite.

## Release acceptance
1. Static source guard: no executable production Worker, runner, script, workflow or external job can issue Airtable GET/POST/PATCH/PUT/DELETE.
2. Runtime egress monitoring: zero attempted Airtable calls across Worker, runner, scheduled jobs, GitHub Actions and known external integrations during the full quiet window. Any unmonitored integration means this gate is not certified.
3. Supabase mutation correctness: every create/update/delete/upsert returns only after a confirmed persisted transaction, with exact affected rows or verified idempotent conflict handling. Missing/unsupported reads raise explicit errors; do not invent empty lists.
4. End-to-end tests: asset library/upload and deletion, Ideas, Factory approvals, Content, scheduling, publishing/retries, recovery ledgers, Home counters, settings and QA. Preserve existing workflows; no unattended production publishing in test runs.
5. Confirm deployment configuration and source flags on the live Worker and runner, then deploy and validate a small non-publishing canary.
6. After verified replacement, revoke the **Airtable personal access token(s)** at the provider, remove GitHub/encrypted envelopes, Cloudflare and runner bindings, audit old GitHub workflow permissions, and verify Make/external automations cannot use Airtable.

No live production calls, schema updates, deployment, or provider credential revocation were performed by this PR.

## Follow-up implementation (2026-11-20, draft PR #2364)

### Media upsert claims — implementation and development validation
- Added `docs/supabase-migration/phase7/010_media_atomic_upsert.sql` containing `public.sm_pipeline_upsert_media_asset`. It accepts only `Google Drive File ID` and deterministic `Studio_Transfer_ID` keys prefixed `ngv2_`.
- Uses a transaction-scoped advisory lock and database unique indexes to serialize competing upserts; existing `google_drive_file_id` index protects A2B, and a **scoped** unique expression index protects only `ngv2_` identities. Legacy transfer IDs cannot be constrained globally because the connected development database has 969 duplicated transfer keys.
- Python `AirtableClient.upsert_record` calls the Supabase RPC and checks both the returned identity and an independent Supabase readback before reporting created/existing. It no longer performs an Airtable request.
- Applied the migration to connected **development** project `sm-pipeline-v2-dev` and validated create/reuse/read-index behavior in a SQL transaction that was rolled back; verified no synthetic test records remained and that `anon`/`authenticated` cannot execute the RPC while `service_role` can.
- **Production migration NOT applied.** Identify the authoritative production Supabase project, inspect production duplicate keys/indexes, apply reviewed migration, and perform controlled non-publishing canaries before release.

### Deployment replacement map
| Retired workflow | Supported successor |
| --- | --- |
| `cloudflare-safe-update-current-worker.yml` | Canonical `deploy-cloudflare-worker-production.yml` (full binding preservation, dry-run, postdeploy health, automatic rollback); Supabase credentials now required instead of Airtable PAT |
| `cloudflare-promote-safety-with-envelope.yml` | Same canonical Studio API deployment (historical fixed-version “safety” workflow remains disabled) |
| `deploy-studio-variant-fill-crop-v2.yml` | **Restored** on this branch with a manual signed trigger, read-only Supabase Pipeline Settings lookup, exact-version split/verification and rollback; no Airtable token decryption |
| `deploy-tiktok-auth-la-production.yml` | **Restored** on this branch as a manually confirmed LA TikTok Auth release with binding/health verification and rollback; the unrelated Airtable rearm of three drafts was removed |

The canonical Studio API deployment is now gated on `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` binding types. An existing legacy `AIRTABLE_PAT` binding may be reported for migration accounting but is no longer a required deployment secret. **No replacement deployment has been run.**

### Production read-only audit ready for a protected manual run
- `.github/workflows/verify-supabase-production-readonly.yml` validates deployed Cloudflare Worker binding *names and types* (not values) for Studio API, variant service, and LA TikTok auth, reports the presence of any legacy PAT binding, and checks a zero-row Supabase REST query with server-only credentials. It never changes content, deployments, tokens or database records.
- Requires the workflow to exist on `main` and an explicit `AUDIT-SUPABASE-PRODUCTION` dispatch. This PR remains draft and has not been promoted to `main`; therefore **this live production verification remains pending**.
- The GitHub connector here cannot inspect GitHub secret values, Cloudflare dashboard secrets, the Windows runner's live `.env`, external Make scenarios or the Airtable provider PAT status. Complete those checks before revocation and final zero-egress sign-off.

### Automated tests
- Extended the pull-request regression suite with both media-claim modes, invalid/ambiguous response handling, independent readback failure, and deployment-source static contracts.
- Supabase dev transactional smoke tests passed and left zero test rows. GitHub Actions regression jobs have been observed running; do not equate queued jobs with green checks.
- **Do not merge or deploy** until the most recent PR SHA's checks are green and the production migration and non-publishing canary pass.


### Continuation: regression fixes and irreversible legacy workflow removal (2026-11-20)

- Corrected the stale Phase 6 cron regression that expected `STUDIO_PHASE6_WRITE_SOURCE=airtable` to bypass Supabase-only deduplication. Legacy selector flags no longer restore an Airtable write path.
- Retired the old Factory staging HTTP workflow, shell driver, and Wrangler configuration. Their now-inert templates are **not** evidence of deployed HTTP acceptance. The replacement `factory-batch-http-staging.yml` runs Worker HTTP contract tests with local Supabase fixtures and explicitly emits `DEPLOYED_STAGING_HTTP=NOT_TESTED`.
- Removed the old automatic deploy-contract patcher that could replace the canonical Supabase binding requirement with `AIRTABLE_PAT`, plus old fixed-version v86 Cloudflare release/rollback, lease-table repair, obsolete phase-5/6 source-enable workflows, and their patch entrypoints. No historical deployment or environment restoration action may re-enable the retired Airtable architecture.
- Added regression assertions requiring those legacy workflow and patch paths to remain absent; prior phase-5/6 transition tests were retired because their rollout preconditions were obsolete and contradicted Supabase-only source authority.
- Rechecked connected Supabase projects: only `sm-pipeline-v2-dev` and an unrelated Task Organizer project are visible. A read-only dev query confirms the media RPC, Drive-ID and scoped native-gallery uniqueness indexes, server-only execute grants, and zero existing `ngv2_` rows. This does **not** establish production readiness.
- The canonical Studio API deployment, variant-service deployment, and LA TikTok-auth manual release paths remain in the branch; production credentials, rollback execution, non-publishing canary, and cross-service zero-egress evidence are still unverified.

**Release remains blocked:** re-run the entire PR CI at the latest commit, identify and safely migrate the production Supabase project, verify live Cloudflare/Windows-runner/Make and provider credentials, demonstrate non-publishing parity and a complete monitored zero-Airtable-egress quiet window. Do not merge, deploy or revoke the remaining PAT before evidence exists.


### Supabase-only runner selectors and integrity checks
- Both Python runner write-source selectors now resolve only to `supabase` when credentials are present and to `unavailable` otherwise; stale Airtable rollback flags cannot disable or reroute writer operations.
- All known runner tables use Supabase reads regardless of obsolete per-table read-source flags. Unsupported views and formulas fail with a visible error; they must not be reported as `[]` or sent to Airtable.
- Regression tests cover stale flags, the reference-cache authority, typed Output status/JSON bag cleanup, and explicit rejection of unknown views.
- These changes require a fresh green full regression run and are not evidence of production deployment, connection, or credential revocation.


### Continued PR work — remove legacy Airtable deployment authority
- Six `AIRTABLE_*_ID` bindings were moved out of the **required** Studio API Worker core contract and into transition-only optional bindings. Existing production bindings remain preserved until controlled cutover; missing Airtable IDs no longer block future release validation.
- The production deploy no longer uses a hardcoded Airtable base ID as its identity check. It now requires independently approved `STUDIO_PRODUCTION_SUPABASE_PROJECT_REF` (GitHub Actions variable), matches the live `SUPABASE_URL` to that exact project, and rejects the two currently connected non-production projects. **Without this variable or a matching live URL, deployment fails before touching the Worker.**
- The manual read-only production audit validates that both the active Studio Worker URL and the GitHub-configured Supabase URL match the same approved project reference. The operator must verify the production project outside this workflow before setting the variable; never infer it from the development connector.
- Removed the historical encrypted Airtable PAT envelope files, marker and verification workflow from this PR branch. Git history can retain prior encrypted blobs. No live token was revoked; after production validation and observed zero Airtable API egress, revoke it at the provider and remove Cloudflare, runner and GitHub secrets.
- CI and targeted tests now prevent restoring the tracked credential envelope and check that six Airtable IDs are not required by the production deployment core.
- The branch is **preparatory**, not proof of any live production migration, token revocation or zero-egress quiet window. Leave the PR draft and unmerged until the latest checks and production gates pass.

### Additional encrypted-PAT workflow audit (continuation)
The static credential-restoration guard revealed **14 distinct historical GitHub Actions workflows** that still decrypted the encrypted Airtable PAT, even though the November audit had retired the direct-URL callers. All 14 workflow entrypoints are retired from this PR branch:
- Historical AP0 proof and Item 9/11/12/14/16/19/21 demonstration workflows: their matching direct-Airtable proof scripts were already fail-closed; new evidence must use Supabase-only tests or Admin QA Test Center.
- `diagnose-post-insights-profiles.yml`: its Python executable was already retired; `post-insights-public-health.yml` provides credential-free public service health, and `apps/studio-api/post-insights-supabase-regression.test.mjs` tests authoritative Post Insights reads. These do not claim full private four-profile production parity.
- `qa-ap1c-7856-7043-stage-restart.yml` and `repair-make-admin-module19-v2.yml`: one-off production/Make repair entrypoints must not be executed with a reconstructed Airtable token. No unattended replacement is enabled; any future required operation needs a separately reviewed Supabase-native, idempotent, non-publishing implementation.

The CI guard must scan for executable credential-envelope references before claiming zero dormant PAT-decryption workflows. The repository cleanup is not token revocation, Git history erasure, or live zero-egress certification.


### PAT reference closure and independent ElevenLabs configuration
- Retired the historical I1 enable workflow, old per-module Studio read-source flag installers (including their Airtable rollback), a redundant old v86 secret-recovery audit, legacy credential-presence checks and the disabled engagement trim workflow. These are no longer approved paths for production mutation. If any still-needed I1 activation requires a successor, it must be scoped, reviewed, and Supabase-only.
- Preserved the dedicated ElevenLabs TTS/video key installer and read-only video-price preflight; their dependency checks now require the Studio Worker Supabase URL and service-role secret instead of Airtable PAT. Video preflight only accepts a runner whose write authority is Supabase.
- The PAT inventory CI now fails unless the only remaining workflow references are the read-only `i1-durable-runner-audit.yml` (Windows presence check) and `verify-supabase-production-readonly.yml` (Cloudflare credential-presence audit). These audits are retained to support eventual live credential removal; neither grants Airtable runtime access.
- None of these branch changes removes already provisioned production secrets. Before removing PAT bindings, obtain direct production audit evidence, complete the production database migration and non-publishing canary, verify the monitored quiet window and retain rollback protection.


### Five-stage production cutover preparation (continuation, 2026-11-20)

**Evidence-based release position:** implementation and baseline CI were green at
commit 45e09a1, but production remains unverified and this PR is draft. The
newest commit requires its own full CI validation. No runtime, publishing,
production SQL, GitHub secret or Airtable PAT was changed by this continuation.

**Stage 1 — identify the real production Supabase project.**
- Only connected Supabase projects visible from this session are
  sm-pipeline-v2-dev (vkwvscgisqsbuwagdvtb) and Chicago Shining Task Organizer
  (yxhfaksetrxdezoodibq). Neither is independently certified as Studio
  production. Do not infer it from the project name or treat the dev database
  as production.
- A protected read-only Cloudflare audit can discover a candidate project
  reference from the active chicagoshining-studio-api Worker SUPABASE_URL binding
  without reading any secret values. The candidate is *not* an approval.
- Independently confirm project ownership in the appropriate Supabase
  organization, record the approved 20-character project reference, and match
  it to both the live Worker and GitHub's configured SUPABASE_URL before
  setting STUDIO_PRODUCTION_SUPABASE_PROJECT_REF.
- The PR runs only secret-free audit-parser tests. The workflow_dispatch live
  audit is intentionally restricted to trusted main. GitHub cannot run a
  workflow_dispatch workflow absent from the default branch; do **not**
  merge this PR merely to make that workflow available. Use a separate
  trusted, independently reviewed audit path or verified operator evidence
  for the premerge production check.

**Stage 2 — production inventory and migration gate.**
- Use docs/supabase-migration/phase7/media_atomic_upsert_readonly_preflight.sql
  for aggregate media identity, indexes, exact function signature, security
  invoker/search_path and server-only RPC grants. This SQL file is SELECT-only.
- Collect a sanitized production result and database backup/restore evidence.
  Missing RPC/indexes may be acceptable *before* migration but are release
  blockers *after* migration; duplicate ngv2_ or Drive IDs require
  reconciliation without deleting production rows.
- Apply docs/supabase-migration/phase7/010_media_atomic_upsert.sql only to the
  independently approved production database, following backup and change
  approval. Verify expected indexes, function permissions, and persisted
  readback. The connected dev database already passed the equivalent
  aggregate read-only checks, but that does not validate production.
- Run a tightly scoped rollback-safe, non-publishing media claim canary
  only after production migration verification; preserve existing outputs.

**Stage 3 — read-only credentials and non-publishing behavior.**
- Inspect active Cloudflare versions and binding types, Windows runner
  configuration, GitHub Actions and Make/external-provider automation.
  Never print service_role, PAT or other credential values into logs.
- Verify Ideas, media assets, Factory, approvals, scheduling, and recovery
  readback/transition parity using synthetic or explicitly authorized records
  with all publishing actions fenced. Maintain rollback/duplicate safeguards.
- The dedicated verify-supabase-production-readonly.yml supports discovery
  and strict verification modes after trusted registration on main; its
  pull_request job uses NO production secrets. Do not run the live audit from
  unreviewed PR code.

**Stage 4 — six-hour independently observed Airtable quiet window.**
- Do not start the quiet clock until all relevant sources have durable,
  independent attempt counters/coverage: studio_worker, pipeline_runner,
  standalone_scripts, github_actions, make_scenarios, external_integrations.
- Require every **completed UTC hour** to have a collector heartbeat, a
  real evidence artifact, and exactly zero Airtable attempts. Missing or
  unmonitored hours/sources are not zero and must block certification.
- Populate the release evidence template with actual reviewed references,
  then run repair/scripts/airtable_retirement_evidence_gate.py. It validates
  shape and coverage; it intentionally NEVER grants deployment authorization.
  Its checked-in template must fail because evidence is unavailable.
- The historical Supabase Migration Gate previously marked the primary
  studio_read_source=airtable as PASS (observed in scheduled production
  run 44865672423, November 21 UTC). The branch now adds an explicit
  AIRTABLE_RETIREMENT_PRIMARY_READ_GATE which requires both Worker health
  and /sync to report supabase; historical Workstream A PASS is not release
  acceptance. This is an identified live transition blocker.

**Stage 5 — protected release and provider retirement.**
- A human reviewer must independently validate every evidence artifact,
  verify all current-head CI checks, confirm rollback and the exact approved
  production project, and approve a non-publishing production canary.
- Only then merge and run the canonical Studio/variant/TikTok release paths
  under their separate manual approvals, verify health/readback and preserve
  schedule/publishing safeguards. Do not use an old Airtable-config restorer.
- After live operation shows full monitored zero-egress coverage, remove PAT
  bindings from Cloudflare, Windows runner, GitHub Actions and third parties;
  revoke the provider PAT and recheck zero egress/health. No credentials were
  revoked merely because files/workflows were deleted from this PR.

**Current five-stage disposition:** 1 candidate/ownership blocked by unavailable
production connection; 2 dev preflight verified, production pending; 3
read-only and canary procedures prepared, live evidence pending; 4 coverage
gate prepared, quiet window NOT certified; 5 release NOT authorized.
