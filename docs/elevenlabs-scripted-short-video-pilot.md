# Script a Short — optional ElevenLabs AI video pilot

## Scope

Users may choose **Generate AI Image or Video** for an individual, still-unassigned
scene in the saved Storyboard & Scene Media workspace. Existing real footage,
library images, AI stills and manual uploads remain unchanged. The pilot only
submits **one scene clip at a time**; it does not create a Production Request,
render a final video, schedule or publish anything.

- Models: Veo 3.1 Fast (default), Veo 3.1, and separately API-authorized Seedance 2.5.
- Veo: 4/6/8 seconds, 720p/1080p, vertical/horizontal; optional native sound.
- Seedance 2.5: 4–30 seconds, 480p/720p, six aspect ratios, optional native sound.
- Start/end frames, image references, and on Seedance video/audio references.
- Asset Manager reference pilot limit: 3 images, 2 videos, 1 audio, with size and rights checks.
- Existing Studio voiceover and music remain authoritative; generated sound requires explicit acknowledgement before scene acceptance.
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
| `STUDIO_ELEVENLABS_VIDEO_CREDITS_{4,6,8}S_720P_16X9` | Independently reviewed estimates for each 16:9 duration. No ratio inherits another ratio price |
| `STUDIO_ELEVENLABS_VIDEO_RIGHTS_VERIFIED` | Exactly `true` only after checking applicable provider/license restrictions for commercial posting |
| `STUDIO_ELEVENLABS_VIDEO_WATERMARK_VERIFIED` | Exactly `true` only after proving the existing Runner reliably applies the required brand watermark to AI-generated video for profiles requiring it |
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
2. Server validates prompt, model-specific settings, trusted reference Media Assets, access and exact price configuration.
   SHA-256 quote ID binds exact request and cost.
3. Before a quote is shown, the Worker also requires commercial-rights confirmation, configured Drive runner and Media Assets table, and required brand-watermark verification. Browser displays estimated credits; only an affirmative human
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
node --test apps/studio-api/story-first-ai-video.test.mjs apps/studio-api/story-first-ai-video-references.test.mjs apps/studio-web/story-first-ai-video-ui.test.mjs
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


## Expanded API capability and safety contract

The provider app UI is NOT evidence of Image & Video API access. ElevenLabs explicitly
requires additional approval for ByteDance API models. The Worker feature flag
STUDIO_ELEVENLABS_SEEDANCE_API_APPROVED must be true before Seedance is quoted
or submitted; confirm entitlement on the actual API workspace.

Veo Fast and quality support start/end frames OR three image references
(subject/style), with free-form images requiring an 8-second duration. Seedance
2.5 supports start/end frames OR image, video and audio references; the current
pilot limits these to 3 images, 2 videos and 1 audio even though the provider
documents higher caps. Frames and free-form references are mutually exclusive.

All media references are exact active-profile Airtable Media Asset record IDs.
The Worker re-fetches the records, verifies original Google Drive File IDs,
MIME, size, rights and ownership, then obtains bytes through authenticated
Google Drive. It uploads them to ElevenLabs /v1/assets only AFTER a user has
explicitly approved the exact reviewed credit quote. Third-party Licensed or
Cleared content is blocked by default unless generative-AI reuse rights are
separately verified and STUDIO_ELEVENLABS_VIDEO_LICENSED_REFERENCES_VERIFIED
is true. An admin must reconcile orphaned ElevenLabs uploaded reference assets.

New flags (ALL default false):
- STUDIO_ELEVENLABS_VIDEO_AUDIO_ENABLED: allow native model soundtrack.
- STUDIO_ELEVENLABS_VIDEO_REFERENCE_TRANSFER_ENABLED: consented transfer of
  approved Asset Manager originals to ElevenLabs.
- STUDIO_ELEVENLABS_SEEDANCE_API_APPROVED: independently confirmed ByteDance API
  permission.
- STUDIO_ELEVENLABS_VIDEO_LICENSED_REFERENCES_VERIFIED: separately checked
  generative-AI usage rights for Licensed/Cleared sources.

For new model/audio/reference combinations, set
STUDIO_ELEVENLABS_VIDEO_CREDIT_ESTIMATES_JSON to a JSON object whose keys are
exact storyVideoPriceKey signatures and whose values are positively verified
integer ElevenLabs credit estimates. Example signature:
veo-3.1-generate-001|8|1080p|9:16|silent|no-start|no-end|0images|0videos|0audios

The prior per-duration env price keys still apply ONLY to unchanged silent,
no-reference, 720p Veo Fast text-to-video. Missing exact prices block billing.

ElevenLabs native Brand Kit controls and Creatify Aurora lip-sync are separate
flows and are NOT part of this API pilot. The existing Studio watermark remains
mandatory. Generating missing scenes with a summed price budget is another
separately gated follow-up. Provider capability docs:
https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video
https://elevenlabs.io/docs/eleven-api/guides/how-to/image-and-video/references
