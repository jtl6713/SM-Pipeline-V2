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

## Watch: Stamp 422, Selected_Assets_JSON too long

Parent `Studio_Production_Job_JSON.step=blocked` (or escalated) and the error is an Airtable **422** on Platform Outputs `tblrlPeboBthkplH0`. With the response body: `INVALID_VALUE_FOR_COLUMN` / `Field "Selected_Assets_JSON" cannot accept the provided value`. Without the body (older runner): `422 Client Error: Unprocessable Entity for url: .../tblrlPeboBthkplH0/<output_rec>`. Kind `produce_stamp_422`, class `code_bug`, actor `desk_agent`. Fingerprint `produce_stamp_422:<production_request_rec>:selected_assets_json` (or `:airtable_422` when the body does not name the field).

Fast Vibe Cut energy 4 uses ~0.56s cuts. A 30s target becomes ~53 trims. Stamp stores those clips on `selected_clips` and again as `render_prep.render_clip_list_json` inside the same long text. Airtable long text stops at 100,000 characters (proven 156,605). Worker resume restamps that payload and 422s again. Do not burn the heal budget.

`fit_selected_assets_json` in `services/pipeline-runner/studio_produce/stamp.py` drops the nested clip-list copy (and, if still over, per-clip render notes) so the field fits, while `Render_Clip_List_JSON` keeps the full list. After that runner is live, one studio-produce resume can continue. Do not Approve. Proven: Content 484 / `recV8a1Yo7KeqPdcb` / YouTube Short `recuqRqQQmMZUfNGp` Output 2448 / job `spj-aa1f7845d3ca`. Same fingerprint after that resume → the slim was not enough.

## Watch: Deleted library music (Drive 404)

Remotion `/render failed (500): Download failed 404 Drive <id>` or T1 `404 Client Error: Not Found` on `drive/v3/files/<id>?alt=media` means the **library MP3 is gone from Drive**, not a share/ACL glitch. Kind `drive_music_404`, class `data_repair`, actor `desk_agent`, fingerprint `drive_music_404:<pr_or_output_rec>:<drive_file_id>`. Worker resume / Failed-render requeue cannot restore the file; they only burn the heal budget.

Auto-correct:

1. Ticket that fingerprint. Confirm Drive `get_file_metadata` + public `drive.usercontent.google.com/download?id=` are 404.
2. Search Media Assets / Drive folder `GDRIVE_MUSIC_FOLDER` (`1mzNHcVmeXb6I2WybJD5iOTrJUDRQJIN3`) for a live copy of the same track. Do not put music on R2.
3. Retarget the catalog Media Asset `Google Drive File ID` + `Google Drive URL`, the Content Item music file id + Music URL, and sibling Platform Output `Music_URL`s onto the live file.
4. Reset produce `heal.resume_count` to 0, clear `job.error`, resume studio-produce. Do not Approve publish.
5. If no live copy exists, leave the ticket as `data_repair`. Same fingerprint after a successful retarget + resume → `code_bug`.

Proven: Content 298 Huntington Beach / `recrbAqjeyGcERgdf` / CKay Love Nwantiti Remix `11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t` → `love_nwantiti.mp3` `1hADVgqH1x5TyPUPea5jruEIVUe45__ew`.

## Watch: 9:16 fill-crop looks like two photos stacked

Instagram/Facebook Reels (or any 9:16 photo-sequence) that show **two mismatched vertical halves with a horizontal seam** are a bad HEIC crop, not a Remotion letterbox. iPhone HEIC stills are a tile grid (many 512px HEVC tiles). Sending raw HEIC to Cloudflare Images, or `ffmpeg -map 0:v:0`, uses one/two tiles instead of the assembled 4032×3024 photo. Kind `variant_heic_sprite`, class `code_bug`. Fix: `ffmpeg_heic_still` in `integrations/variant_service.py` (default decode, **no** `-map`, `-frames:v 1 -update 1`) before the variant Worker. Recrop 9:16 rows (clear Drive authority so Item 4 does not reuse the stacked JPEG), restamp clip lists, requeue Ready for Render. Worker heal cannot fix pixels already in Drive. Proven: Lincoln Park Zoo `reccEj6eVXPPKalJd` IG Reel 370 / crop `1h1e7mcXSxPJGvgImBp1c_Y7iRjUyljtr`.

## Watch: Render_Status=Rendering with Final_File_URL already present

Platform Output has a finished MP4 (`Final_File_URL` set, often preview/thumb/caption too) but `Render_Status=Rendering` and `Output_Status=In Production` (often `Review_Status=Review Sent`, `Remotion_Job_ID` blank). Siblings on the same Content Item may already be Rendered/Approved. Pipeline Approve (1) can light from Review Sent + file while Worker `studioOutputReadyForPublishApproval` correctly 409s on In Production/Rendering. Kind `render_stale_rendering`, class `transient`, actor `worker_heal`, fingerprint `render_stale_rendering:<output_rec>:final_file_present`.

