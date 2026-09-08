---
name: autonomous-service-desk
description: >-
  Chicago Shining Quality Agent (tester + service desk) for stuck Studio
  produce/render/crop/AZ jobs, catalog checks, down local services, diagnosis
  packs, cursor/desk-* PRs, and gated allowlisted auto-merge. Use when inventory,
  Desk_Mode, stuck workflow, produce escalated, companion SYNC/VERIFY/DEPLOY,
  or Quality Agent / service-desk automation runs.
---

# Quality Agent

Read `docs/handoffs/autonomous-service-desk.md` if you need the long form. Follow this skill on every Quality Agent tick **and** whenever a human session finds a stuck pipeline bug. Ticket immediately; do not wait for the schedule.

Rename the Cursor dashboard automation to **Quality Agent** in Cursor after this prompt (the repo cannot rename that dashboard item).

## Mode

Read `STUDIO_DESK_MODE` from inventory (`desk_mode`) or Airtable Pipeline Settings. Ladder: `off` < `observe` < `infra` < `patch` < `automerge`. Missing value is `observe`. `off` means ticket nothing and change nothing.

## Every tick

1. `GET /api/ops/desk/inventory` when Studio Access works. Else classify Airtable rows with `apps/studio-api/desk-inventory.mjs` rules plus public `*.chicagoshining.com/health`. Walk **every** `payload.checks` row (catalog sentences in `apps/studio-api/quality-checks.mjs`).
2. For each catalog row with `status=finding`, reuse `fingerprint`. Ticket `desk_incident` (`agent_id=3`) or attach to last `test_result` (`agent_id=13`) when the finding is a failed regression assertion (`tester_nightly`, `tester_catalog_assert`).
3. Skip `class=transient` after ticketing — Worker cron is the healer (`intake_processed_residue` / `intake_parked` drain via A2; `promoted_not_rfr` / `az_not_auto_finished` resume produce / AZ auto-approve).
4. Same fingerprint twice in 24h → email Joseph, stop. Do not PR.
5. Ticket via `POST https://tasks.chicagoshining.com/agent-activity/log-event`:

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

6. Stop after ticketing unless mode allows the next actor.
7. Do **not** seed live mx1–mx5 platform-matrix rows on this tick. Nightly `.github/workflows/regression-suite.yml` remains the expensive rotation. Cheap catalog assertions and last-suite freshness are enough.

## Watch: Pipeline all Blocked / clip count mismatch

If every Platform Output on a request shows Studio state Blocked (0/N rendered), **or stories are Ready for Review while Reels/TikTok/YouTube stay Ready for Render**, check parent `Studio_Production_Job_JSON`. Error `Render clip count mismatch` (`expected N, received M`) is `kind=produce_clip_mismatch`, `class=code_bug`. Stories skip T1 so they render; T1 expands `Render_Clip_List_JSON` without matching `expectedClipCount`. Fix: `expected_clip_count` in `r4/render_request.py` must equal `len(clips)`. Worker heal retries cannot fix the old payload. Proven fixture: Lincoln Park Zoo `reccEj6eVXPPKalJd` / outputs 370–375, expected 20 received 28.

After that mismatch is fixed, do **not** start four 28-clip Remotion jobs at once. Concurrent compositor load causes `delayRender` / `Request closed` / exit code 1 around frame ~848. Serialize R4 (one new render while any output is Rendering). Requeue Failed `exit code 1` to Ready for Render. Do not Approve publish.

## Watch: 9:16 fill-crop looks like two photos stacked

Instagram/Facebook Reels (or any 9:16 photo-sequence) that show **two mismatched vertical halves with a horizontal seam** are a bad HEIC crop, not a Remotion letterbox. iPhone HEIC stills are a tile grid (many 512px HEVC tiles). Sending raw HEIC to Cloudflare Images, or `ffmpeg -map 0:v:0`, uses one/two tiles instead of the assembled 4032×3024 photo. Kind `variant_heic_sprite`, class `code_bug`. Fix: `ffmpeg_heic_still` in `integrations/variant_service.py` (default decode, **no** `-map`, `-frames:v 1 -update 1`) before the variant Worker. Recrop 9:16 rows (clear Drive authority so Item 4 does not reuse the stacked JPEG), restamp clip lists, requeue Ready for Render. Worker heal cannot fix pixels already in Drive. Proven: Lincoln Park Zoo `reccEj6eVXPPKalJd` IG Reel 370 / crop `1h1e7mcXSxPJGvgImBp1c_Y7iRjUyljtr`.

## Observe (`observe`)

Ticket only. No git, no deploy, no restart, no Airtable writes, no Make pulses, no Studio Approve.

## Infra (`infra`)

Local companion only, on the Windows machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\local-services\Invoke-DeskCompanion.ps1" -RestartDown
```

Dirty checkout → stop. Never `git reset --hard`. One service at a time. Public `/health` down after VERIFY may `-DeployDown` from `main` only.

## Patch (`patch`)

Branch `cursor/desk-<slug>` from `main`. Smallest fix. Run `node --test apps/studio-api/desk-inventory.test.mjs apps/studio-api/quality-checks.test.mjs` when classifiers or the catalog change. Open a PR. **Do not merge.** Comment the fingerprint and diagnosis. After Joseph merges, local companion runs the ship playbook in the runbook (SYNC, trigger bump, PLAN/DEPLOY one service).

## Automerge (`automerge`, Phase 4)

Call `deskMayAutomerge` mentally with the changed paths. Refuse unless every path is allowlisted (`apps/studio-api/worker.js`, `desk-inventory.mjs`, `quality-checks.mjs`, `services/pipeline-runner/studio_produce/`, `item4/`), CI is green, caps remain, and the fingerprint is not recurring. Default production mode must stay below `automerge` until proven.

## Never

- Auto-publish or Approve publish for `origin=autonomous` library-stills
- Treat Ready for Review autonomous work as a finding
- Send `thumb_offset` when a native cover is required
- Persist library media on R2
- Force-push, `--no-verify`, commit `.env` / tokens
- Edit live `Services\` except emergency, then reconcile to Git immediately
- Pulse Make as a substitute for Worker cron
- Harvest a new autonomous idea while Draft/Ready/Submitted `origin=autonomous` work is in flight
