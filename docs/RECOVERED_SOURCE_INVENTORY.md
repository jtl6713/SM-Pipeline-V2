# Recovered Source Inventory

Status as of 2026-08-15 while the regular production PC is unavailable.

## Cloudflare / Studio

### Studio API Worker

Newest recovered candidate:

- File: `worker_chicagoshining-studio-api_v0.10.3_single_parent_routing.txt`
- Embedded version: `0.10.3-single-parent-platform-output-routing`
- Status: newest known recovered source; compare against live Cloudflare before production deployment from GitHub.

Earlier recovered candidate:

- File: `worker for chicagoshining-studio-api.js`
- Embedded version: `0.9.4-item4-r2-explicit-eligibility`
- Status: superseded by v0.10.3 for migration purposes; retain only as historical rollback/reference if needed.

### Studio Pages

Verified rollback/package baseline:

- Package: `SM_Pipeline_V2_Studio_Pages_v0.6.17_FULL_DEPLOYMENT.zip`
- Verified files: `index.html`, `assets/app-item4-0617.js`, `assets/config.js`, `assets/styles-phase7-0617.css`, build/deploy manifests.
- Status: formally validated package, but not assumed to be current live UI.

Later recovered frontend file:

- File: `app-item4-0620.js`
- Status: newer JavaScript candidate exists, but companion HTML/CSS/config and deployed-state comparison are still required before calling it current.

## Program documentation

Latest recovered master workbook:

- `SM_Pipeline_V2_Master_Program_Workbook_v34_2026-08-14_TIKTOK_CORRECTED_E2E_3IMG_PLANNED.xlsx`
- Status: latest recovered program workbook found during migration inventory.

Latest recovered handoff:

- `SM_Pipeline_V2_Handoff_2026-08-14.md`
- Status: authoritative handoff reference for the August 14 checkpoint, subject to later code changes documented above.

## Make blueprints

The File Library contains many exported blueprints from different dates and versions. Historical exports must **not** be assumed current-live simply because they are available. Before importing a Make blueprint into the authoritative `make/blueprints/` tree:

1. Read the live scenario through the Make Admin Bridge.
2. Confirm scenario ID, name/version, webhook IDs, connections, filters, and module layout.
3. Compare the live blueprint to the candidate file.
4. Save the verified live blueprint as the authoritative source-control snapshot.
5. Mark older exports as rollback/reference only or omit them from the current production tree.

## Local-only services deferred until production PC is available

The following complete active folders still need direct import from the regular production PC:

- Remotion Renderer
- Frame Extractor
- Watermark service
- Voiceover Normalizer
- YouTube Uploader
- Production Start/Stop/Verify scripts

Do not reconstruct these projects from partial historical uploads when the authoritative active folders can be captured directly later.

## Deployment rule

No automatic GitHub-to-Cloudflare production deployment should be enabled until the recovered Cloudflare sources and active local service sources have been reconciled and the deployment safety gate in `SOURCE_CONTROL_BASELINE.md` is satisfied.
