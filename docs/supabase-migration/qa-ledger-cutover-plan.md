# QA Test Center ledger: required before Airtable retirement

**Status: production cutover blocker.** No production data was mutated by this plan.

## Existing history to preserve

The current QA API identifies two Airtable tables: runs (tblYwzehVtmyUMzj5)
and events (tblsg5E1cq8nb240c). It writes append-only entries and uses
idempotency keys with payload hashes. Required immutable evidence includes:
run IDs, catalog revisions, environment, deployment identity, actor, UTC
timestamps, test ID, event kind, payload, execution identity, human approvals,
waivers and finalization. A released test gate must never treat a missing
historical event as a Pass.

## Migration acceptance sequence

1. Inventory actual canonical Airtable rows with an audited, limited,
   read-only export and record counts/checksums. No fabricated zero counts.
2. Review a private/RLS-protected production Supabase schema with unique
   idempotency/run/event identity and append-only service-role interfaces.
3. Implement an idempotent, resumable import that reconciles complete run
   and event counts and source payload hashes. Preserve original record IDs
   only as legacy correlation IDs, never as network dependencies.
4. Migrate the QA HTTP run/event listing and writes to Supabase with
   independent committed readback. Maintain bounded pagination, immutability,
   replay, exact conflict handling, actor provenance and release-gate logic.
5. Update the canonical assertion, QA catalog revision and release tests for
   Supabase-only authority. Old runs may remain visible but must not silently
   approve a newer deployment.
6. Verify historical parity, non-publishing QA acceptance, rollback and
   service-role permissions. Only after independent evidence set protected
   GitHub variable STUDIO_QA_SUPABASE_LEDGER_VERIFIED=true.

The production Worker deploy now refuses to touch Cloudflare before the
read-only script repair/scripts/qa_retirement_preflight.py succeeds. The
post-deploy catalog check additionally requires writeAuthority=Supabase.
Both are necessary; neither alone proves data parity.

Important: the one-time Airtable history export creates network traffic.
Start the six-hour zero-Airtable-egress quiet window only after all such
backfill/export steps and the controlled production cutover are complete.

Never bypass this gate by returning an empty history, disabling QA, changing
a flag without migration, or forging Pass results.

## November 21 implementation checkpoint — source inventory and draft code

A connected, **read-only** Airtable table inventory established the exact legacy
sources in base `appe33zkZn35yirTL`:
- QA Test Runs `tblYwzehVtmyUMzj5`: 1 row, no additional cursor.
- QA Executions `tblsg5E1cq8nb240c`: 1 row, no additional cursor.
- The event references the one run and is a historical `RunFinalized` event.
  The run has `development` environment and an old synthetic verification
  status. **Legacy payload-hash tokens are 33 characters, not SHA-256 hashes**.
  These must be preserved verbatim and separately wrapped by a SHA-256 source
  fields checksum; do not silently rewrite legacy status or hashes.

The connected production Supabase information-schema inspection showed no QA
ledger tables in `public`, `qa` or `studio_qa` at inspection time.

The following changes are **staged only** in draft PR #2364:
- `docs/supabase-migration/phase7/011_qa_ledger_review_only.sql`
  proposes RLS-enabled, service-role-only, append-only run/event tables with
  legacy record/source payload correlation. It has not been executed.
- `apps/studio-api/qa-supabase-ledger.mjs` implements a bounded read/insert
  adapter against these two tables; `qa-http.mjs` no longer calls the legacy
  Airtable gateway for QA data.
- `qa-test-core.mjs`, `qa-governance.mjs`, the versioned QA catalog and
  QA unit tests now require the canonical Supabase source.
- `repair/scripts/qa_ledger_backfill_preflight.py` accepts private source
  exports and independent Supabase readbacks, verifies exact counts and
  legacy row-field SHA-256 checksums, and always returns
  `release_authorized:false`. It reads no provider secrets and performs
  no writes. Its tests cover mismatched history and incomplete evidence.

**Remaining, in order:**
1. Obtain durable, independently signed private source exports and exact
   original field-level hashes; reconfirm no new Airtable QA rows were added.
2. Review the SQL, production backup and rollback proof. Apply the table
   schema only under a separately approved migration procedure.
3. Implement and execute the approved idempotent backfill from the preserved
   private export. Do not commit export data or credentials to Git.
4. Obtain complete service-role-only Supabase readback with original
   `legacy_source_fields` and `legacy_row_sha256`; require the reconciliation
   utility to pass with independently checked source counts.
5. Run real QA HTTP history/replay/finalization, cross-run catalog revision,
   authorization, immutability, concurrency and non-publishing tests.
6. Have an independent reviewer attest results and the release rollback plan.
   Only then authorize the protected
   `STUDIO_QA_SUPABASE_LEDGER_VERIFIED=true` setting. Do not infer approval
   from passing unit tests or the source preflight alone.

No production SQL, backfill, deployment, publishing or credential mutation is
authorized by this document or the current branch. The six-hour system-wide
Airtable quiet-window evidence must come **after** any approved source export
and the controlled cutover.


## Approval-gated resumable historical import (operator-only; NOT executed)

