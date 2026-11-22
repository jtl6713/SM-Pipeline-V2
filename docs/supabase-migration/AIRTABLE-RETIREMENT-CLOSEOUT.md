# Airtable retirement — final, bounded closeout

Status baseline: November 21–22, 2026 UTC. Canonical tracking: [#2569](https://github.com/jtl6713/SM-Pipeline-V2/issues/2569). The steps below are the **entire PAT retirement critical path**. Do not expand it to unrelated QA, Factory or publishing cleanup.

## Already completed — not new development tasks

- **Core source migration:** #2364, #2565, #2567 merged; the Worker source has no executable Airtable API transport and missing Supabase CRUD fails visibly instead of fabricating success.
- **Worker deployment:** Actions [44964327836](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44964327836) succeeded; active Worker source/binding/Factory and read-only functional checks passed. GitHub production Worker deployment status succeeded.
- **Runner deployment:** #2560; Actions [44964608034](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44964608034) succeeded and attested the exact live `/health` version, Supabase output/content reads and writes.
- **Primary source gate:** Actions [44964154700](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44964154700) and [44964327801](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44964327801) passed Worker primary/sync reads and runner write source = Supabase.
- The existing scheduled `shadow-profile-summary-hourly-evidence.yml` already collects Worker/runner egress snapshots. Those **do not certify** external Make, GitHub Actions, independent scripts or other integrations.
- QA and Rendering Review 503 are independently visible *non-publishing* product defects; Rendering Review is tracked by #2564. Neither silently becomes a passing check nor automatically blocks PAT retirement unless a still-active Airtable call is found.

## Finite remaining acceptance gates

| Gate | Evidence required | Owner/action | Stop condition |
| --- | --- | --- | --- |
| A. Explicit source inventory | Complete authorized inventory of active/disabled scripts, GitHub Actions, Make scenarios, and other external integrations; production Worker/runner exact identities | Production administrator reviews actual accounts and credential holders, retaining redacted exports | Unknown integration, missing account access, or live direct Airtable access |
| B. Coverage starts | For each of six sources choose **metered** or independently **verified inactive**. Worker and runner must always be metered. For inactive peripheral sources, collect before/after provider inventory, full-window audit log, effective inactive timestamp and independent reviewer. All evidence must cover window start to end. | Source owners | Anything inferred only from no logged events is **unverified**, not zero |
| C. Quiet window | At least six complete **post-cutover UTC hours**, with every active source's zero-attempt hourly heartbeat + artifact. Inactive sources require all disabled-source proof fields instead of invented zero counters. Run `repair/scripts/airtable_retirement_evidence_gate.py` on real manifest. | Release operator | Any missing hour/source, missing proof, nonzero attempt, clock gap, unexpected project/mode |
| D. Credential retirement | Current production GitHub, Cloudflare, Windows runner, Make and other holders reviewed; revoke the PAT with explicit administrative authorization and remove stored credentials/bindings | Credential owner | Incomplete C, unverified holder, or no approved rollback plan |
| E. Post-revocation verification | Production Worker and runner health; one non-publishing parity canary; absence of new Airtable calls; recorded token status; final issue and PR evidence | Release operator | Any degraded content/Factory/publishing behavior or active unauthorized Airtable integration |

### What is **not** a new gate

- Do not invent a fresh six-hour clock because a passive product QA feature still has a 503; its failure remains a separate product issue.
- Do not add hypothetical seventh/eighth sources; first map them into **external_integrations**, or explain exactly why the known source universe is incomplete.
- Do not require expensive monitoring agents in a Make or script system proven disabled. Instead demand independent **provider audit records** showing no activation or Airtable requests over the complete window.
- Do not use the runner's earlier six-hour observation as the new multi-source post-cutover evidence.
- Never backfill an hourly row, substitute `attempts: 0` for missing telemetry, or mark a source disabled without actual provider evidence.

## Evidence schema

`quiet_window.sources.studio_worker` and `pipeline_runner`: existing arrays of per-hour `{hour_utc, attempts: 0, collector_ok: true, artifact_ref}` values.

Other sources may use those same arrays **or**:
```json
{
  "mode": "verified_inactive",
  "inactive_since_utc": "<real UTC timestamp at/before window start>",
  "verified_through_utc": "<real UTC timestamp at/after window end>",
  "inventory_before_artifact_ref": "<provider inventory before start>",
  "inventory_after_artifact_ref": "<provider inventory after end>",
  "full_window_audit_artifact_ref": "<complete audited period>",
  "independent_reviewer": "<reviewing operator>",
  "verified_inactive": true
}
```

That schema is not permission to certify an inactive source without provider evidence. `evidence_shape()` checks consistency only and **always** returns `release_authorized: false`. Independent human review and PAT-revocation authorization remain required.

## Exit and issue closure

There is one closure issue: **#2569**. Close it only after gates A–E have actual evidence references. Then link the result to merged #2364 and record the provider PAT revocation date. If a product defect unrelated to actual Airtable usage is found, route it to its own issue; do not extend this release indefinitely.