`longRendering` heal requires a Remotion job and blank `Final_File_URL`, so it never touches this. Auto-correct: Worker `healStuckStudioRenders` (`R5_STALE_RENDERING_FINALIZED`) sets `Render_Status=Rendered`, `Output_Status=Ready for Review`, keeps/sets `Review_Status=Review Sent`. UI `creativeCanApproveForPublishing` must reject In Production / Rendering / Ready for Render so Approve (N) does not false-light. Do not Approve until Ready for Review. Proven: Output **1807** / Content 374 South Beach Getting Around YouTube Short / `rec0mwr0QiudNSQrn` (siblings 1804–1806 / 1808–1809 already Rendered). Same fingerprint after a heal tick → `code_bug`.

## Watch: Ready for Render, no Remotion job, voiceover never generated

Job JSON says `Rendering 0/N` (~62%), heal `resume_count` climbs to `max_resumes`, and the output stays `Render_Status=Ready for Render` with blank `Remotion_Job_ID` while no Remotion job ever appears. Check the parent Content Item: `Studio_Effective_Voiceover_Mode=Yes` (or `Include_Voiceover=Yes`) but `Voiceover_URL` blank, `Voiceover_Status=Ready` (false ready), `Content_Status=Thumbnail Ready`. R4 returns `waiting_for_voiceover` on every pulse; pulsing R4 again is useless. Cause: cover staging overwrote `Content_Status` from `Ready for Voiceover` (the P2 selector) to `Thumbnail Ready` before P2 ran, then produce resumed at stamp → render and never revisited `audio`. Kind `render_ready_waiting_voiceover`, class `transient`, actor `worker_heal`, fingerprint `render_ready_waiting_voiceover:<output_rec>:no_voiceover_url`. Proven fixture: Output 432 / Content Item 137 / `PR-20260912174432-7YWV8G`.

Auto-correct: Worker `studioHealReadyNoJobVoiceover` (inside `healStuckStudioRenders`, `VO_STUCK_READY`) copies the parent `Voiceover_URL` down when it exists; otherwise sets parent `Content_Status=Ready for Voiceover`, `Voiceover_Status=Ready`, `Script_Status=Generated`, pulses P2, and resumes studio-produce (`pick_resume_step` now lands on `audio`; `step_render` runs P2 inline and treats `waiting_for_voiceover` as a wait). Cover writes (Worker `studioCoverContentStatusFields`, `thumbnail.cover_content_status_fields`) no longer clobber `Ready for Voiceover` while `Voiceover_URL` is blank. If the same fingerprint returns after a heal tick, it is a `code_bug`: attach parent field values (`Content_Status`, `Voiceover_Status`, `Voiceover_Script` present?, `Voiceover_URL`) and the P2 pulse result. Do not Approve. Skip rows whose parent `Voiceover_Status` is Not Needed / Skipped.

## Watch: Failed for more than an hour

Any Platform Output with `Publish_Status=Failed` or `Render_Status=Failed` for **≥ 60 minutes** is a finding, even when the error text is not in the old transient list. Kind `publish_failed_transient` / `render_failed`, class `transient`, actor `worker_heal`, error class `stale_failed` when the message itself is not retryable. Copyright / permission denied / invalid video / unsupported format / video too long / duplicate stay `code_bug`.

HTTP **401 / Unauthorized** on TikTok draft init (`TikTok photo draft initialization failed. HTTP 401`) used to park forever: TTD1 wrote `TikTok_Draft_Status=Manual Fallback` and `Publish_Retry_Eligible=false`, then Worker heal skipped it as non-transient. Proven fixture: Output **908** / Content Item 209 / `recuOQs6TgAXJqxRI` (Miami Vizcaya Rainy Day Plan, `TTD1_PHOTO_INIT`, last attempt 2026-09-26 08:47 UTC). Later LA video drafts **889 / 937 / 963** hit the same auth-worker body (`worker_version=v5.1-tiktok-caption-diagnostics`). The 401 is the TikTok auth Worker rejecting `X-Pipeline-Secret`, not a Graph copyright block.

Classify as `tiktok_auth_signature` / `code_bug` / actor `desk_agent` (not `publish_failed_transient`). Worker cron **must keep** the terminal Manual Fallback fence (`TIKTOK_AUTH_PARKED`) so attempts cannot storm (Output 927). Quality Agent owns recovery:

