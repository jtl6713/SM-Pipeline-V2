# Live production configuration and Airtable egress audit — 2026-11-20 (Chicago)

**Current disposition: BLOCKED / NOT CERTIFIED.** This is an evidence record,
not a claim of zero Airtable egress, a production release approval, or a reason
to revoke the provider PAT.

## Environment identity — supported
- Studio owner confirmed that the live Supabase project is
  `vkwvscgisqsbuwagdvtb`, still named `sm-pipeline-v2-dev` after cutover.
- Supabase connector independently returned
  `https://vkwvscgisqsbuwagdvtb.supabase.co`, project `ACTIVE_HEALTHY`.
- Read-only `SELECT count(*)` observed **25,481** rows in
  `public.media_assets`, with most recent `created_at` of
  `2026-11-18 20:27:30+00` at investigation time. This confirms a populated
  database; it does NOT confirm the live Worker uses that exact URL.
- Previously executed read-only media RPC/index/ACL preflight on this same
  project passed. Do not rerun or apply the migration just because of its name.

## Live health — directly evidenced by a successful scheduled production probe
GitHub Actions run:
https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44866647684

Probe run at `2026-11-21 04:32:57Z`, actual health results at about
`2026-11-21 04:33:21Z`:
- Studio `/api/health` HTTP 200 and runner `/health` HTTP 200.
- Worker `studio_read_source='airtable'`. Supabase-specific pipeline, content,
  Factory/Ops, Home, Music, Auth reads reported `supabase`.
- Runner `studio_write_source='supabase'`.
- Worker `studio_supabase_configured=True`, but the exact live SUPABASE_URL
  value was NOT exposed in this sanitized health evidence.
- Legacy `last_sync.status='partial'`, `last_sync.ok=False`,
  `last_sync.finished_at='2026-11-12T16:05:54.078Z'`.
- The old Workstream A workflow reported `PASS_LATEST_ONLY` while expressly
  treating `studio_read_source='airtable'` as a PASS. This is **not** an
  Airtable-retirement acceptance test. PR #2364 replaces this expectation
  with a strict Supabase primary-read gate.

## GitHub release source and identity — verified only at code/configuration level
- Production `main` head observed as
  `a84da70a1dcf061eabc5afd3714ec466e617de00`.
- `main` `apps/studio-api/supabase-pipeline-reads.mjs` still has
  `studioReadSource(env) { ... return "airtable"; }` at lines 218-223.
- `main` `apps/studio-api/worker.js` still constructs an outbound
  `https://api.airtable.com/v0/...` request and attaches `AIRTABLE_PAT`
  as a bearer token (at roughly lines 5686, 5781).
- `main` `repair/scripts/studio_api_binding_contract.py` still treats
  `AIRTABLE_PAT` and six `AIRTABLE_*_ID` bindings as required.
- PR https://github.com/jtl6713/SM-Pipeline-V2/pull/2364 is **draft,
  unmerged, not deployed**. Its Supabase-only source/binding changes are not
  production runtime evidence.
- GitHub workflow source specifies `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID` and Supabase-binding checks, but connected GitHub
  read access cannot inspect encrypted secret values, actual configured
  GitHub variables, the active Cloudflare Worker binding values, the
  Windows runner environment or third-party Make scenarios.
- **Cloudflare live SUPABASE_URL == GitHub-configured SUPABASE_URL ==
  owner-confirmed production project** remains **UNVERIFIED**.
  Do not manufacture a pass or paste secret values into any report.

## Observed real historical Airtable outbound traffic
GitHub Actions short Worker tail run:
https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43702271768

At roughly `2026-11-15 10:04-10:07Z`, the Wrangler tail found **26**
`studio_airtable_egress_v1` request attempts:
- 11 Output GETs with HTTP 200;
- 10 Output GETs with HTTP 404;
- 5 other GETs with HTTP 200.

Later separate short tails
https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43706125298
and
https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/43708491186
reported zero monitored Airtable events in their **individual** short windows,
not continuous production coverage.

A zero count in a two-to-three-minute tail is not proof of zero attempted
Airtable requests during a full UTC-hour or six-hour quiet window.

## Six-hour audit coverage
The following independently instrumented sources require hourly durable
attempt counts + collector heartbeat and original evidence for each completed
UTC hour. As of this investigation, the required six-hour complete packet
was **not retrieved**:

| Required source | Current certification |
| --- | --- |
| Studio Worker | NOT CERTIFIED — historical 26 egress events; current six-hour coverage absent |
| Windows pipeline runner | NOT CERTIFIED — write source Supabase, but no complete hourly egress artifact |
| Standalone scripts | NOT CERTIFIED — no independent six-hour collector attestations |
| GitHub Actions | NOT CERTIFIED — workflow-source audit alone is not network telemetry |
| Make scenarios | NOT CERTIFIED — external Make scenarios not connected/audited |
| Other external integrations | NOT CERTIFIED — independent collectors/heartbeat unavailable |

The safe evidence checker is
`repair/scripts/airtable_retirement_evidence_gate.py`. Its incomplete template
fails closed and `release_authorized` is always false. Do not fill it with
inferred zeroes.

## Correct sequencing / next executable gates
1. Run a trusted read-only Cloudflare active-version and GitHub variable audit.
   Capture names/types, compare URL project refs, and confirm no secret values
   are exposed. Review Windows runner and Make external dependencies.
2. Before production cutover, review latest head CI, target project identity,
   production backup, functional parity and **non-publishing** canary with safe
   rollback and no new Airtable write authority.
3. Since the *currently deployed* Worker still reports Airtable and contains
   real Airtable transport, do not demand a post-cutover six-hour zero-egress
   window as a prerequisite for **all** cutover deployment; that is a circular
   release gate. Instead perform an explicitly approved, rollback-protected
   initial Supabase-only cutover after steps 1-2, with publishing fenced and
   live traffic monitors active. Do not silently merge/deploy as part of an
   audit. Revoke no tokens at this step.
4. **After** the controlled cutover and all collectors are confirmed healthy,
   observe at least six full UTC hours across all six sources, with no Airtable
   attempts and no missing hour or source.
5. Only after independent proof, parity, operator approval and rollback
   readiness can the final Airtable PAT be revoked and old live bindings
   removed, followed by post-revocation health/traffic verification.

**No production deployment, binding mutation, publishing, database mutation or
provider-token revocation performed by this verification.**