The draft now includes `repair/scripts/qa_ledger_backfill_apply.py`.
It uses the validated private Airtable source export, derives the complete import
plan again, and performs **GET then one append-only POST per missing run/event**,
always importing parent runs before dependent events. Existing legacy IDs may
be reused only after exact source provenance comparisons. If a POST returns
409, the importer GETs the contested row and accepts the retry **only when
every expected historical field agrees**. Mismatches remain hard blockers.
It never performs PATCH, PUT, DELETE, DDL or publication.

The default invocation is an **offline dry run**. A live attempt requires all
of the following, none of which can be fabricated by this script:

1. Independently frozen, **private, complete** source export files and the
   separately verified expected row counts and source inventory SHA-256 digests.
   Never place the exports, keys, or private approval manifest in this repo.
2. Independently established production backup evidence, tested restore/rollback
   procedure and a formally approved maintenance change window. The importer
   only checks that evidence *references* were documented; **it cannot
   verify that backup, restore or human approval actually occurred**.
3. A private approval JSON file stored outside the repository, including:
   `project_ref`, `source_runs`, `source_events`, `runs_digest`,
   `events_digest`, `independent_review_approved` (boolean),
   `backup_evidence_ref`, `rollback_evidence_ref`, `reviewed_by`,
   `reviewed_at_utc`, and `maintenance_change_id`.
4. Exact `--apply` plus the intentional runtime confirmation
   `STUDIO_QA_IMPORT_EXACT_CONFIRMATION`, approved project binding
   `STUDIO_PRODUCTION_SUPABASE_PROJECT_REF`, and a private server-side
   `SUPABASE_SERVICE_ROLE_KEY`. These must never be logged or placed in GitHub
   comments. Do not use a browser anon/publishable key.
5. An independently audited complete **live Supabase GET-only readback** after
   import. The importer calls `qa_ledger_live_readback.inspect` and still
   always returns `release_authorized:false`, even after perfect parity.
   Unexpected writes, concurrent new source rows, missing history, provider
   uncertainty or mismatched source hashes block the release.

If any event fails after a run was safely inserted, the importer can be
resumed against the exact same frozen source and approval: prior committed
rows are verified, not overwritten; any conflict fails closed. It must never
be rerun with a guessed source count or substitute synthetic QA records.

**This operator-only facility is staged code, not a migration approval.**
The live production QA tables remain absent pending independently verified
backup/rollback and migration authorization. No six-hour Airtable quiet-window
certification can start until the separate production cutover and its final
source export have completed.


## Single live production environment and verified backup receipts

**This installation has one runtime environment, production.**
The currently connected Supabase project `vkwvscgisqsbuwagdvtb` is the
**live production project**, regardless of its legacy `-dev` display name.
Do NOT create another project or a preview/staging branch. The historical QA
run's `development` string is **source provenance**, not a live target.
The proposed SQL now enforces `environment='production'` on all **new**
native QA runs while permitting imported historical labels.

### Backup evidence before any schema mutation

An offline-reviewed, GET-only operator helper is staged as
`repair/scripts/qa_production_backup_inventory.py`. It uses the official
[Supabase Management API backup list](https://supabase.com/docs/reference/api/v1-list-all-backups)
to inspect backup receipt timestamps for **this exact production project**.
It requires a private Management API access token scoped for `backups_read`;
this is **not** the Supabase database service-role key. A missing token,
incorrect project, malformed inventory, failed or stale backup fails closed.
No token is recorded, and the tool makes only a single HTTP GET.

A positive receipt demonstrates only that Supabase *reported* a completed
backup; the script ALWAYS reports `restore_test_verified:false`,
`rollback_approved:false`, `schema_apply_authorized:false` and
`worker_deploy_authorized:false`. It is **not** evidence of a successful
restore. If the token is unavailable, an authorized reviewer can inspect
the existing production project under Supabase **Database > Backups** and
record a private, timestamped receipt and maintenance approval. Never
pretend that automatic backups are present merely because the project
is healthy or because Supabase advertises backup support.

### In-place reversible rollout without a second environment

1. Prove a recent production backup exists and document the recovery window,
   data-loss exposure and the exact production Worker version/binding snapshot.
2. Confirm the reviewed additive schema is isolated to
   `public.studio_qa_runs`, `public.studio_qa_events` and the immutable event
   trigger function. Ensure protected QA RLS/service-role grants are correct.
3. Freeze the exact complete Airtable QA source export (currently one run
   and one event), independently count/hash it, then run a separately approved
   append-only import and private full Supabase readback. Do not apply a
   destructive schema conversion to any existing production table.
4. Run authenticated QA read/list/replay/idempotency/human approval tests with
   provider publishing disabled. The real Worker release gate remains blocked
   until evidence has been independently reviewed.
5. Deploy the new Worker with its existing exact binding contract and
   **retain the prior production Worker deployment as the application rollback
   point**. On a failed canary, restore that prior Worker deployment and halt;
   do not drop the new QA tables, delete imported records, or delete Airtable
   credentials during rollback. Imported history is immutable.
6. Only after the new application is healthy and past rollout changes end,
   start the six-hour all-source zero Airtable egress observation. Any Airtable
   source export or credential use resets the quiet-window eligibility.

This note is planning only. It does not claim that a backup was listed,
that rollback was proven, or that a live migration was performed.
