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
