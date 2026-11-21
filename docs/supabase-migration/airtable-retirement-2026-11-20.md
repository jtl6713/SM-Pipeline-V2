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

**Deliberate block:** runner `upsert_record` now fails closed. A2B Drive-ID and native gallery Studio_Transfer_ID operations need a transactional Supabase upsert strategy and verified uniqueness constraints to avoid duplicates. Do not tell operators these stages work until proved.

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
