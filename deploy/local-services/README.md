# Controlled Local Service Deployment

This framework promotes approved service source from GitHub `main` into the Windows production runtime without running production directly from the Git working copy.

**Current proven framework version:** `1.0.2-keep-dirty-checkout`

For the complete operator and AI-handoff procedure, read:

`Documentation/GITHUB_SOURCE_CONTROL_AND_LOCAL_SERVICE_DEPLOYMENT_RUNBOOK.md`

## Authority model

- GitHub `jtl6713/SM-Pipeline-V2` `main`: approved source authority.
- `D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2`: local Git checkout only.
- `D:\Content Creation\ChicagoShining Pipeline\Services\...`: live production runtime.

## Supported services

| Selection | Git source | Live runtime | Port |
|---|---|---|---:|
| Frame Extractor | `services/frame-extractor` | `Services\Frame_Extractor` | 3334 |
| Timing Engine | `services/timing-engine` | `Services\timing-engine\service` | 3336 |
| Remotion Renderer | `services/remotion-renderer` | `Services\Remotion_Renderer` | 3333 |
| Watermark | `services/watermark` | `Services\Watermark` | 3011 |
| Voiceover Normalizer | `services/voiceover-normalizer` | `Services\voiceover-normalizer\service` | 3012 |
| YouTube Uploader | `services/youtube-uploader` | `Services\youtube-uploader\service` | 3340 |
| Pipeline Runner | `services/pipeline-runner` | `Services\pipeline-runner\service` | 3350 |

The numbered operational tab contract is `1 LOC` through `8 LOC` (Video Compressor is 7; Timing Engine is 8). Video Compressor stays on `Install-VideoCompressor.ps1` until the `Deploy-SMService.ps1` selector includes it. Linux/ARM compose for a later Oracle VM is [`deploy/cloud-vm/`](../cloud-vm/README.md); do not mix that into this Windows PLAN/DEPLOY path.

## Safety contract

A normal deployment:

1. Fetches `origin/main`. Local leftover files (for example `package.json` or an edited Worker) stay in the Git checkout and are not copied into production.
2. Does not require a clean checkout and does not switch your current branch.
3. Resolves the exact approved commit.
4. Refuses a requested commit that is not an ancestor of `origin/main`.
5. Materializes that commit in an isolated temporary Git worktree.
6. Verifies current local and public service health before mutation.
7. Creates a timestamped local backup.
8. Stops only the selected service.
9. Copies source-controlled/deployable files only.
10. Preserves `.env`, OAuth/token files, runtime job data, generated media, `node_modules`, Python virtual environments, caches and logs.
11. Reinstalls dependencies only when required or missing.
12. Restarts only the selected service with the existing numbered tab title.
13. Requires local `/health` and permanent public `/health` to pass.
14. Writes `.smv2-deployment.json` to the live service containing the exact Git SHA.
15. Automatically restores the previous source/dependencies and restarts the previous service if deployment fails.

## Proven acceptance

On 2026-08-17:

- PLAN was proven read-only.
- Watermark was deployed from an exact approved commit.
- Watermark local/public health passed.
- Manual rollback passed and health was re-verified.
- Watermark was redeployed into the Git-managed state.
- The other four services were PLAN-validated and brought into the managed deployment model.
- Final production verification confirmed all six local services and all six permanent Cloudflare routes reachable.

Framework commits:

- `13a731737708192c50c75ac65d1f47ef09ef5c4a` — initial framework
- `051b6251bad51f797f39765096b68008de08fce1` — Windows PowerShell 5.1 collection compatibility

## Friendly launchers

Installed under `Source Control\Production-Start-Stop-Verify-Services` (Git repo; legacy junction at `Production Start-Stop-Verify Services`):

- `SYNC Local Git Checkout.bat` (fast-forward `SM-Pipeline-V2` to `origin/main`)
- `PLAN Local Service Deployment.bat`
- `DEPLOY Local Service.bat` (menu; pick **6 Pipeline Runner**)
- `DEPLOY Pipeline Runner.bat` (pipeline-runner only)
- `DESK Companion.bat` (service-desk public `/health` probe; optional restart/deploy)
- Hourly keep-alive: `Register-DeskCompanionHourly.ps1` (VERIFY every hour; hidden START of a down service only; PLAN+DEPLOY one service when live stamp is behind `origin/main`)
- Hidden launch: `Start-ChicagoShiningHidden.ps1` (no extra Windows Terminal / PowerShell windows)
- `ROLLBACK Local Service.bat`
- `INSTALL Operator Shortcuts.bat` (refresh bats + pipeline-root `.lnk` files)

`SYNC-Git-Main.bat`, `INSTALL-Operator-Shortcuts.bat`, `DESK-Companion.bat`, and `DEPLOY-pipeline-runner.bat` also live next to `Deploy-SMService.ps1` in this folder after `git pull` on SM-Pipeline-V2.

After pulling this tooling, run once:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Install-Deployment-Shortcuts.ps1"
```

That script:

1. Writes/refreshes the operator `.bat` launchers
2. Archives known unused/one-time Start-Stop-Verify files under `_legacy_archive\`
3. Removes pipeline-root `.pytest_cache`
4. Archives the one-time `Complete DB and Google Asset Refresh` folder if present
5. Creates/refreshes ChicagoShining Pipeline **root** shortcuts beside START / STOP / VERIFY:
   - `SYNC Local Git Checkout`
   - `PLAN Local Service Deployment`
   - `DEPLOY Local Service`
   - `DEPLOY Pipeline Runner`
   - `ROLLBACK Local Service`
   - Existing START / STOP / VERIFY shortcuts are preserved (they may target Windows Terminal tabs)

SYNC updates the Git checkout only; it does not deploy or restart live services. VERIFY only checks that :3350 answers 200. It does not copy new Flask routes.

Task Organizer (standalone repo, port `3360`) is not a deployable SM service. Add it to the existing START / STOP / VERIFY windows with:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Integrate-TaskOrganizer-StartStopVerify.ps1"
```

That opens `9 LOC Task Organizer :3360` from the central START command and launches `http://localhost:3360/logs`.

## Direct PowerShell usage

Plan only:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Deploy-SMService.ps1" -Service watermark -PlanOnly
```

Deploy:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Deploy-SMService.ps1" -Service watermark
```

Rollback latest:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Deploy-SMService.ps1" -Service watermark -RollbackLatest
```

Prefer the friendly launchers for normal operator use.
