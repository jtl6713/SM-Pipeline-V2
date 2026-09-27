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

## Watch: Ready for Render, no Remotion job, voiceover never generated

Job JSON says `Rendering 0/N` (~62%), heal `resume_count` climbs to `max_resumes`, and the output stays `Render_Status=Ready for Render` with blank `Remotion_Job_ID` while no Remotion job ever appears. Check the parent Content Item: `Studio_Effective_Voiceover_Mode=Yes` (or `Include_Voiceover=Yes`) but `Voiceover_URL` blank, `Voiceover_Status=Ready` (false ready), `Content_Status=Thumbnail Ready`. R4 returns `waiting_for_voiceover` on every pulse; pulsing R4 again is useless. Cause: cover staging overwrote `Content_Status` from `Ready for Voiceover` (the P2 selector) to `Thumbnail Ready` before P2 ran, then produce resumed at stamp → render and never revisited `audio`. Kind `render_ready_waiting_voiceover`, class `transient`, actor `worker_heal`, fingerprint `render_ready_waiting_voiceover:<output_rec>:no_voiceover_url`. Proven fixture: Output 432 / Content Item 137 / `PR-20260912174432-7YWV8G`.

Auto-correct: Worker `studioHealReadyNoJobVoiceover` (inside `healStuckStudioRenders`, `VO_STUCK_READY`) copies the parent `Voiceover_URL` down when it exists; otherwise sets parent `Content_Status=Ready for Voiceover`, `Voiceover_Status=Ready`, `Script_Status=Generated`, pulses P2, and resumes studio-produce (`pick_resume_step` now lands on `audio`; `step_render` runs P2 inline and treats `waiting_for_voiceover` as a wait). Cover writes (Worker `studioCoverContentStatusFields`, `thumbnail.cover_content_status_fields`) no longer clobber `Ready for Voiceover` while `Voiceover_URL` is blank. If the same fingerprint returns after a heal tick, it is a `code_bug`: attach parent field values (`Content_Status`, `Voiceover_Status`, `Voiceover_Script` present?, `Voiceover_URL`) and the P2 pulse result. Do not Approve. Skip rows whose parent `Voiceover_Status` is Not Needed / Skipped.

## Watch: Failed for more than an hour

Any Platform Output with `Publish_Status=Failed` or `Render_Status=Failed` for **≥ 60 minutes** is a finding, even when the error text is not in the old transient list. Kind `publish_failed_transient` / `render_failed`, class `transient`, actor `worker_heal`, error class `stale_failed` when the message itself is not retryable. Copyright / permission denied / invalid video / unsupported format / video too long / duplicate stay `code_bug`.

HTTP **401 / Unauthorized** on TikTok draft init (`TikTok photo draft initialization failed. HTTP 401`) used to park forever: TTD1 wrote `TikTok_Draft_Status=Manual Fallback` and `Publish_Retry_Eligible=false`, then Worker heal skipped it as non-transient. Proven fixture: Output **908** / Content Item 209 / `recuOQs6TgAXJqxRI` (Miami Vizcaya Rainy Day Plan, `TTD1_PHOTO_INIT`, last attempt 2026-09-26 08:47 UTC). The 401 body is the TikTok auth Worker rejecting `X-Pipeline-Secret` (`worker_version=v5.1-tiktok-caption-diagnostics`), not a Graph copyright block.

Auto-correct: Worker `studioHealFailedStatuses` / Failed-render requeue treats stale Failed and 401 as healable. For TikTok Manual Fallback / 401 it resets `TikTok_Draft_Status=Ready for Delivery`, clears `Manual_Fallback_Required`, and pulses TTD1. TTD1 retries 401/403 until attempt 5, then Manual Fallback. If the same 401 fingerprint returns after a later tick, the Miami/LA/NYC `TIKTOK_MAKE_SHARED_SECRET` does not match `TIKTOK_PIPELINE_SECRET` — that is `code_bug` / secret repair, not another silent park.

## Watch: Escalated — needs investigation

Parent `Studio_Production_Job_JSON.step=escalated` after five Worker resumes. Pipeline paints **Escalated — needs investigation** on every sibling output. Worker `resumeStaleStudioProductionJobs` used to skip this terminal step, so the row parked forever even when the block was recoverable (empty `Studio_Master_Assets_JSON` while library stills exist; outputs created after a "No Platform Outputs" block; transient HTTP that exhausted the budget). Kind `produce_escalated`, class `transient` when `deskRecoverableEscalatedError` matches, actor `worker_heal`. Clip-count mismatch stays `produce_clip_mismatch` / `code_bug`. Skip `Request_Status=Cancelled`.

Auto-correct: Worker `studioHealEscalatedProduce` rematches library stills (never fill-crop variants) for `No Studio master photos to crop`, resets `heal.resume_count`, writes `step=blocked`, and resumes studio-produce. Proven: Venice Canals CI 144 / `reckHkuJfs1F6eTAN` / outputs 849–854; Grand Central CI 143 / `recHAECHLOYQHE3Yc`. If rematch finds zero masters, leave the ticket as `data_repair` — do not re-burn the heal budget.

## Watch: YouTube Manual Action Required, live Short, cover quota

Studio **Manual Action Required** on a YouTube Short that already has `YouTube_Video_ID` and quota (`YTS2_THUMBNAIL` / `YTS2_QUOTA` / `YTS2_POLL` + `403` / `quotaExceeded`) is **not operator work**. The Short is live. Poll or `thumbnails.set` is waiting for Pacific midnight. Kind `youtube_cover_quota`, class `transient`, actor `worker_heal`. Do not re-upload. Do not send `thumb_offset`. Do not kick YTP1.

