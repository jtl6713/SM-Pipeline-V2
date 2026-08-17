# Deferred TODOs

These items are recorded for future work. They are **not authorized for implementation merely by appearing here**.

## TODO — Frame Extractor and Remotion working-file cleanup

**Status:** Deferred by owner on 2026-08-17.

### Problem

Disposable Frame Extractor working frames and Remotion temporary/render working files can accumulate over time, especially after interrupted jobs, failed renders, crashes, or reboots.

### Desired future solution

Implement two complementary cleanup layers:

1. **Post-success cleanup**
   - Remove disposable job working files only after downstream consumption/completion is confirmed.
   - Never delete authoritative source assets or final production outputs.

2. **Scheduled orphan safety sweep**
   - Run on a conservative schedule such as daily (frequency to be decided during implementation).
   - Delete only files older than an explicit retention threshold.
   - Detect/protect active jobs.
   - Support dry-run mode.
   - Log deleted paths, counts, bytes reclaimed, and skipped active files.
   - Fail safe if the disposable/authoritative classification cannot be proven.

### Pre-implementation audit required

Before writing deletion code, enumerate the actual live Frame Extractor and Remotion runtime directories and classify every candidate directory as one of:

- authoritative source/config;
- runtime dependency;
- active working state;
- disposable temporary state;
- final/authoritative output;
- backup/log/evidence.

Do not infer deletion safety solely from a directory name.

### Relationship to Git

Temporary/generated/runtime folders remain outside source control. Cleanup code/config, once designed and proven, should be source-controlled and deployed through the controlled local-service deployment framework.

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
- Cloudflare Tunnel hostnames/routes used by the five local services;
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
