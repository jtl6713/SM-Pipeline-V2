# Source-Control Baseline

Baseline migration started: 2026-08-15.

## Objective

Capture the currently deployed/verified SM Pipeline V2 implementation in GitHub before enabling GitHub-driven Cloudflare production deployments.

## Authority model

- **GitHub:** source code, deployment configuration, scripts, Make blueprint exports, technical documentation.
- **Google Drive:** authoritative durable media / DAM.
- **Cloudflare:** runtime, Workers, Pages, tunnels, transient processing/staging/preview/cache.
- **Airtable:** operational workflow/configuration data and pipeline state.
- **Make:** automation runtime; verified blueprint exports are version-controlled in this repository.

## Current migration checkpoints

### Studio API Worker

Current recovered source identifies itself as:

`0.9.4-item4-r2-explicit-eligibility`

Worker name:

`chicagoshining-studio-api`

This source is newer than the August 14 handoff baseline and must be treated as the current Worker candidate until compared with the live Cloudflare Worker.

### Studio Pages

The last formally packaged/manifest-verified Pages release in the August 14 handoff was:

`v0.6.17`

Subsequent production-hardening work advanced the live Studio UI beyond that package. Therefore **v0.6.17 is a verified rollback/package baseline, not automatically the current live source baseline**.

Before GitHub-based Pages deployment is enabled, recover the exact currently deployed frontend source and compare it with the latest working package.

### Remotion Renderer

The renderer has been relocated from the old nested `CSM-Pipeline-V2/remotion-tests/test-remotion` path to the production `Remotion_Renderer` location. Source-control migration must capture the new active folder, not the retired copy.

### Production Start/Stop/Verify

The service-management package was updated to reference the relocated Remotion renderer. Import the currently active production scripts after confirming their filesystem paths.

## Deployment safety gate

Do **not** enable automatic deployment from `main` until all of the following are true:

1. Current Cloudflare Worker source is captured and compared to live production.
2. Current Studio Pages source is captured and compared to live production.
3. Remotion active source is captured from the new production directory.
4. Start/Stop/Verify scripts are captured from the currently active directory.
5. Secrets/config values have been removed or replaced with examples.
6. A clean checkout can reproduce builds locally.
7. A preview/non-production deployment passes smoke testing.

Only after this gate should GitHub become the deployment trigger for Cloudflare production.