Proven fixtures: Output **1001** / CI 227 / `EwRNnNZO0Xc` (cover, then YTS2 rewrote it to poll quota); Output **994** DUMBO / `JL2sm6Zy1YY`. Worker 0.10.396 still painted Manual Action Required because `Publish_Status=Manual Publish Required` won after the poll rewrite.

Auto-correct: Worker parks until Pacific midnight (keep YT2 / Uploaded / **Publishing** — clear manual flags), then pulses **YTS2 only**. Fingerprint `youtube_cover_quota:<output_rec>:quota`. Same fingerprint after a midnight fail → `code_bug`.

## Observe (`observe`)

Ticket only. No git, no deploy, no restart, no Airtable writes, no Make pulses, no Studio Approve.

## Infra (`infra`)

Local companion only, on the Windows machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\local-services\Invoke-DeskCompanion.ps1" -RestartDown
```

Hourly Windows keep-alive (this PC, logged-in session): register `HOURLY-Local-Services.bat` via `Register-DeskCompanionHourly.ps1`. That bat has **no** `pause`. It does **not** STOP ALL. If a public `/health` is down, it calls the stock `start-chicagoshining-local-services.bat` then VERIFY, then `Invoke-DeskCompanion.ps1 -RestartDown`. If `origin/main` moved and the checkout is **clean**, SYNC (fast-forward pull) then PLAN+DEPLOY **one** changed service (`-DeployDown`) when mode is `infra+`. Dirty checkout: log and skip deploy. Never `git reset --hard`. Log: `Deployment Logs\Local Services\hourly-companion-YYYYMMDD.log`.

## Patch (`patch`)

Branch `cursor/desk-<slug>` from `main`. Smallest fix. Run `node --test apps/studio-api/desk-inventory.test.mjs apps/studio-api/quality-checks.test.mjs` when classifiers or the catalog change. Open a PR. **Do not merge.** Comment the fingerprint and diagnosis. After Joseph merges, local companion runs the ship playbook in the runbook (SYNC, trigger bump, PLAN/DEPLOY one service).

## Automerge (`automerge`, Phase 4)

Call `deskMayAutomerge` mentally with the changed paths. Refuse unless every path is allowlisted (`apps/studio-api/worker.js`, `desk-inventory.mjs`, `quality-checks.mjs`, `services/pipeline-runner/studio_produce/`, `item4/`), CI is green, caps remain, and the fingerprint is not recurring. Default production mode must stay below `automerge` until proven.

## Never

- Auto-publish or Approve publish for `origin=autonomous` library-stills
- Treat Ready for Review autonomous work as a finding when Open review is actually available (locked RFR without a public cover is `rfr_locked_missing_deliverable`)
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

### `rfr_locked_missing_deliverable` (`transient` → Worker heal; `code_bug` past the stale window)

Rendered / Review Sent / Ready for Review labels with `creative_available=false`. Ignore the badge. Open review is the gate. Cover-required Reels/Shorts/TikTok Video need a public 3D still on `media.chicagoshining.com/publish/` or `studio/previews/` — not Drive, not a fill-crop. Stories / IG single image / FB single image are not cover findings. Sibling Stories may already Open review while the group says N/M rendered.

Proven fixture: Big John’s Skeleton Content Item 129 / outputs 391, 393, 395, 396 (Stories 392/394 were already reviewable). Parent thumb was Drive `uc?id=`; Worker `wait_thumbnail` pulsed P2 and went idle because P2 saw a non-empty Drive URL.

Auto-correct: Worker `studioHealRfrMissingDeliverable` stages the existing Drive still to the public CDN, stamps cover-required siblings, stamps blank captions from the Content Item, then resumes studio-produce if a 3D still still does not exist. Do not Approve. Do not send `thumb_offset`. Fingerprint `rfr_locked_missing_deliverable:<output_id>:cover`.

### `youtube_private_source_fail` (`transient` → Worker heal)

YouTube Approved for Publishing, no `YouTube_Video_ID`, `YouTube_Stage` is YT1 (Failed **or Ready to Publish**) or Terminal Error, Drive `Final_File_URL`, no public `Publish_Asset_URL`. Output 375 (Worth the trip Short `recRxp28DYcT9SEMW`) stuck this way: heal matched only Failed, Windows AP0 aborted a 121MB one-shot PUT (`10053`), then YTP1 saw a stale upload job id.

Auto-correct: leave to Worker `studioHealFailedYoutubeSourceDownloads` (Drive Range GET → R2 multipart `publish/` → reset YT1 → YTP1). After processing, `thumbnails.set` the 3D cover. Do **not** send `thumb_offset`. If the row is still missing a public MP4 after a later tick, that is a `code_bug`.

### `youtube_cover_quota` (`transient` → Worker heal)

Live YouTube Short (`YouTube_Video_ID` present, YT2 / Uploaded). `YTS2_THUMBNAIL` / `YTS2_QUOTA` / `YTS2_POLL` plus quota/403. Studio painted Manual Action Required because `Publish_Status=Manual Publish Required` won even after the Short was live. Operator has nothing to do.

Auto-correct: Worker `studioParkStaleYoutubeQuotaPolls` + YTS2 `cover_quota_park_fields` wait until Pacific midnight, then YTS2-only. Keep `Publish_Status=Publishing`. Clear manual flags. Do not re-upload. Fingerprint `youtube_cover_quota:<output_rec>:quota`. Proven: Output 1001 / `EwRNnNZO0Xc`; Output 994 / `JL2sm6Zy1YY`.
