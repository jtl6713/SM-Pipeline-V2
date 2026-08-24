# Platform-matrix autonomous tests (start → Studio review)

Five new ideas after the rainy native carousel. Each one uses the Studio front door, stays `Test_Run_ID` blank, and **stops at Ready for Review**. Do not Approve for publishing unless Joseph says so. Do not reuse CI 89 / outputs 224–226. Do not Approve 225 or 226.

Rainy Chicago (output 224) is a **partial pass**: silent carousel posted, **failed** on Instagram caption and AI grid cover. See `repair/evidence/rc-native-auto-20260823/idea-recjG3bl1EAtImPV5.md` (RC-NATIVE-D4, RC-NATIVE-D5).

## Scenarios

| ID | Photos | Audio | Plan | Why | State |
| --- | --- | --- | --- | --- | --- |
| `mx1-single-native` | 1 | No | IG Single Image, FB Single Image | Single-entry stills. | Promoted. Idea [reczkSJ2g80quhV7d](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/reczkSJ2g80quhV7d), CI [recVuJa9wpe8euyjk](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recVuJa9wpe8euyjk) **90**. Parent `Thumbnail_URL` is the Drive AI cover (`1zWoc4kPbmRk05qf2VNdLJDIn47TP55c4`). [227](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec6Wk2Sel4frhWSm) and [228](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recjFiIQx7MKc5TQi) Ready for Review **with that 3D cover** after Worker 0.10.107 stamped 228. Do not Approve. |
| `mx2-single-reel` | 1 | VO + music | IG Reel, FB Reel, TT Video Draft, YT Short | Single-entry Remotion pack. Expect cinematic title card on the grid. | Promoted. Idea [recf7poFSSynwl8F8](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/recf7poFSSynwl8F8), CI [reck6jN0dl0LtgdmD](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/reck6jN0dl0LtgdmD) **91**. Parent AI thumb `12_7X8uQxJrDXX4Pb-1_1YDm6RR885fKa`. [229](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec20ZHu3xXu6bl87)/[230](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recqjS45SzVobfPPL)/[231](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recNMNISkXwchC15F)/[232](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recWFHJm5Z7TBjXtn) Ready for Review with Remotion files **and that parent 3D cover + caption** after Worker 0.10.115. Do not Approve. |
| `mx3-multi-slideshow` | 3 | VO + music | IG Reel, FB Slideshow Reel, TT Draft, YT Slideshow Video | Multi-entry Remotion / slideshow family. | Promoted. Idea [rec6I1zYaV630r2kX](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/rec6I1zYaV630r2kX), PR [reczwlpepIfPbQx5a](https://airtable.com/appe33zkZn35yirTL/tbl75nxNi6PMUjBQE/reczwlpepIfPbQx5a), CI [recZO8LY2LupzwE8H](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recZO8LY2LupzwE8H) **92**. 3D yes (`1l2xxGUbNmxKsv3CARUXg4cdm8AW-BDA-`). [233](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recom6qWH1Bsw2f7B)/[234](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recFpK9N2cQp61hVv)/[235](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recYZhVTQT71QZ0hE)/[236](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec1MrUJofb5qCzUh) Ready for Review with Remotion files. Do not Approve. |
| `mx4-stories-plus-feed` | 1 | No | Native singles + IG Story + FB Story | Stories-plus-feed package. Grid cover applies to feed only. | Promoted via seed [32657083959](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32657083959). Idea [recJuVojhSeknSNRg](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/recJuVojhSeknSNRg), PR [recX1CCNQBsx2lSGx](https://airtable.com/appe33zkZn35yirTL/tbl75nxNi6PMUjBQE/recX1CCNQBsx2lSGx), CI [recod7gHzPCsl9WLj](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recod7gHzPCsl9WLj) **93** Thumbnail Ready with silent P2 3D (`1eSileisg8q-kknwY2MdUuVjugUikj5on`). [237](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recKsDGIHq9JZzUHp)/[238](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recEUa8xFBxJnUjRi)/[239](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec5CETn4hJOW8sQW) Ready for Review with that 3D cover. Stories 240/241 no thumbs OK. Do not Approve. |
| `mx5-youtube-standard` | 1 | VO + music | YT Standard Video 16:9 + IG Reel | Standard 16:9 vs Short/Reel. | Promoted via seed [32659344196](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32659344196). Idea [rec353ZxUUA7bPART](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/rec353ZxUUA7bPART), CI [recQOYqlGnS5irqbB](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recQOYqlGnS5irqbB) **94**. 3D yes (`1gDLVWELMQ19e9gcNnMbkI6VMITuHrXVj`). [242](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recUFUsOZjtFpD9ea) and [243](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recQXVDwcr5y8enF3) Ready for Review with Remotion files after Worker 0.10.114 (`job-20260823222210-c006c00c` on 243). Do not Approve. |

Hard pass for any grid-eligible post: designed AI cover (bold colorful 3D lettering, not a raw crop) and a real caption.

## Defects found while seeding

### RC-MX-D1 — TikTok Single Photo is rewritten to Video Draft

- **Seen:** MX1 plan override `TikTok: Single Photo` came back as `Video Draft` ([run 32644903795](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32644903795)).
- **Why:** `ezCanonicalOutputType` / `item4CanonicalOutputType` mapped `TikTok` + `Single Photo` → `Video Draft`.
- **Fix:** Rewrite removed in Worker + `ez-plan.js`. Live after Worker 0.10.100 + Pages 0.6.125.

### RC-NATIVE-D4 — Silent packages never get an AI grid cover

- **Seen:** CI 89 / CI 90 `Include_Thumbnail=Yes`, `Thumbnail_Status=Ready`, **blank `Thumbnail_URL`**. Output thumbs were `ITEM4-VARIANT-fill-crop`.
- **Why:** P2 v2.2 only generates thumbnails on the voiceover branch (`Content_Status=Ready for Voiceover` and a Drive voice file). Silent items arm as `Thumbnail Ready` / `Voiceover_Status=Not Needed`, so P2 does paid nothing. Continuation also treated native Ready-for-Review as done and never re-pulsed P2.
- **Fix:** P2 v2.3 silent-thumbnail route; Worker `wait_thumbnail` + stamp AI cover onto outputs; native Single Image / Single Photo use the designed still as the grid tile. After a mapper PATCH, P2 can look `isinvalid` until `/start` relinks it. Do not keep PATCHing P2 while it is live.
- **OpenAI `n`:** Designer/`GET` stores `"1"` as a string; OpenAI now 400s (`expected an integer`). JSON integer `1` invalidates the blueprint. Proven live fix: mapper `n` = `{{parseNumber("1")}}`, one PATCH, then `POST /scenarios/5530955/start`. After start on 2026-08-23, P2 was `isinvalid=false`, `isActive=true`, `islinked=true`, five queued runs succeeded, and CI 90 got the 3D cover. Script: `repair/scripts/fix-p2-generateimage-n.py`.

### RC-MX-D2 — Third master stays R2 staging while cadence is parked

- **Seen:** MX3 `chicago-pritzker.jpg` remained `Pending` in the master queue after SMV1 drained the first two photos ([run 32650698964](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32650698964)).
- **Why:** SMV1 is `maxRecords=1`. Upload waitUntil drained two rows. GET `/api/production-requests/:id/assets` only reconciled Drive checkpoints and never pulsed SMV1 for the leftover Pending row. Parked cadence meant no cron drain.
- **Fix:** Worker 0.10.101 resumes pending master authority from that assets GET, matching the Item 4 workspace poller.

### RC-MX-D3 — Variant GET poll does not resume SMV1

- **Seen:** MX3 seed [32651810345](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32651810345) timed out with `ready_count=4` / `target_count=6`. `chicago-wrigley` 9:16 and `chicago-skyline-day` 16:9 stayed `Pending` after cron ticks.
- **Why:** GET `/variants` only reconciled. POST `/variants` waitUntil and cron media drain are the only SMV1 pulses; parked cron often spends the subrequest budget before that drain. Seed polling therefore watches a queue that is not moving.
- **Fix:** Worker 0.10.102 `waitUntil`s `item4ResumePendingVariants` from GET `/variants` when status is Preparing. Seed variant wait is 900s; job timeout 35m. Continuation also stamps the parent AI cover onto Ready-for-Review outputs even when `Asset_Selection_Status=Partial Match` (MX1 FB 228).

### RC-MX-D4 — Continuation scanned oldest 40 outputs, so new matrix rows never got P2/Remotion

- **Seen:** MX2 stayed Ready for Voiceover with empty VO/thumb; MX3 never started Remotion; MX1 FB 228 never received the parent 3D stamp; MX4 silent P2 never ran — while cron was healthy.
- **Why:** `listStudioContinuationCandidates` used Airtable's default order with `limit=40`, so leftover older In-Production rows consumed the window.
- **Fix:** Worker 0.10.104 sorts `Output_ID` desc so the newest matrix rows are inspected first, then P2 is pulsed for `wait_voiceover` / `wait_thumbnail`. Worker 0.10.105 re-arms Idea Approved parents (MX4) to Thumbnail Ready / Ready for Voiceover before that pulse so P2’s filter can see them. Worker 0.10.106 runs continuation **first** on cron (then publish reconcile; parked cadence without `force`), and pulses P2 **before** R2–RR1 Make jobs.

### RC-MX-D6 — Parked cadence force-sync starved continuation

- **Seen:** After 0.10.104/105, FB 228 still had no AI cover, MX2 stayed Ready for Voiceover with empty VO/thumb, MX4 stayed Idea Approved. P2 itself was valid+active (`isinvalid=false`, `islinked=true`). Admin bridge stayed off.
- **Why:** `scheduled()` ran publish reconcile + `syncProductionCadence({ force: true })` in parallel with continuation. Parked `force` still pulsed publish/media/carousel/admin-bridge every two minutes and exhausted the isolate subrequest budget, so stamps/P2 never landed.
- **Fix:** 0.10.106 sequential cron: continuation → publish reconcile → parked cadence **without** `force`. Do not Make-control. Do not Approve.

### RC-MX-D7 — Continuation inspect still starved P2 and the 228 stamp

- **Seen:** After 0.10.106 was live for many `*/2` ticks, FB [228](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recjFiIQx7MKc5TQi) still had no AI cover, MX2 still had empty VO/thumb, MX4 stayed Idea Approved. Cron logs showed `Studio continuation` inspecting Remotion rows first, then `P2` / `C2` failing with `Too many subrequests by single Worker invocation`. 228 was `skip` / `no_context` because `studioContinuationLoadContext` could not Airtable-GET after the budget was gone.
- **Why:** Newest-first inspect still ran `item4EnsureAiSourceMasters` / variant reconcile / Remotion stamp on MX5/MX3 before the cheap cover stamp and P2 webhook.
- **Fix:** Worker 0.10.107 runs a cheap media gate (parent fetch + native cover stamp + wait_thumbnail/wait_voiceover) and pulses P2 first. Remotion inspect, R2–RR1, and C1/C2 wait until that tick did not need P2. Do not webhook-run P2 from the agent. Do not Approve.

### RC-MX-D5 — Remotion outputs seeded Ready for Review when the source package is not Ready

- **Seen:** MX5 IG Reel 243 went Ready for Review immediately with no Final file, no Remotion job, no cover stamp.
- **Why:** Seed fallback treated “not native and not remotion-ready” as Ready for Review.
- **Fix:** Worker 0.10.104 keeps non-native routes In Production until a real package exists. Do not Airtable-patch 243. 243 now has the parent 3D cover stamped; still no Remotion file. Do not Approve.

### RC-NATIVE-D5 — No on-image caption on native stills

- **Seen:** Rainy IG carousel 224 had Airtable caption/hashtags but no lettering on the photos.
- **Why:** Overlay metadata is Remotion-only; Graph posts the stills as-is.
- **Status:** Open. Grid cover is the designed title card; on-image slide captions remain a follow-up.

### RC-MX-D8 — Remotion never starts because R3 Format list missed Reel/Short

- **Seen:** After Worker 0.10.108, MX2/MX3/MX5 stayed In Production with `ChicagoShiningPhotoSequence` stamped. Cron logs showed `prep_render` / `already_stamped`, then R2–R5 `skipped: no_work`, then `Too many subrequests` on context loads. Leftover wait_thumbnail also skipped jobs via `p2_budget`.
- **Why:** R3 work formula only matched Format `Vertical Short Video` / `Longform Video` / `Feed Post` / `Story`. Matrix rows use Reel, Slideshow Reel, Video Draft, Short, Standard Video. R2 skips photo-sequence routes on purpose. Inspecting 19 outputs burned the isolate before a pulse.
- **Fix:** Worker 0.10.109 expands the R3 Format list, pulses R3/R4 even after P2, caps Remotion inspect at 4 rows, and ignores leftover outputs below 227. Worker 0.10.110 pulses R3 before R2 (R2 was burning the isolate), stops after the first render pulse, and promotes native feed stills to Ready for Review even when the 3D cover is already stamped. Do not webhook-run P2/R2. Do not Approve.

### RC-MX-D9 — R3 story leftovers steal the tick before R4 can start Remotion

- **Seen:** After 0.10.110/0.10.111, MX2 229–232 and MX3 233–236 already had complete render packages (`Ready for Render`, composition, filename, clip JSON, 900 frames) but `Remotion_Job_ID` stayed blank. MX4 story 240 still had a stamped composition with blank `Render_Status`.
- **Why:** Continuation pulsed R3 first and stopped after that pulse. R3 still matches Story rows with blank `Render_Status`, so MX4 stories consumed the isolate before R4 (which is what actually starts Remotion). Media-gate inspect before the pulse also burned subrequests.
- **Fix:** Worker 0.10.112 pulses continuation jobs first (skip inspect when R3/R4 ran) and orders R4 ahead of R3. Do not webhook-run P2/R3/R4. Do not Approve.

### RC-MX-D10 — R4 starts jobs but R5 never polls while any Ready-for-Render row remains

- **Seen:** After 0.10.112 (~4:42 PM CT, deploy [32668338712](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32668338712)), cron started Remotion one-per-tick: MX2 229/231, MX3 234/236, MX5 242, and leftover MX4 story **241**. R5 `5565333` is on-demand-only. Continuation `break`s after the first R3/R4 pulse, so R5 never runs while Ready-for-Render rows remain. MX5 243 stays Ready for Review with no Remotion file because inspect is skipped on those ticks.
- **Why:** Jobs-first + stop-after-first-render starves the poller. R4 Make search has no Format filter, so MX4 stories can still take a slot. 243 was seeded Ready for Review without a package (RC-MX-D5).
- **Fix:** Worker 0.10.113 pulses R5 before R4, excludes Story from Worker R3/R4 formulas, and still inspects up to two Ready-for-Review Remotion rows that have no `Final_File_URL`. Do not webhook-run R4/R5. Do not Approve.

### RC-MX-D11 — MX5 IG Reel 243 stays Ready for Review with no Remotion file

- **Seen:** After 0.10.113, MX2 229–232, MX3 233–236, and MX5 YT 242 all had Remotion files + Ready for Review. MX4 stories 240/241 also attached files (not a matrix blocker). MX5 IG Reel [243](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recQXVDwcr5y8enF3) stayed Ready for Review with parent 3D cover, `Partial Match`, no `Remotion_Job_ID`, no `Final_File_URL`.
- **Why:** 243 is an Instagram Reel (9:16). Source-package inspect required that exact ratio crop. MX5 only had the 16:9 fill-crop used by YT 242, so inspect returned `wait_variants` forever. A stamped AI cover / preview also counted as a reviewable deliverable, so the Reel looked “done” without an MP4.
- **Fix:** Worker 0.10.114 falls back to another prepared public crop for Remotion (not native stills), stamps `Render_Status=Ready for Render` when the source package is Ready, and treats video routes as reviewable only when `Final_File_URL` exists. Deployed [32670185101](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32670185101) (`785b382`). Cron then stamped 243 In Production / Ready for Render, R4 started `job-20260823222210-c006c00c`, R5 attached the Drive MP4, status Ready for Review. Do not webhook-run R5. Do not Approve. Do not Airtable-patch 243.

### RC-MX-D12 — MX2 Ready-for-Review videos never received the parent AI grid cover

- **Seen:** After 0.10.114, MX1–MX5 were Ready for Review with Remotion files. Parent CI 91 has the designed Drive AI thumb (`12_7X8uQxJrDXX4Pb-1_1YDm6RR885fKa`). Outputs [229](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec20ZHu3xXu6bl87)–[232](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recWFHJm5Z7TBjXtn) had **blank `Thumbnail_URL` and `Output_Caption`**. Grid tiles would show a Remotion crop, not the 3D title card.
- **Why:** Cover stamp ran only for native stills in the newest-8 continuation window, and was skipped entirely on ticks that pulsed R3/R4. MX2 videos sat Ready for Review with files, so they were neither stranded-Remotion inspect nor in the newest eight (243–236).
- **Fix:** Worker 0.10.115 stamps the parent AI cover (and blank caption) onto Ready-for-Review **video** outputs, merges missing-cover rows into the continuation candidate list, and still runs that media gate when R3/R4 pulsed. Deployed [32671038280](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32671038280) then [32671272141](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32671272141) (`c5854d7`) so missing-cover rows are processed before the newest-12 cap. Cron copied `12_7X8uQxJrDXX4Pb-1_1YDm6RR885fKa` + caption onto 229–232. Do not Airtable-patch stage fields. Do not Approve.

### RC-MX-D13 — VO=Yes Remotion files mixed music-only (Python R4)

- **Seen:** MX2 229–232 and MX5 242 had parent `Voiceover_URL` / Studio VO=On, but the MP4 was music-only.
- **Why:** Python R4 routed `p020_manifest` and `no_voiceover` from the **output** `Voiceover_URL` only. R3 did not copy parent VO. A missing content-item row crashed the voiceover route. Remotion then `Math.max`’d requested 30s over a ~10s VO.
- **Fix:** Worker 0.10.116 + Python R3/R4: parent or output `Voiceover_URL` is mixed into every VO route, including p020. Duration defaults to VO+tail (or 5s for a single silent still). Pipeline Ready-for-Review native stills beat leftover retry/error flags. Live runner files copied to `Services/pipeline-runner/service`. Do not Make-run R4. Do not Approve.

### RC-NATIVE-D5 — Graph IG caption + on-image lettering (partial)

- **Owned now:** Python `POST /stages/letter` burns a lower-third onto native still JPEGs, rewrites clip JSON / `Clip_*_URL` / `Studio_Preview_URL`, and Worker 0.10.117 pulses that stage then refreshes Carousel Slide CDN URLs. AI grid covers are skipped. Overlay text is clip overlay/caption, or the title when that caption is longer than 90 characters.
- **Paused:** Live IG carousel Graph publish is still Make APCAR (`5791537`). Map Graph `caption`/`hashtags` from Airtable `Output_Caption` / `Output_Hashtags`, and post the current lettered slide/CDN URLs. No Make APCAR PATCH from the agent. No Approve until that mapping is in.
