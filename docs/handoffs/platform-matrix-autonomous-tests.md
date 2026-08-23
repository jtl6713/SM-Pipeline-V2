# Platform-matrix autonomous tests (start → Studio review)

Five new ideas after the rainy native carousel. Each one uses the Studio front door, stays `Test_Run_ID` blank, and **stops at Ready for Review**. Do not Approve for publishing unless Joseph says so. Do not reuse CI 89 / outputs 224–226. Do not Approve 225 or 226.

Rainy Chicago (output 224) is a **partial pass**: silent carousel posted, **failed** on Instagram caption and AI grid cover. See `repair/evidence/rc-native-auto-20260823/idea-recjG3bl1EAtImPV5.md` (RC-NATIVE-D4, RC-NATIVE-D5).

## Scenarios

| ID | Photos | Audio | Plan | Why | State |
| --- | --- | --- | --- | --- | --- |
| `mx1-single-native` | 1 | No | IG Single Image, FB Single Image | Single-entry stills. | Promoted. Idea [reczkSJ2g80quhV7d](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/reczkSJ2g80quhV7d), CI [recVuJa9wpe8euyjk](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recVuJa9wpe8euyjk) **90**. Parent `Thumbnail_URL` is the Drive AI cover (`1zWoc4kPbmRk05qf2VNdLJDIn47TP55c4`) — colorful 3D **MILLENNIUM PARK** lettering, not a crop. Outputs [227](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec6Wk2Sel4frhWSm) / [228](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recjFiIQx7MKc5TQi) Ready for Review. Do not Approve. |
| `mx2-single-reel` | 1 | VO + music | IG Reel, FB Reel, TT Video Draft, YT Short | Single-entry Remotion pack. Expect cinematic title card on the grid. | Promoted. Idea [recf7poFSSynwl8F8](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/recf7poFSSynwl8F8), CI [reck6jN0dl0LtgdmD](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/reck6jN0dl0LtgdmD) **91**. Outputs 229–232 In Production. Waiting on P2 voice + 3D cover + Remotion. Do not Approve. |
| `mx3-multi-slideshow` | 3 | VO + music | IG Reel, FB Slideshow Reel, TT Draft, YT Slideshow Video | Multi-entry Remotion / slideshow family. | Idea [rec6I1zYaV630r2kX](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/rec6I1zYaV630r2kX), PR [reczwlpepIfPbQx5a](https://airtable.com/appe33zkZn35yirTL/tbl75nxNi6PMUjBQE/reczwlpepIfPbQx5a) still Draft. `chicago-pritzker.jpg` master [recrL5Qzroy0n4xFM](https://airtable.com/appe33zkZn35yirTL/tblBZLXPd1p2NRWRK/recrL5Qzroy0n4xFM) is Drive Ready after Worker 0.10.101. Seed [32651810345](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32651810345) is still on variants/Promote. |
| `mx4-stories-plus-feed` | 1 | No | Native singles + IG Story + FB Story | Stories-plus-feed package. Grid cover applies to feed only. | Not seeded |
| `mx5-youtube-standard` | 1 | VO + music | YT Standard Video 16:9 + IG Reel | Standard 16:9 vs Short/Reel. | Idea leftover from a bad photo URL; seeder resumes same title with proven Wikimedia URLs. |

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

### RC-NATIVE-D5 — No on-image caption on native stills

- **Seen:** Rainy IG carousel 224 had Airtable caption/hashtags but no lettering on the photos.
- **Why:** Overlay metadata is Remotion-only; Graph posts the stills as-is.
- **Status:** Open. Grid cover is the designed title card; on-image slide captions remain a follow-up.
