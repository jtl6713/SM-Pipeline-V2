# SM Pipeline V2 Documentation

This folder is the durable operational documentation for the SM Pipeline V2 repository and local-service source-control/deployment process.

## Start here

1. **`GITHUB_SOURCE_CONTROL_AND_LOCAL_SERVICE_DEPLOYMENT_RUNBOOK.md`**  
   Complete human/operator runbook for GitHub, the local source-control checkout, the five local services, PLAN/DEPLOY/ROLLBACK, troubleshooting, and recovery.

2. **`AI_HANDOFF_GITHUB_AND_LOCAL_SERVICES.md`**  
   Compact handoff for a new AI assistant. It identifies the authority boundaries, exact paths, safety rules, deployment framework, and first validation steps.

3. **`DEFERRED_TODO.md`**  
   Deferred housekeeping items that are intentionally not being implemented yet, plus the service-desk Phase 4 automerge gate.

4. **`docs/handoffs/autonomous-service-desk.md`**  
   Autonomous service desk runbook (inventory, modes, companion, ship playbook).

## Repository

- GitHub repository: `jtl6713/SM-Pipeline-V2`
- Approved source branch: `main`
- Local Git checkout: `D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2`
- Live runtime root: `D:\Content Creation\ChicagoShining Pipeline\Services`
- Operational control folder: `D:\Content Creation\ChicagoShining Pipeline\Source Control\Production-Start-Stop-Verify-Services`

## Current operating model

GitHub `main` is the approved editable source authority. The local `Source Control` checkout is a Git working copy only. The live `Services` folders are runtime only. Production does **not** run directly from the Git checkout.

Changes move from GitHub to a live service through the controlled deployment framework under:

`deploy\local-services\`

The framework has been proven with PLAN, deploy, backup, rollback, redeploy, and full five-service verification.

Do not commit secrets, credentials, OAuth tokens, generated media, virtual environments, dependency directories, caches, logs, runtime job state, or temporary render/frame data.
