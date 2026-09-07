# Autonomous service desk

Runbook for the Chicago Shining **service desk**: detect stuck pipeline work, classify it, ticket a diagnosis pack, and (by mode) restart local services, open a PR, or — only when explicitly enabled — auto-merge an allowlisted heal.

This does **not** replace the Studio Worker cron self-heal in `apps/studio-api/worker.js`. The Worker still resumes stale produce/render/crop/AZ work every two minutes. The desk acts only after that layer has failed, or when a Windows service is down.

There is **no `development` branch**. Authority is `main`. Shipping is `cursor/desk-*` PR → merge `main` → Cloudflare trigger bump and/or `deploy/local-services/Deploy-SMService.ps1`.

## Kill switch

Airtable Pipeline Settings row `STUDIO_DESK_MODE` (also editable on Studio Operations).

| Mode | Desk may |
|---|---|
| `off` | Read inventory only |
| `observe` (default if unset) | Ticket diagnosis packs |
| `infra` | Observe + local companion SYNC/VERIFY/one-service DEPLOY when `/health` is down |
| `patch` | Infra + open `cursor/desk-*` PRs. Human merges |
| `automerge` | Patch + auto-merge **only** allowlisted heal paths after CI green. Phase 4; leave off until proven |

Set `STUDIO_DESK_MODE=off` to freeze the agents. Inventory and Worker heal keep running.

## Actors

| Actor | Where | Does | Must not |
|---|---|---|---|
| Runtime healer | Studio Worker cron `*/2 * * * *` | Resume stale jobs, pulse T1/R4/R5, orphan enqueue, AZ resume | Patch git, merge, deploy, restart Windows |
| Desk agent | Cursor Automation (15 min) or a local agent with this skill | Read inventory, classify, ticket, optionally PR | `git reset --hard`, force-push, edit live `Services\`, auto-publish, send `thumb_offset` as a cover |
| Local companion | This Windows machine (`Invoke-DeskCompanion.ps1`) | Probe public `/health`, SYNC, START/STOP/VERIFY, PLAN/DEPLOY **one** service | Broad `Services\` overwrite, skip PLAN on first/risky deploys, merge unless mode is `automerge` |

## Inventory

`GET /api/ops/desk/inventory` (same Studio Access permissions as Operations).

Fingerprints: `kind + record_id + error_class`. Reuse the fingerprint; do not open five PRs for one parked job.

Class → actor:

- `transient` → leave to Worker heal
- `infra_down` → local companion
- `data_repair` → bounded Airtable field fix (no schema, no publish)
- `code_bug` → desk agent PR
- repeating fingerprint in 24h or `unknown` → freeze, email Joseph, stop

## Debug loop

1. Read inventory (or Airtable + public `/health` if Studio JWT is unavailable).
2. Open or reuse a Task Organizer event: `POST https://tasks.chicagoshining.com/agent-activity/log-event` with `type=desk_incident`, `agent_id=3`, `task_id=1`.
3. Gather a diagnosis pack: request/output IDs, job JSON step/error, CF Worker events, last `resume_count`, implicated `/health`.
4. Classify. If `transient`, stop after ticketing.
5. If `code_bug` and mode is `patch` or `automerge`: branch `cursor/desk-<fingerprint-slug>`, smallest patch, tests if a contract exists (`apps/studio-api/desk-inventory.test.mjs`, `services/pipeline-runner/tests/test_produce_self_heal.py`).
6. Ship playbook after merge (human in `patch`, allowlisted auto in `automerge`):
   - `git checkout main && git pull --ff-only`
   - Worker/Pages source changed: append `deploy/cloudflare-worker-production.txt` and/or `deploy/cloudflare-pages-production.txt`, push, watch Actions (Worker auto-rollbacks on verify fail)
   - Local service changed: PLAN then DEPLOY **one** service
   - Process only: STOP/START/VERIFY
7. Re-check inventory for that fingerprint. Close the incident or escalate.

## Local companion

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\local-services\Invoke-DeskCompanion.ps1"
```

`-RestartDown` requires mode `infra` or higher. `-DeployDown` additionally PLAN/DEPLOY the matching service from `main` when public `/health` is still down after VERIFY. Dirty checkout → stop. Never `reset --hard`.

Caps file: `D:\Content Creation\ChicagoShining Pipeline\Deployment Logs\Local Services\desk-caps.json`.

## Phase 4 auto-merge (gated)

`deskMayAutomerge` in `apps/studio-api/desk-inventory.mjs` requires:

- `STUDIO_DESK_MODE=automerge`
- CI green
- every path on `AUTO_MERGE_ALLOWLIST` (heal/resume/health files only)
- no open human PR on the same files
- daily caps: 3 auto-PRs, 1 auto-merge, 2 restarts per service
- same fingerprint not seen twice in 24h

Leave mode at `observe` or `patch` until those rules have been proven on real incidents.

## Product gates the desk never crosses

- Library-stills `origin=autonomous`: stop at Ready for Review. Nothing auto-publishes.
- AZ `origin=az-finished-video` may auto-schedule; still do not send `thumb_offset` when a native cover is required.
- Google Drive remains media authority. Do not persist photos/video/music/thumbnails on R2 except the short-lived public cover copy.
- Repair Make leases stay a separate program.

## Out of scope

- Replacing Worker self-heal
- Cloudflare ↔ GitHub drift audit (`Documentation/DEFERRED_TODO.md`)
- Frame/Remotion working-file cleanup (`Documentation/DEFERRED_TODO.md`)
