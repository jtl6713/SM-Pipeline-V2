# Test idea: Rainy Chicago — native multi-image test

- Idea: [recjG3bl1EAtImPV5](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/recjG3bl1EAtImPV5) (Candidate 231)
- Production request: [recrKvSPxho8tmv2e](https://airtable.com/appe33zkZn35yirTL/tbl75nxNi6PMUjBQE/recrKvSPxho8tmv2e) `PR-20260823052856-XPDIZD` — **Promoted**
- Content item: [recP0MP9H5TD93Znt](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recP0MP9H5TD93Znt) — Content 89 *Rainy Chicago — native multi-image test*
- Promote: [GH 32640301231](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32640301231) at 2026-08-23 07:46 CT
- Plan: Instagram Carousel, Facebook Multi-Image Post, TikTok Multi-Photo
- Voiceover No, music No, 3 stills, Manual Upload, Test_Run_ID blank
- **Hard stop: Studio publishing Approve. Not clicked.**

## Gates

| Gate | Result | Notes |
| --- | --- | --- |
| TC0 control plane | Pass | Cadence parked; P2/P3 webhooks valid |
| TC1 seed + Promote | Pass with defects | Front-door Studio API / GH service binding. Promote created CI 89 + 3 outputs |
| TC2 native handoff | Pass | All three outputs `Render_Status=Native Photo Route`, `Output_Status=Ready for Review` |
| TC3 Remotion exclusion | Pass | `Remotion_Job_ID` blank on 224/225/226 |
| TC4 variants / CDN | Pass | 6/6 platform variants Ready before Promote; no SMV1 pulse |
| TC5 RR1 | Pass | `Review_Status=Review Sent` on all three without an agent Make pulse |
| TC6 reviewable | Pass | Package is in Studio review. `Auto_Publish_Enabled` and `Do_Not_Publish` unset. `Publish_Status` blank |
| TC7 publishing Approve | Hard stop | Not executed |

## Outputs

| Output | Platform | Type | Ratio | Render | Output status | Review | Remotion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 224 [recALRkjWgVg066OA](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recALRkjWgVg066OA) | Instagram | Instagram Carousel | 4:5 | Native Photo Route | Ready for Review | Review Sent | blank |
| 225 [recfYJeddVzoW95ae](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/recfYJeddVzoW95ae) | Facebook | Facebook Photo Set | 4:5 | Native Photo Route | Ready for Review | Review Sent | blank |
| 226 [reccPoNLSxUxg5zmP](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/reccPoNLSxUxg5zmP) | TikTok | TikTok Slideshow | 9:16 | Native Photo Route | Ready for Review | Review Sent | blank |

## Defects

### RC-NATIVE-D1 — Promote rejects `Thumbnail_Mode=Use photo frame`

- **Seen:** GH seed [32621689061](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32621689061) `promote failed HTTP 400: Thumbnail must be Use Profile Default, Yes, or No`
- **Why:** Studio UI and Production Request allow `Use photo frame`. Promote sanitizer only allows the I3 tri-state.
- **Correction (this run):** PATCH `thumbnail_mode=Yes` then Promote.
- **Product fix (source, not live Worker):** `promotionThumbnailTriState` maps `Use photo frame` → `Yes`.

### RC-NATIVE-D2 — Partial Production Request PATCH wipes type and platforms

- **Seen:** GH seed [32639223175](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32639223175) `Choose a Master content type. Choose at least one Target platform.`
- **Why:** Live `PATCH /api/production-requests/:id` with only `thumbnail_mode` writes `Master_Content_Type=null` and `Target_Platforms=[]`.
- **Correction (this run):** PATCH the full native photo contract, then Promote. GH [32640301231](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32640301231) succeeded.
- **Product fix (source, not live Worker):** `updateProductionRequest` merges the existing record before sanitize.

### RC-NATIVE-D3 — TikTok native stills labeled TikTok Slideshow

- **Seen:** Output 226 `Platform_Output_Type=TikTok Slideshow` with `Render_Status=Native Photo Route`.
- **Why:** Proven mapping still uses the Slideshow content type name even on the native photo family.
- **Impact:** Route is native (no Remotion). Label is misleading. Not a publish Approve.

### Seed infrastructure (already corrected)

- Cloudflare 1010 on workers.dev from Python urllib → seed calls the bridge with curl
- GET `/item4` Worker 1101 while SMV1 drains → poll lighter routes; resume existing idea/PR
- Cloudflare 1042 / Airtable 429 during seed → retries
- Masters stuck Uploading because GET status seized SMV1 → reconcile Drive-uploaded masters without seizing SMV1
- Variant poll treated master Ready as variant Ready → poll GET `/variants` and require `status === "Ready"`

## Isolation

- CI82 not reused
- `Test_Run_ID` blank on idea, PR, content item, and outputs
- Cadence still parked
- Publishing Approve not clicked
