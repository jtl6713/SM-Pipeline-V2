# Deferred TODOs

These items are recorded for future work. They are **not authorized for implementation merely by appearing here**.

## DONE — Frame Extractor and Remotion working-file cleanup

**Status:** Implemented 2026-09-06. Canonical helper: `services/_shared/scratch_ttl.py`.

In-process TTL + post-success `/cleanup` on Frame Extractor, Video Compressor, and Timing Engine; Remotion keeps `remotion-cleanup.js`; cloud-vm has an independent `scratch-ttl` sidecar. Details: `docs/LOCAL_SERVICE_ARTIFACT_CLEANUP_TODO.md`. Temporary/generated folders stay out of Git.

## TODO — Cloudflare ↔ GitHub inventory and drift audit

**Status:** Deferred by owner on 2026-08-17.

### Goal

Establish a definitive, evidence-backed map between the live Cloudflare estate and the source/configuration stored in `jtl6713/SM-Pipeline-V2` so a future maintainer or AI can tell which Git path is authoritative for each deployed Cloudflare component and identify anything that exists only in the live Cloudflare account.

### Audit scope

Inventory and map, at minimum:

- Cloudflare Workers and their production routes/custom domains;
- Cloudflare Pages projects and the exact source/build/deployment baseline;
- Wrangler/non-secret deployment configuration and compatibility dates;
- Worker bindings and service bindings;
- R2 buckets used by the pipeline and their intended authority/retention role;
- KV, D1, Queues, Durable Objects or other bound resources if present;
- Cloudflare Tunnel hostnames/routes used by the eight local services;
- GitHub Actions or other Git-driven Cloudflare deployment workflows;
- production deployment/version identifiers needed for drift detection.

### Required output

Create a source-control inventory showing, for every live Cloudflare component:

1. Cloudflare component name and type;
2. live purpose / production URL or route;
3. authoritative GitHub source/config path;
4. current deployment mechanism;
5. current production version/deployment identifier where available;
6. whether live Cloudflare matches GitHub;
7. remediation for any drift or live-only source.

### Security boundary

Do **not** put API tokens, account secrets, tunnel credentials, Access service tokens, private keys, populated secret values, or equivalent credentials into Git. Document secret names/binding names only when useful.

### Completion gate

Do not mark this TODO complete until every production Worker/Pages component and relevant Cloudflare resource has either:

- an identified GitHub source/config authority; or
- an explicit documented reason why it is runtime-only and should not be source-controlled.

## TODO — Autonomous service desk (Phase 4 automerge remains gated)

**Status:** Phase 0–3 implemented 2026-09-07. Phase 4 auto-merge stays off until proven.

### Landed

- Inventory: `GET /api/ops/desk/inventory`, Operations strip, kill switch `STUDIO_DESK_MODE` (`PATCH /api/ops/desk/mode`)
- Classifiers: `apps/studio-api/desk-inventory.mjs`
- Runbook: `docs/handoffs/autonomous-service-desk.md`
- Skill: `.cursor/skills/autonomous-service-desk/SKILL.md`
- Local companion: `deploy/local-services/Invoke-DeskCompanion.ps1`
- Observe automation: Cursor scheduled agent (ticket-only). Prompt is in the skill.

### Still gated

Do not set `STUDIO_DESK_MODE=automerge` until allowlisted auto-merge has been proven on real incidents: CI green, `AUTO_MERGE_ALLOWLIST` only, daily caps, no recurring fingerprint. Default remains `observe`.

Worker cron self-heal is unchanged. The desk does not auto-publish.
