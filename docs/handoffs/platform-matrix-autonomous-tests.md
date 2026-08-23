# Platform-matrix autonomous tests (start → Studio review)

Five new ideas after the rainy native carousel. Each one uses the Studio front door, stays `Test_Run_ID` blank, and **stops at Ready for Review**. Do not Approve for publishing unless Joseph says so. Do not reuse CI 89 / outputs 224–226. Do not Approve 225 or 226.

Rainy Chicago (output 224) is a **partial pass**: silent carousel posted, **failed** on Instagram caption and AI grid cover. See `repair/evidence/rc-native-auto-20260823/idea-recjG3bl1EAtImPV5.md` (RC-NATIVE-D4, RC-NATIVE-D5).

## Scenarios

| ID | Photos | Audio | Plan | Why |
| --- | --- | --- | --- | --- |
| `mx1-single-native` | 1 | No | IG Single Image, FB Single Image, TT Single Photo | Single-entry stills path. Expect native route, **AI grid cover**, captions. |
| `mx2-single-reel` | 1 | VO + music | IG Reel, FB Reel, TT Video Draft, YT Short | Single-entry Remotion pack. Expect cinematic title card on the grid. |
| `mx3-multi-slideshow` | 3 | VO + music | IG Reel, FB Slideshow Reel, TT Video Draft, YT Slideshow Video | Multi-entry Remotion / slideshow family. |
| `mx4-stories-plus-feed` | 1 | No | Native singles + IG Story + FB Story | Stories-plus-feed package. Grid cover applies to feed only. |
| `mx5-youtube-standard` | 1 | VO + music | YT Standard Video 16:9 + IG Reel | Standard 16:9 vs Short/Reel. |

Hard pass for any grid-eligible post: designed AI cover (bold lettering, not a raw crop) and a real caption.

## How they are seeded

GitHub Action **E2E Studio Scenario Seed**, one scenario per dispatch. Promote only. Cron / promote `waitUntil` must carry them to review.

## Isolation

- New idea per scenario
- `Test_Run_ID` blank
- Cadence stays parked
- No Make `scenarios_run`
- No Studio Approve
