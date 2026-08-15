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

Newest recovered source currently found in the ChatGPT File Library identifies itself as:

`0.10.3-single-parent-platform-output-routing`

Worker name:

`chicagoshining-studio-api`

Recovered source filename:

`worker_chicagoshining-studio-api_v0.10.3_single_parent_routing.txt`

This supersedes the earlier recovered `0.9.4-item4-r2-explicit-eligibility` source as the newest known source candidate. It must still be compared with the live Cloudflare Worker before GitHub-driven production deployment is enabled.

Notable v0.10.3 health metadata includes:

- `production_request_outputs_model: single-content-item-platform-output-seeds`
- `output_work_item_fanout: production-request-outputs-to-platform-outputs`
- `item4_preview_worker_build: 0.9.5`
- `item4_source_to_production_bridge: validated-preflight-v1`

### Studio Pages

The last formally packaged/manifest-verified Pages release in the August 14 handoff was:

`v0.6.17`

Verified package name:

`SM_Pipeline_V2_Studio_Pages_v0.6.17_FULL_DEPLOYMENT.zip`

Verified package contents were documented as:

- `BUILD-VALIDATION-v0.6.17.json`
- `DEPLOY-v0.6.17.txt`
- `index.html`
- `assets/app-item4-0617.js`
- `assets/config.js`
- `assets/styles-phase7-0617.css`

Subsequent production-hardening work advanced the live Studio UI beyond that package. Therefore **v0.6.17 is a verified rollback/package baseline, not automatically the current live source baseline**.

A later recovered `app-item4-0620.js` also exists in the File Library, but it must not be labeled current production until its companion HTML/CSS/config and deployed state are reconciled.

### Remotion Renderer

The renderer has been relocated from the old nested `CSM-Pipeline-V2/remotion-tests/test-remotion` path to the production `Remotion_Renderer` location. Source-control migration must capture the new active folder, not the retired copy.

A previously uploaded `render-server.js` is available as a reference, but the complete active service folder should be imported from the regular production PC before it is declared authoritative.

### Production Start/Stop/Verify

The service-management package was updated to reference the relocated Remotion renderer. Import the currently active production scripts after confirming their filesystem paths on the regular production PC.

## Migration while regular production PC is unavailable

Work that can proceed safely without the production PC:

1. Establish repository structure and source-control rules.
2. Inventory latest recovered Cloudflare/Studio sources in the File Library.
3. Preserve verified handoff documentation and deployment manifests.
4. Prepare GitHub/Cloudflare CI configuration without enabling production deployment.
5. Inventory Make blueprint exports and identify which are historical versus current-live candidates.

Work intentionally deferred until the production PC is available:

1. Import the complete active Remotion project.
2. Import local Frame Extractor, Watermark, Voiceover Normalizer, and YouTube Uploader service folders.
3. Import active Production Start/Stop/Verify scripts.
4. Run clean-checkout local build/service validation.

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
