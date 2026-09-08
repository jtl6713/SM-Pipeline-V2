# Quality Agent

Runbook for the Chicago Shining **Quality Agent**: one check catalog drives the tester lane (regression + cheap assertions) and the service lane (stuck / illogical Studio state). Detect stuck pipeline work, classify it, ticket a diagnosis pack, and (by mode) restart local services, open a PR, or — only when explicitly enabled — auto-merge an allowlisted heal.

This does **not** replace the Studio Worker cron self-heal in `apps/studio-api/worker.js`. The Worker still resumes stale produce/render/crop/AZ work every two minutes **and drains leftover Drive Ingestion files through A2** (including already-processed residue). Quality Agent acts only after that layer has failed, or when a Windows service is down, or when a catalog assertion / nightly suite is stale.

There is **no `development` branch**. Authority is `main`. Shipping is `cursor/desk-*` PR → merge `main` → Cloudflare trigger bump and/or `deploy/local-services/Deploy-SMService.ps1`.

Operator Word guide: `docs/handoffs/Quality-Agent.docx` (also `docs/handoffs/Autonomous-Service-Agent.docx`). Studio → Operations → Quality Agent.

The Cursor dashboard automation titled “Studio service desk observe” cannot be renamed from this repo. Rename it to Quality Agent in Cursor after this skill/prompt change.

## Kill switch

Airtable Pipeline Settings row `STUDIO_DESK_MODE` (also editable on Studio Operations). Do not rename the Airtable setting.

| Mode | Quality Agent may |
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
| Runtime healer | Studio Worker cron `*/2 * * * *` | Resume stale jobs, pulse T1/R4/R5, orphan enqueue, AZ resume, A1S oversized scan, **A2 drain of leftover Ingestion files** (processed residue + parked) | Patch git, merge, deploy, restart Windows, Approve publish for library-stills |
| Quality Agent | Cursor Automation (~15 min) or a local agent with this skill | Walk `payload.checks`, ticket findings, optionally PR | `git reset --hard`, force-push, edit live `Services\`, auto-publish library-stills, seed live mx1–mx5, send `thumb_offset` as a cover |
| Local companion | This Windows machine (`Invoke-DeskCompanion.ps1`) | Probe public `/health`, SYNC, START/STOP/VERIFY, PLAN/DEPLOY **one** service | Broad `Services\` overwrite, skip PLAN on first/risky deploys, merge unless mode is `automerge` |

## Inventory

`GET /api/ops/desk/inventory` (same Studio Access permissions as Operations). Returns `incidents` (fingerprints) **and** `checks` (every catalog row with `pass` / `finding` / `not_run`).

Catalog source: `apps/studio-api/quality-checks.mjs`.

Fingerprints: `kind + record_id + error_class`. Reuse the fingerprint; do not open five PRs for one parked job.

Class → actor:

- `transient` → leave to Worker heal after ticketing (`intake_parked` is eligible unprocessed Ingestion files under 100 MB; `intake_processed_residue` is already a Media Asset leftover; cron pulses A2 so Process intake is not required)
- `infra_down` → local companion
- `data_repair` → bounded Airtable field fix (no schema, no publish)
- `code_bug` → desk agent PR
- `produce_clip_mismatch` (`clip_count_mismatch`) → code_bug immediately. Remotion `expected N, received M`. Stories often succeed (they skip T1) while Reels/TikTok/YouTube stay Ready for Render. Fix `expectedClipCount` to `len(clips)` then resume studio-produce. Do not wait for heal budget. Proven: Lincoln Park Zoo `reccEj6eVXPPKalJd` outputs 370–375.
- `variant_heic_sprite` (`stacked_fill_crop`) → code_bug. 9:16 fill-crop looks like two photos stacked (horizontal seam). Raw iPhone HEIC tile grid went to Cloudflare Images / `ffmpeg -map 0:v:0`. Decode with ffmpeg default tile grid, recrop, restamp, re-render. Worker heal cannot replace Drive pixels. Proven: Lincoln Park Zoo IG Reel 370.
- `rfr_locked_missing_deliverable` (`cover` / `final_file` / `lettering`) → Worker stages a public 3D still and stamps siblings. `code_bug` if `wait_thumbnail` repeats past 15 minutes. Labels can say Ready for Review; Open review is the gate. Proven: Big John’s Skeleton 391/393/395/396.
- repeating fingerprint in 24h or `unknown` → freeze, email Joseph, stop

Human sessions that find a stuck bug must POST the same `desk_incident` in that turn. Do not wait for the 15-minute tick.

## Origin terminals

| Origin | After Promoted | Human gate |
|---|---|---|
| `origin=autonomous` | Ready for Review | Approve publish. Never auto-publish. |
| `origin=az-finished-video` | Auto-schedule / auto-approve when cover + caption + `Final_File_URL` exist | Operator may still change times. TikTok stays draft. |
| Manual / other | Ready for Review | Approve publish |

Do not treat Ready for Review autonomous as a finding **when Open review is actually available**. Labels plus a missing public cover (`creative_available=false`) is `rfr_locked_missing_deliverable`. Do not harvest a new autonomous idea while Draft/Ready/Submitted `origin=autonomous` work is in flight.

## Debug loop

1. Read inventory (or Airtable + public `/health` if Studio JWT is unavailable). Walk `checks`.
2. Open or reuse a Task Organizer event: `POST https://tasks.chicagoshining.com/agent-activity/log-event` with `type=desk_incident`, `agent_id=3`, `task_id=1` (tester findings may attach to `test_result`, `agent_id=13`).
3. Gather a diagnosis pack: request/output IDs, job JSON step/error, CF Worker events, last `resume_count`, implicated `/health`.
4. Classify. If `transient`, stop after ticketing.
5. If `code_bug` and mode is `patch` or `automerge`: branch `cursor/desk-<fingerprint-slug>`, smallest patch, tests if a contract exists (`apps/studio-api/desk-inventory.test.mjs`, `apps/studio-api/quality-checks.test.mjs`, `services/pipeline-runner/tests/test_produce_self_heal.py`).
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

