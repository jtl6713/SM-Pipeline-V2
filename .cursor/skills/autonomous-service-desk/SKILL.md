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
- Recreate deleted same-place autonomous extras (Lincoln Park Zoo 2026-09-07: Free Zoo Escape / Birds to Rhinos / Quick Stroll). Keep Worth the trip.

## Recurrence watches (2026-09-07)

Read `docs/handoffs/autonomous-same-topic-harvest.md` on every tick. Inventory now emits these kinds:

### `autonomous_topic_collision` (`data_repair`)

Two or more recent ideas share a named place (longest landmark in the title/location) and at least one extra is `origin=autonomous`. Occupancy used to miss this because Idea Candidates were sorted by the wrong created-time field (`Created_At` vs `Create_Date`), Approved ideas were invisible, `zoo` was dropped as a short token, and a skipped produce released the AM/PM slot.

Auto-correct:

1. Leave Worker harvest to skip the next pick (place/location conflict + slot claim). Do not harvest a replacement.
2. Ticket fingerprint `autonomous_topic_collision:<place>:same_place`.
3. **Keep** the manual / non-autonomous package (Worth the trip pattern) and library stills.
4. In `observe`, stop after the ticket. If mode allows Airtable data repair, Cancel unpublished extra `origin=autonomous` PRs only. Never delete published posts or Drive masters other packages still use.

### `youtube_private_source_fail` (`transient` → Worker heal)

YouTube Approved for Publishing, no `YouTube_Video_ID`, `YouTube_Stage` is YT1 (Failed **or Ready to Publish**) or Terminal Error, Drive `Final_File_URL`, no public `Publish_Asset_URL`. Output 375 (Worth the trip Short `recRxp28DYcT9SEMW`) stuck this way: heal matched only Failed, Windows AP0 aborted a 121MB one-shot PUT (`10053`), then YTP1 saw a stale upload job id.

Auto-correct: leave to Worker `studioHealFailedYoutubeSourceDownloads` (Drive Range GET → R2 multipart `publish/` → reset YT1 → YTP1). After processing, `thumbnails.set` the 3D cover. Do **not** send `thumb_offset`. If the row is still missing a public MP4 after a later tick, that is a `code_bug`.