1. Ticket fingerprint `tiktok_auth_signature:<output_rec>:pipeline_secret`.
2. Confirm the city auth Worker (`auth-la` / `auth-miami` / `auth-nyc`) accepts the established pipeline secret via `PIPELINE_SECRET_SHA256` fingerprint (legacy `TIKTOK_MAKE_SHARED_SECRET` alone is not enough when Make and the Python runner diverge).
3. Ensure `LA_TIKTOK_PIPELINE_SECRET` / `MIAMI_TIKTOK_PIPELINE_SECRET` / `NYC_TIKTOK_PIPELINE_SECRET` (or shared `TIKTOK_PIPELINE_SECRET`) matches that fingerprint. Deploy the city auth Worker from `deploy/tiktok-auth-*-production.txt` when the fingerprint gate is missing.
4. After auth is aligned: rearm once — `TikTok_Draft_Status=Ready for Delivery`, clear `Manual_Fallback_Required`, `Publish_Status=Ready to Publish`, `Publish_Retry_Eligible=true`, reset `Publish_Attempt_Count` to 0, clear the 401 error fields — then pulse TTD1 / publish-kick. Do not unbounded-retry from Worker heal.
5. Same fingerprint after a successful auth deploy + one rearm → escalate to Joseph (token/OAuth issue, not signature).

Auto-correct for ordinary Graph/transient Failed publishes remains Worker `studioHealFailedStatuses`. TikTok Manual Fallback / auth-worker 401 is **not** that path.

## Watch: Instagram carousel AP3C too many attachments

Instagram Carousel stuck at `IG_Carousel_Status=Children Ready` with `IG_Carousel_Error_Stage=AP3C Parent Creation` and Graph `(#100) Unsupported post type. The post has too little or too many attachments` means the package sent more than **10** child container IDs. Instagram Graph allows **2–10** carousel children. Facebook planning already clamps `Image_Count` to 10; IG carousel stamp used to pass the full clip count through (12 on Output **1235** / Millennium Park Fewer Crowds / `recVphOmGqaxIYHSD`).

Kind `ig_carousel_too_many_children`, class `transient`, actor `worker_heal`, fingerprint `ig_carousel_too_many_children:<output_rec>:<child_count>`.

Auto-correct: Worker `studioHealIgCarouselTooManyChildren` stamps `IG_Carousel_Child_Count=Image_Count=10`, clears the AP3C error, and pulses AP3C. AP3C / AP0C / AP1C clamp to the first 10 slides by Current Order (keep cover as slide 1) before `create_parent`. Re-pulsing AP3C without the clamp storms the same #100. Same fingerprint after a successful clamp + AP3C → `code_bug`.

## Watch: Native-photo Approved for Publishing but publish never armed

Native Photo Route output with `Output_Status=Approved for Publishing` but blank `Review_Status`, blank `Publish_Status`, unchecked `Auto_Publish_Enabled`, and (for carousels) zero `Carousel Slides` / blank `IG_Carousel_Status` is **not** ready to publish. Worker `studioHealNativePhotoReviewStrands` used to PATCH only `Output_Status`, skipping `approveOutputRecordForPublishing` (Review Approved, Auto Publish, Ready to Schedule, `studioEnsureNativePublishSlides`, IG/FB/TT handoff). Sibling outputs on the same Content Item may already be fully armed.

Kind `native_photo_approve_incomplete`, class `transient`, actor `worker_heal`, fingerprint `native_photo_approve_incomplete:<output_rec>:unarmed`. Strand still at Ready for Review remains `native_photo_review_strand` — heal must call full approve, not Output_Status alone.

Auto-correct: Worker `studioCompleteNativePhotoPublishArming` / full `approveOutputRecordForPublishing`. Proven: Output **1245** Getty Center Sunset Poll IG Carousel / `reccuk3Nj4jOQX5c1` (siblings 1246–1248 armed). Same fingerprint after arming → `code_bug`.

## Watch: All-Profiles Awaiting Approval click shows empty

All-Profiles Overview shows N Awaiting Approval, but Pipeline Awaiting Approval is empty ("no outputs match the current filters"). Cause: `Output_Status` stayed **Ready for Review** after Approve while `Review_Status=Approved` and `Publish_Status` is Ready to Schedule / Ready to Publish / Scheduled. Overview used to count raw `Output_Status`; Pipeline requires `creativeCanApproveForPublishing` (rejects Approved review).

Kind `awaiting_approval_stale_rfr`, class `transient`, actor `worker_heal`, fingerprint `awaiting_approval_stale_rfr:<output_rec>:approved_publish_armed`.

Repair (per output):

1. Confirm `Review_Status=Approved` and publish is armed (`Ready to Schedule` / `Ready to Publish` / `Scheduled` / `Publishing`).
2. Set `Output_Status=Approved for Publishing`. Do **not** re-Approve and do not change schedule.
3. Overview `metrics.awaiting_approval` must use normalized `studio_state === Ready for Review` (not raw Output_Status / Review Pending).

