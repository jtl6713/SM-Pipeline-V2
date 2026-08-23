# Test idea: Rainy Chicago — native multi-image test

- Idea: [recjG3bl1EAtImPV5](https://airtable.com/appe33zkZn35yirTL/tblTQapddqD47GOIG/recjG3bl1EAtImPV5) (Candidate 231)
- Production request: [recrKvSPxho8tmv2e](https://airtable.com/appe33zkZn35yirTL/tbl75nxNi6PMUjBQE/recrKvSPxho8tmv2e) `PR-20260823052856-XPDIZD`
- Plan: Instagram Carousel, Facebook Multi-Image Post, TikTok Multi-Photo
- Voiceover No, music No, 3 stills, Manual Upload, Test_Run_ID blank
- Hard stop: Studio publishing Approve (not production-request Promote)

## Gates

| Gate | Result | Notes |
| --- | --- | --- |
| TC0 control plane | Pass | Cadence parked; P2/P3 webhooks valid |
| TC1 seed | Pass with defects | Idea + PR + 3 masters + native plan created via Studio API / GH service binding |
| Variants | Pass | `Studio_Variant_Status=Ready` as of 2026-08-23 07:20 CT |
| Promote | In progress | First attempt 400; workaround + retry queued |

## Defects

### RC-NATIVE-D1 — Promote rejects `Thumbnail_Mode=Use photo frame`

- **Seen:** GH seed [32621689061](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32621689061) `promote failed HTTP 400: Thumbnail must be Use Profile Default, Yes, or No`
- **Why:** Studio UI and Production Request allow `Use photo frame`. Promote sanitizer (`cleanPromotionPayload`) only allows the I3 tri-state.
- **Correction (live, this run):** PATCH the draft to `thumbnail_mode=Yes` (include a cover) then Promote through the Studio API. Does not Approve for publishing.
- **Correction (product):** `promotionThumbnailTriState` maps `Use photo frame` → `Yes` in `apps/studio-api/worker.js`. Not on production Worker yet; this run uses the PATCH workaround so testing does not wait on a Worker deploy.

### Earlier seed defects (already corrected)

- Cloudflare 1010 on workers.dev from Python urllib → seed calls the bridge with curl
- GET `/item4` Worker 1101 while SMV1 drains → poll lighter routes; resume existing idea/PR
- Cloudflare 1042 on first POST create-PR → retries
- Masters stuck Uploading because GET status seized SMV1 → reconcile Drive-uploaded masters without seizing SMV1; restore production SMV1 selector
- Variant poll treated master Ready as variant Ready (`studio_variant_status` string `"None"` is truthy) → poll GET `/variants` and require `status === "Ready"`

## Isolation

- Do not reuse CI82
- Do not stamp `Test_Run_ID`
- Do not Approve platform outputs for publishing
