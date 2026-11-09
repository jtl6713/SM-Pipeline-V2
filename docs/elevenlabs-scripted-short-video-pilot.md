# Script a Short — optional ElevenLabs AI video pilot

## Scope

Users may choose **Generate AI Image or Video** for an individual, still-unassigned
scene in the saved Storyboard & Scene Media workspace. Existing real footage,
library images, AI stills and manual uploads remain unchanged. The pilot only
submits **one scene clip at a time**; it does not create a Production Request,
render a final video, schedule or publish anything.

- Model: Google Veo 3.1 Fast via ElevenLabs `/v1/flows/video`.
- One clip: **4, 6 or 8 seconds**, **720p**, **9:16** or **16:9**.
- **No generated sound**. Existing Studio voiceover and music workflow remains
  authoritative.
- **Two paid attempts maximum per exact scene**, only with a new cost review
  and explicit authorization. Automated provider retries are forbidden.
- Completed media is staged privately in R2; the user previews and accepts
  or declines it. Accepted MP4 uses the existing provenance/watermark-gated
  Pipeline Runner Google Drive transfer and canonical Airtable Media Assets
  registration. Only then is the chosen scene marked `media_approved`.
- Supabase remains a non-authoritative mirror. No automatic publishing.

## Admin prerequisites (OFF by default)

Use managed Worker secrets and configuration; never store actual tokens in the
repository. Existing `ELEVENLABS_API_KEY` must have ElevenLabs Image & Video
(or Flows) permission on a Pro-or-higher account.

| Worker setting | Required behavior |
| --- | --- |
| `STUDIO_ELEVENLABS_VIDEO_ENABLED` | Exactly `true` to enable paid requests |
| `ELEVENLABS_API_KEY` | Existing managed ElevenLabs key with video API access |
| `STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT` | Actual reviewed pricing date YYYY-MM-DD; fails closed after 30 days |
| `STUDIO_ELEVENLABS_VIDEO_CREDITS_4S_720P_9X16` | Positively verified, integer estimated credits for 4-second Veo 3.1 Fast **video without audio** at 9:16 |
| `STUDIO_ELEVENLABS_VIDEO_CREDITS_6S_720P_9X16` | Ditto for 6 seconds |
| `STUDIO_ELEVENLABS_VIDEO_CREDITS_8S_720P_9X16` | Ditto for 8 seconds |
| `STUDIO_ELEVENLABS_VIDEO_CREDITS_{4,6,8}S_720P_16X9` | Independently reviewed estimates for each 16:9 duration. No ratio inherits another ratio\x27s price |\n| `STUDIO_ELEVENLABS_VIDEO_RIGHTS_VERIFIED` | Exactly `true` only after checking applicable provider/license restrictions for commercial posting |
| `STUDIO_MEDIA` | Existing private R2 bucket |
| `PIPELINE_RUNNER_URL`, `PIPELINE_RUNNER_SHARED_SECRET` | Existing authenticated Google Drive transfer |

**Do not infer these costs from this document.** ElevenLabs pricing depends on
model and selected settings. Prices in UI are **estimates**, not maximum
billing caps; verify model access and cost for the requested ratios and durations
in ElevenLabs before configuring them. Do not enable video if budgets cannot be
bounded by the account/organization.

## Provider lifecycle and safe recovery

1. The scene must have a valid saved Idea/profile and **no** approved or
   pending image. The user selects format/duration and submits a quote
   request, which makes **no paid provider call**.
2. Server validates prompt, fixed model/settings, configuration and pricing.
   SHA-256 quote ID binds exact request and cost.
3. Browser displays estimated credits; only an affirmative human
   confirmation POST with `approve_paid_generation: true` may proceed.
4. Before a paid provider POST, a conditional R2 write reserves the exact
   `idea / scene` generation intent. If the POST response is lost or
   uncertain, the status becomes `submission_uncertain` and **must not
   automatically submit again**.
5. Read-only provider status checks are rate-limited to at least 10 seconds.
   An MP4 is validated and downloaded to temporary, private R2 storage on
   completion. Failed generations remain visible for a fresh authorized
   attempt; ambiguous submissions block.
6. User **Accepts** or **Declines** the video. Acceptance requires confirmed
   rights and the existing Runner provenance/watermark gates. Pending media
   cannot become a published output.
7. If Drive/Airtable registration starts but the outcome is uncertain, the
   job remains `accepting` until an administrator reconciles it. Do not
   blindly repeat a Drive upload. A confirmed Airtable registration is saved
   as `registered` so final scene selection can be retried without a
   second uploaded asset.

### Inspect R2 state without exposing secrets

- Intent JSON: `studio/story-first/ai-video/v1/<Idea ID>/scene-<N>.json`
- Staged MP4: `studio/story-first/ai-video/v1/<Idea ID>/scene-<N>.mp4`
- A rejected staged MP4 is deleted; accepted media is retained in Drive
  with a Media Asset record.

## Verification / release gates

Run unit and integration guard tests, including:

```sh
node --test apps/studio-api/story-first-ai-video.test.mjs apps/studio-web/story-first-ai-video-ui.test.mjs
node apps/studio-web/ui-release-contract.mjs
node --test apps/studio-web/ui-release-contract.test.mjs apps/studio-web/pages-production-deploy-contract.test.mjs
```

Check production custom-domain version using existing protected deployment
workflow before merging; the UI build in this implementation is **0.6.921**.
Do not weaken the version guard to force deployment. Deploy both Worker and
Pages using GitHub workflows, verify live Worker and Pages after successful
runs, then perform a bounded operator-led canary on one non-public scene with
explicit credits authorization. **Never submit a paid test generation
automatically**.

## Remaining follow-up

A **Generate Missing Scenes** multi-scene wizard should first aggregate
eligible missing scenes, then collect one explicit *total* cost authorization
and process each exact scene with a bounded paid budget and individual review.
It is not part of this single-scene pilot. Also add automated admin
reconciliation for ambiguous receipts and stranded `accepting` states before
high-volume rollout.