Auto-correct: Worker `studioHealAwaitingApprovalStaleRfr`. Proven: Miami Outputs **2155** TikTok / **2154** Facebook Inside PAMM Design (CI 434), **1841** Facebook Brickell or Coconut Grove? (CI 380). Same fingerprint after heal → `code_bug`.

## Watch: Rerendering forever with the finished file already present

Factory per-output send-back sets `Review_Status=Changes Requested` and `Output_Status=In Production`. Pipeline paints **Rerendering**. Native Photo Route never enters Remotion. A Story already `Waiting in Render Queue` with a `Remotion_Job_ID` is excluded from the render queue. Nothing is rendering, and the badge never clears.

Kind `phantom_rerender`, class `transient`, actor `worker_heal`. Fingerprint `phantom_rerender:<output_rec>:native_still_present` or `:final_file_present`.

This is not the content send-back hold (`Output_Status=Changes Requested`, `Render_Status=Needs Changes`, `Do_Not_Publish`, request Draft + `[factory-revision-open]`). Do not heal that hold. Do not heal `Ready for Render`, `Rendering`, `Failed`, or `Do_Not_Publish` voice-prep rerenders. An already-`Rendered` video waits 15 minutes after `Review_Decision_At` so voice prep can still queue.

Auto-correct: Worker `studioHealPhantomRerender` (light cron) sets `Output_Status=Ready for Review`, `Review_Status=Review Sent`, `Publish_Status=Not Ready`, and `Render_Status=Rendered` unless the row is Native Photo Route. Do not clear the file, preview, schedule, or job id. Do not Approve. Proven: Output **3200** `rec5oq82z6HMKLPpU` and **3201** `rechnzbI0oceoBb8t` (Chicago native stills, Content 616) and Output **3186** `rec80kMyaX6hGbAdg` (Facebook Story, finished MP4, old job). Same fingerprint after a heal tick → `code_bug`.

## Watch: Autonomous FIFO locked on a Factory revision hold

`STUDIO_AUTONOMOUS_LAST_RUN` stays `status=skipped` (or any non-reset status) with the same `production_request_id`, and `skip_reason` is `This content is open for Factory revision` or the held request notes start with `[factory-revision-open]`. Photo-ready `origin=autonomous` drafts in other cities never resume. Variants Ready would clear a deferred stamp and the lock would return. Kind `autonomous_revision_lock`, class `transient`, actor `worker_heal`. Fingerprint `autonomous_revision_lock:<production_request_rec>:factory_revision_open`. Catalog id `autonomous_revision_lock`.

Do not clear `[factory-revision-open]`. Do not Approve. Do not publish. Light cron `studioHealAutonomousRevisionLock` runs before autonomous resume and saves `status=reset`, `skip_reason=skip_factory_revision_open`, null idea/request ids. `firstAutonomousResumeDraft` skips revision-open notes. Proven: LA Walk of Fame `rec64MuB8YqdXJ0El` / idea `recpQ0ZyzTNlWPs0m` blocked Chicago photo-ready drafts on 2026-10-14. Same fingerprint after that release → `code_bug`.

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

Hourly Windows keep-alive (this PC, logged-in session): register it with `Register-DeskCompanionHourly.ps1`. The task runs `HOURLY-Local-Services-Hidden.vbs` through `wscript.exe` (window style 0) so no console takes focus. `HOURLY-Local-Services.bat` is the manual visible runner and has **no** `pause`. It does **not** STOP ALL. If a public `/health` is down, it calls the stock `start-chicagoshining-local-services.bat` then VERIFY, then `Invoke-DeskCompanion.ps1 -RestartDown`. If `origin/main` moved and the checkout is **clean**, SYNC (fast-forward pull) then PLAN+DEPLOY **one** changed service (`-DeployDown`) when mode is `infra+`. Dirty checkout: log and skip deploy. Never `git reset --hard`. Log: `Deployment Logs\Local Services\hourly-companion-YYYYMMDD.log`.

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

## Watch: Preparing crops / clip frames need a manual Retry remaining

Production Prepare can finish the first drain budget and leave leftover Failed/Error queue rows while the parent stays `Studio_Variant_Status=Preparing` (or flips to `Error`). The browser poll window then expires and used to ask the operator to click **Retry remaining**. Kind `variant_preparing`, class `transient`, actor `worker_heal`.

Auto-correct: Worker `item4HealIncompletePreparingVariants` / `item4ResumePendingVariants` requeues Failed/Error leftovers (`item4RequeueFailedVariantsForHeal`), resets parked Error parents back to Preparing, and drains a larger SMV1 batch. Studio UI also auto-POSTs Retry remaining up to three times when the poll window expires. Same fingerprint after heal ticks while ready/target is frozen → `code_bug`.

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
