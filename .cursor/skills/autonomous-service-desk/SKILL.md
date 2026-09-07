---
name: autonomous-service-desk
description: >-
  Chicago Shining autonomous service desk for stuck Studio produce/render/crop/AZ
  jobs, down local services, diagnosis packs, cursor/desk-* PRs, and gated
  allowlisted auto-merge. Use when inventory, Desk_Mode, stuck workflow, produce
  escalated, companion SYNC/VERIFY/DEPLOY, or service-desk automation runs.
---

# Autonomous service desk

Read `docs/handoffs/autonomous-service-desk.md` if you need the long form. Follow this skill on every desk tick.

## Mode

Read `STUDIO_DESK_MODE` from inventory (`desk_mode`) or Airtable Pipeline Settings. Ladder: `off` < `observe` < `infra` < `patch` < `automerge`. Missing value is `observe`. `off` means ticket nothing and change nothing.

## Every tick

1. `GET /api/ops/desk/inventory` when Studio Access works. Else classify Airtable rows with `apps/studio-api/desk-inventory.mjs` rules plus public `*.chicagoshining.com/health`. `intake_parked` means eligible files are still in the Drive ingestion folder; Worker heal should drain them via A2.
2. Skip `class=transient` (Worker cron already heals).
3. Reuse `fingerprint`. Same fingerprint twice in 24h → email Joseph, stop. Do not PR.
4. Ticket via `POST https://tasks.chicagoshining.com/agent-activity/log-event`:

```json
{
  "task_id": 1,
  "agent_id": 3,
  "type": "desk_incident",
  "payload": {
    "status": "open",
    "fingerprint": "",
    "class": "",
    "kind": "",
    "record_id": "",
    "diagnosis": ""
  }
}
```

5. Stop after ticketing unless mode allows the next actor.

## Observe (`observe`)

Ticket only. No git, no deploy, no restart, no Airtable writes, no Make pulses, no Studio Approve.

## Infra (`infra`)

Local companion only, on the Windows machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\local-services\Invoke-DeskCompanion.ps1" -RestartDown
```

Dirty checkout → stop. Never `git reset --hard`. One service at a time. Public `/health` down after VERIFY may `-DeployDown` from `main` only.

## Patch (`patch`)

Branch `cursor/desk-<slug>` from `main`. Smallest fix. Run `node --test apps/studio-api/desk-inventory.test.mjs` when classifiers change. Open a PR. **Do not merge.** Comment the fingerprint and diagnosis. After Joseph merges, local companion runs the ship playbook in the runbook (SYNC, trigger bump, PLAN/DEPLOY one service).

## Automerge (`automerge`, Phase 4)

Call `deskMayAutomerge` mentally with the changed paths. Refuse unless every path is allowlisted (`apps/studio-api/worker.js`, `desk-inventory.mjs`, `services/pipeline-runner/studio_produce/`, `item4/`), CI is green, caps remain, and the fingerprint is not recurring. Default production mode must stay below `automerge` until proven.

## Never

- Auto-publish or Approve publish
- Send `thumb_offset` when a native cover is required
- Persist library media on R2
- Force-push, `--no-verify`, commit `.env` / tokens
- Edit live `Services\` except emergency, then reconcile to Git immediately
- Pulse Make as a substitute for Worker cron
- Harvest a new autonomous idea while Draft/Ready/Submitted `origin=autonomous` work is in flight
