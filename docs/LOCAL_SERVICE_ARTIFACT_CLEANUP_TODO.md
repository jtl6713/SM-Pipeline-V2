# Local Working-Artifact Cleanup

Status: **Implemented** (in-process TTL + independent sidecar for the cloud-vm scratch volume)

Created: 2026-08-17
Updated: 2026-09-06

## Problem

Generated working files can accumulate indefinitely on the Windows service host:

- Frame Extractor: `public/frames/<job>/` and `work/`
- Remotion: `public/render-assets/`, `render-props/`, `out/`, and related temporary working files

The supplied Frame Extractor archive already contained 41 historical frame-job folders / 205 JPEGs (about 22 MB uncompressed), demonstrating that normal processing currently leaves artifacts behind.

## Required design: hybrid cleanup

Use **both** transaction-aware cleanup and an independent TTL safety sweep.

Canonical Python helper: [`services/_shared/scratch_ttl.py`](../services/_shared/scratch_ttl.py). Vendored copies stay next to the ffmpeg services and in `deploy/cloud-vm/scratch-ttl/` so Windows one-folder deploy and the sidecar Docker context still work.

Implemented:

- Frame Extractor: `POST /cleanup/<job_id>`, `GET /cleanup/report`, `POST /cleanup/sweep`, hourly in-process sweep (`FRAME_EXTRACTOR_TTL_HOURS`, default 24).
- Video Compressor: same endpoints plus `VIDEO_COMPRESSOR_TTL_HOURS` (default 24).
- Timing Engine: hourly sweep of `WORK_DIR` leftovers.
- Remotion: existing `remotion-cleanup.js` stale sweep (default 72 hours) plus hourly timer already started from `render-server.js`.
- Voiceover: existing `FILE_TTL_MS` (15 minutes).
- Cloud VM: `scratch-ttl` sidecar in [`deploy/cloud-vm`](../deploy/cloud-vm/README.md) sweeps the shared volume independently.

### A. Frame Extractor — post-consumption cleanup

Do not delete frames immediately when `/extract` returns: downstream Make/OpenAI still needs to fetch the returned frame URLs.

Implement an idempotent, path-safe cleanup endpoint such as:

`POST /cleanup/<job_id>`

Then invoke it only after the owning A3 classification/asset-enrichment transaction has durably completed or terminally failed and no downstream consumer needs the frame URLs.

Required guards:

- strict job-id validation and root-path confinement
- refuse active jobs
- idempotent success if already absent
- structured deletion result (files/bytes/errors)
- no deletion outside `public/frames` / `work`

### B. Frame Extractor — hourly TTL safety sweep

Add an independent sweeper, recommended default TTL **24 hours**, configurable by environment variable.

The sweeper should:

- scan only known working roots
- skip active jobs
- support report/dry-run mode
- bound max jobs and/or bytes deleted per run
- log job IDs, age, paths, file count and bytes freed
- tolerate already-deleted paths

An hourly sweep is preferred over daily because frame artifacts are small/short-lived and jobs should normally be consumed quickly.

### C. Remotion — preserve existing per-job cleanup and add independent sweep

The current renderer already contains `remotion-cleanup.js` with:

- explicit per-job cleanup
- active-job protection
- idempotent removal
- cleanup of render assets, render props and output MP4
- stale cleanup with `REMOTION_STALE_CLEANUP_HOURS`, default 72 hours

Do **not** replace that behavior. Harden it by ensuring the stale sweep runs independently of service restart—e.g. an hourly in-process timer or Windows scheduled task—so a long-running healthy renderer does not depend on reboot/restart for stale cleanup.

Recommended default Remotion TTL: retain the existing **72 hours** unless production evidence supports shortening it.

### D. Verification / observability

Before enabling destructive cleanup:

1. Run report-only against current directories.
2. Verify active jobs are excluded.
3. Create disposable stale + fresh fixtures and prove only stale fixtures are selected.
4. Prove path traversal / malformed job IDs fail closed.
5. Prove repeated cleanup is idempotent.
6. Record counts and bytes freed.
7. Verify a normal render/frame-extraction transaction still completes after cleanup is enabled.

## Source-control exclusions

Working artifacts must remain excluded from Git:

- `public/frames/`
- `work/`
- `render-assets/`
- `render-props/`
- `out/`
- logs/caches/media outputs

## Related 21-item work

This housekeeping TODO is separate from Item 6. It may overlap operationally with Item 12 (R2 lifecycle/version/TTL/cleanup), but local disk cleanup should remain independently testable and must not be used as a shortcut for R2 lifecycle proof.
