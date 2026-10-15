# Exact-title duplicate prevention: staged, reversible rollout

## Safety contract
- Identity is **Content_Profile record ID + Unicode-NFC, whitespace-normalized, case-sensitive title**. Different titles or different profiles are not hard duplicates.
- Published > scheduled > production/approval > ideas. Never modify or remove published posts.
- Multiple Platform Outputs under one Content Item are **not** duplicate content.
- An Idea Candidate linked to its own Production Request/Content Item is **lineage**, not another work item.
- Airtable remains the source of truth. Any registry backfill must be derived from **live Airtable**; never synthesize platform publication.
- **Default STUDIO_TITLE_GUARD_MODE=off.** Do not enable any block stage until Wrangler validation, backfill, race tests, and production monitor evidence are verified.

## Current implementation (this branch)
- Pure exact-title policy in apps/studio-api/title-guard.mjs.
- Centralized Airtable title lookup in title-guard-runtime.mjs. Existing publication/schedule state is read from linked Platform Outputs, rather than treating a Content Item as four duplicates.
- Instrumented manual Create Idea, autonomous Create Idea, and shared Create Production Request draft creation.
- **Feature flag:** STUDIO_TITLE_GUARD_MODE=off|monitor|block (default off).
- **Feature flag:** STUDIO_TITLE_GUARD_BLOCK_STAGES=ideas,production (only honored with MODE=block).
- MONITOR records winning stage, record ID, source, title and profile to console or optional D1 audit; it **never** blocks or mutates content and fails open on Airtable/D1 failure.
- BLOCK refuses existing unrelated active titles with 409, and requires an atomic **STUDIO_TITLE_REGISTRY** D1 binding. Missing D1 fails closed with 503.
- A new idea claims the unique (profile_id,title_key) D1 row before Airtable insertion; error releases the reservation; success binds the new Idea ID. Production request lineage reuses the Idea owner, not a new registry title.
- Database creation DDL is migrations/title-guard/0001_registry.sql.

## Ordered rollout (never skip)
1. **Monitor only:** First run node tests, Worker module syntax checks, Wrangler dry-run with *all* source .mjs modules. Deploy source using existing Cloudflare preservation procedures and confirm a healthy live Worker. Configure STUDIO_TITLE_GUARD_MODE=monitor only. Review collision telemetry and false positives by profile/title, including prior published titles. Because monitoring performs up to 3 Airtable title searches per new idea/request, check Airtable 429s and latency. Revert to off immediately if read pressure rises. Do not turn on block.
2. **Atomic registry:** Provision a dedicated Cloudflare D1 database, apply 0001_registry.sql, and bind it as STUDIO_TITLE_REGISTRY. Backfill **all** active and published title identities (including published archived Content Items) from Airtable. Resolve historical multi-published title collisions manually as one canonical registry identity while retaining all posts. Validate live record counts and no unrelated idea lineage matches.
3. **Block new ideas:** MODE=block and BLOCK_STAGES=ideas, only after registry backfill is validated. Race-test two concurrent manual and autonomous creates of the same exact title and verify one and only one owner. Fail closed if D1 is unavailable. Roll back instantly with MODE=monitor (or off). Monitor false positives.
4. **Block production:** Add production to BLOCK_STAGES, verify that every existing Idea can still create/resume its own request, and unrelated duplicate Ideas cannot spawn independent jobs. Production retry remains idempotent for one Idea.
5. **Schedule/publish:** Extend this same guard to the **authoritative state-transition/publish dispatch** writer(s), including cron, external webhook and retries, not just the Studio UI. Validate with negative fixtures, platform-specific idempotency, and a dry-run. Only then add schedule and publish to BLOCK_STAGES. Until these endpoints are wired, these stage flags **do not protect publishing**.
6. **Daily reconciliation:** Add a bounded, resumable, read-only cross-stage daily scan that compares registry to all four Airtable tables. Report orphaned links, exact-title conflicts and published/scheduled priority discrepancies. Automated cancellation requires a separate safe-write feature flag, immutable published protections, and rollback evidence. Do not schedule it during high-write windows.

## Emergency rollback
- Fast switch: STUDIO_TITLE_GUARD_MODE=off (or monitor to disable blocking).
- Revert only this feature branch/merged commit, preserving the prior Worker and its full set of modules.
- Do not delete D1 on rollback; preserve title owner/audit evidence for diagnosis.
- No existing published Platform Output may be deleted, cancelled, or unscheduled by this code.

## Developer verification
Run node --test apps/studio-api/title-guard.test.mjs and node --check for the three modified Worker function modules, title-guard.mjs, title-guard-runtime.mjs, and worker.js; then a Wrangler dry-run using **all** .mjs dependencies. The existing full Studio API suite must also pass. A passing unit test alone does not authorize a production deploy.
