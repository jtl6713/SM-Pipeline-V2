# Platform-matrix autonomous tests (start → Studio review)

Five new ideas after the rainy native carousel. Each one uses the Studio front door, stays `Test_Run_ID` blank, and **stops at Ready for Review**. Do not Approve for publishing unless Joseph says so. Do not reuse CI 89 / outputs 224–226. Do not Approve 225 or 226.

Rainy Chicago (output 224) is a **partial pass**: silent carousel posted, **failed** on Instagram caption and AI grid cover. See `repair/evidence/rc-native-auto-20260823/idea-recjG3bl1EAtImPV5.md` (RC-NATIVE-D4, RC-NATIVE-D5).

## Scenarios

| ID | Photos | Audio | Plan | Why | State |
| --- | --- | --- | --- | --- | --- |
| `mx1-single-native` | 1 | No | IG Single Image, FB Single Image | Single-entry stills. | Promoted. Idea [reczkSJ2g80quhV7d](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/reczkSJ2g80quhV7d), CI [recVuJa9wpe8euyjk](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recVuJa9wpe8euyjk) **90**. Outputs [227](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec6Wk2Sel4frhWSm) / [228](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recjFiIQx7MKc5TQi) Ready for Review, **no AI cover yet**. |
| `mx2-single-reel` | 1 | VO + music | IG Reel, FB Reel, TT Video Draft, YT Short | Single-entry Remotion pack. Expect cinematic title card on the grid. | Not seeded |
| `mx3-multi-slideshow` | 3 | VO + music | IG Reel, FB Slideshow Reel, TT Draft, YT Slideshow Video | Multi-entry Remotion / slideshow family. | Not seeded |
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
- **Fix:** P2 v2.3 silent-thumbnail route; Worker `wait_thumbnail` + stamp AI cover onto outputs; native Single Image / Single Photo use the designed still as the grid tile.

### RC-NATIVE-D5 — No on-image caption on native stills

- **Seen:** Rainy IG carousel 224 had Airtable caption/hashtags but no lettering on the photos.
- **Why:** Overlay metadata is Remotion-only; Graph posts the stills as-is.
- **Status:** Open. Grid cover is the designed title card; on-image slide captions remain a follow-up.