`-RestartDown` requires mode `infra` or higher. `-DeployDown` additionally PLAN/DEPLOY the matching service from `main` when public `/health` is still down after VERIFY. Dirty checkout blocks DEPLOY and git reset, not START/VERIFY. Never `reset --hard`.

Hourly keep-alive on this Windows machine (Task Scheduler task `ChicagoShining Desk Companion Hourly`, user `Joe`, interactive logon):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\local-services\Register-DeskCompanionHourly.ps1"
```

Each tick: public `/health`; if a required probe is down, start **that** service hidden (`Start-ChicagoShiningHidden.ps1`, no extra consoles). If a live `.smv2-deployment.json` SHA is strictly behind `origin/main`, PLAN+DEPLOY **one** service from `main` (`-Yes`) so a merged enhancement restarts that listener. DEPLOY also starts hidden. Dirty checkout still allows START and that DEPLOY (isolated worktree). Never `reset --hard`. Cap: 1 service per tick, 2 per service per day. Logs: `Deployment Logs\Local Services\desk-companion-hourly-YYYYMMDD.log`. Unregister with `-Unregister`. The PC must stay on and logged in (locked is OK). Cursor Automations cannot restart these Windows listeners.

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

## Product gates the agent never crosses

- Library-stills `origin=autonomous`: stop at Ready for Review. Nothing auto-publishes.
- AZ `origin=az-finished-video` may auto-schedule; still do not send `thumb_offset` when a native cover is required.
- Google Drive remains media authority. Do not persist photos/video/music/thumbnails on R2 except the short-lived public cover copy.
- Repair Make leases stay a separate program.

## Recurrence watches

Same-place autonomous harvest, YouTube Drive-source Failed rows, and Ready-for-Review outputs that still cannot Open review: `docs/handoffs/autonomous-same-topic-harvest.md`. Inventory kinds `autonomous_topic_collision` (`data_repair`), `youtube_private_source_fail` (`transient` → Worker AP0 + YT reset), and `rfr_locked_missing_deliverable` (`transient` → Worker stages the public 3D still; `code_bug` if `wait_thumbnail` repeats past 15 minutes). Keep manual packages; do not recreate 2026-09-07 zoo extras; never `thumb_offset` when a native cover is required. Proven RFR-locked fixture: Big John’s Skeleton 391/393/395/396.

## Out of scope

- Replacing Worker self-heal
- Raising live e2e seed frequency
- Auto-publish of `origin=autonomous` library stills
- Renaming `STUDIO_DESK_MODE` in Airtable
- Cloudflare ↔ GitHub drift audit (`Documentation/DEFERRED_TODO.md`)
- Frame/Remotion working-file cleanup (`Documentation/DEFERRED_TODO.md`)
