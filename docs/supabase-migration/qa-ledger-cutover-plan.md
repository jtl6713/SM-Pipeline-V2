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
