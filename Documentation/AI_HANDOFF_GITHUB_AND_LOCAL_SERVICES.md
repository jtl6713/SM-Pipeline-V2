# AI Handoff — GitHub and Local Services

Use this file as the compact starting point for a new AI assistant.

## Repository and authority

- Repository: `jtl6713/SM-Pipeline-V2`
- Approved source branch: `main`
- Local Git checkout:
  `D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2`
- Live runtime root:
  `D:\Content Creation\ChicagoShining Pipeline\Services`
- Operational control folder:
  `D:\Content Creation\ChicagoShining Pipeline\Source Control\Production-Start-Stop-Verify-Services`

**GitHub `main` is source authority.**  
**The local Git checkout is not production.**  
**The live `Services` folders are runtime.**

Read these before making changes:

1. `PROJECT_RULES.md`
2. `Documentation/GITHUB_SOURCE_CONTROL_AND_LOCAL_SERVICE_DEPLOYMENT_RUNBOOK.md`
3. `services/README.md`
4. `deploy/local-services/README.md`

## Five services

| # | Service | Git path | Runtime path | Port |
|---:|---|---|---|---:|
| 1 | Frame Extractor | `services/frame-extractor` | `Services\Frame_Extractor` | 3334 |
| 2 | Remotion Renderer | `services/remotion-renderer` | `Services\Remotion_Renderer` | 3333 |
| 3 | Watermark | `services/watermark` | `Services\Watermark` | 3011 |
| 4 | Voiceover Normalizer | `services/voiceover-normalizer` | `Services\voiceover-normalizer\service` | 3012 |
| 5 | YouTube Uploader | `services/youtube-uploader` | `Services\youtube-uploader\service` | 3340 |

Required window titles remain:

- `1 LOC Frame Extractor :3334`
- `2 LOC Remotion Renderer :3333`
- `3 LOC Watermark :3011`
- `4 LOC Voiceover Normalizer :3012`
- `5 LOC YouTube Uploader :3340`

## Permanent public hostnames

- `https://frames.chicagoshining.com`
- `https://render.chicagoshining.com`
- `https://watermark.chicagoshining.com`
- `https://voiceover.chicagoshining.com`
- `https://youtube-upload.chicagoshining.com`

## Deployment framework

Files:

- `deploy/local-services/Deploy-SMService.ps1`
- `deploy/local-services/Install-Deployment-Shortcuts.ps1`
- `deploy/local-services/README.md`

Friendly launchers:

- `SYNC Local Git Checkout.bat`
- `PLAN Local Service Deployment.bat`
- `DEPLOY Local Service.bat`
- `DEPLOY Pipeline Runner.bat`
- `ROLLBACK Local Service.bat`
- `INSTALL Operator Shortcuts.bat` (also creates pipeline-root shortcuts beside START / STOP / VERIFY)

Framework proof state:

- framework added: `13a731737708192c50c75ac65d1f47ef09ef5c4a`
- Windows PowerShell 5.1 fix: `051b6251bad51f797f39765096b68008de08fce1`
- Watermark PLAN/deploy/rollback/redeploy proved
- all five services subsequently verified in the managed model
- final production verifier reported all five local services and all five permanent routes reachable

## Safety invariants

- One service at a time.
- PLAN before the first/risky deployment.
- Do not run production from the Git checkout.
- Do not blindly overwrite `.env`, OAuth/token material, virtual environments, `node_modules`, YouTube runtime data, generated media, logs, caches, or temp files.
- Do not commit secrets.
- Do not commit YouTube `data/youtube-jobs.json`.
- Do not weaken health checks to make a deployment pass.
- Keep rollback backup until deployment confidence is established.
- Do not casually use `git reset --hard`, `git clean -fdx`, or force-push.
- A direct edit to live service source is an emergency exception and must be reconciled into Git immediately.
- Prefer branch + Pull Request for service logic changes when possible.

## First actions in a new AI session

1. Fetch latest GitHub `main`.
2. Read the four documents listed above.
3. Check `git status` / repo state before local Git work.
4. Confirm target service baseline health.
5. Review exact requested change and source path.
6. Make the narrowest reversible source change.
7. Use a branch/PR when available.
8. Merge approved source into `main`.
9. PLAN the target service.
10. DEPLOY the target service.
11. Verify local `/health` and permanent public `/health`.
12. Run full production VERIFY for material changes.

## Deferred TODO — do not implement yet

Frame Extractor and Remotion working-file cleanup remains intentionally deferred.

Future design should combine:
- post-success cleanup;
- scheduled orphan cleanup;
- active-job protection;
- age/retention rules;
- dry-run;
- logging and reclaimed-space reporting.

See `Documentation/DEFERRED_TODO.md`.
