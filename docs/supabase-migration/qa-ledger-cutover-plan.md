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
