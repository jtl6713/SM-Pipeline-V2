# Controlled Local Service Deployment

This framework promotes approved service source from GitHub `main` into the
Windows production runtime without running production directly from the Git
working copy.

## Authority model

- GitHub `jtl6713/SM-Pipeline-V2` `main`: approved source authority.
- `D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2`:
  local Git checkout only.
- `D:\Content Creation\ChicagoShining Pipeline\Services\...`: live runtime only.

## Supported services

| Selection | Git source | Live runtime | Port |
|---|---|---|---:|
| Frame Extractor | `services/frame-extractor` | `Services\Frame_Extractor` | 3334 |
| Remotion Renderer | `services/remotion-renderer` | `Services\Remotion_Renderer` | 3333 |
| Watermark | `services/watermark` | `Services\Watermark` | 3011 |
| Voiceover Normalizer | `services/voiceover-normalizer` | `Services\voiceover-normalizer\service` | 3012 |
| YouTube Uploader | `services/youtube-uploader` | `Services\youtube-uploader\service` | 3340 |

The numbered operational tab contract is preserved: `1 LOC` through `5 LOC`.

## Safety contract

A normal deployment:

1. Requires a clean local Git checkout.
2. Fetches and fast-forwards `main`.
3. Resolves the exact approved commit.
4. Refuses a requested commit that is not an ancestor of `origin/main`.
5. Materializes that commit in an isolated temporary Git worktree.
6. Verifies current local and public service health before mutation.
7. Creates a timestamped local backup.
8. Stops only the selected service.
9. Copies source-controlled files only.
10. Preserves `.env`, OAuth/token files, runtime job data, generated media,
    `node_modules`, Python virtual environments, caches and logs.
11. Reinstalls dependencies only when required or missing.
12. Restarts only the selected service with the existing numbered tab title.
13. Requires local `/health` and permanent public `/health` to pass.
14. Writes `.smv2-deployment.json` to the live service containing the exact Git SHA.
15. Automatically restores the previous source/dependencies and restarts the
    previous service if deployment fails.

## First proof

Use Watermark first.

Plan only:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Deploy-SMService.ps1" -Service watermark -PlanOnly
```

The plan must complete without changing production.

Then perform the same-commit deployment:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Deploy-SMService.ps1" -Service watermark
```

Type `DEPLOY` only after reviewing the displayed plan.

## Install friendly launchers

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File ".\deploy\local-services\Install-Deployment-Shortcuts.ps1"
```

This adds three BAT launchers to `Production Start-Stop-Verify Services`:

- `PLAN Local Service Deployment.bat`
- `DEPLOY Local Service.bat`
- `ROLLBACK Local Service.bat`

They display a numbered 1-5 service menu, so ordinary operation does not require
remembering Git commands.
