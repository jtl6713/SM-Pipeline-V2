# Quality Agent Signature Catalog

This file is the machine-readable/text companion to `docs/handoffs/Quality-Agent.docx`. Quality Agent checks should consult this catalog when scanning failed, retry-pending, or soon-to-publish outputs.

## QA-TT-DUPLICATE-SLIDES — TikTok duplicate carousel slide links

**First observed:** Platform Output 997, Content 226, October 5, 2026.

### Signature

Recognize this signature when all of the following are true:

- Platform is **TikTok** and the publish route is a native photo / photo-carousel draft.
- `Image_Count = N` for an approved nonzero count.
- The linked **Carousel Slides** table contains exactly **2 × N** rows where `Asset_9x16_Public_Status = Ready` and `Asset_9x16_Public_URL` is nonblank.
- The already stamped `Render_Clip_List_JSON` contains exactly **N** ordered public image URLs.
- Typical failed state, when it reaches TTD0 before being healed:
  - `Publish_Status = Failed`
  - `TikTok_Draft_Status = Retry Pending`
  - `Publish_Error_Stage = TTD0_ASSETS`
  - error text matches: `TTD0 aggregated <2N> ready 9:16 slide(s); expected <N>.`

The Quality Agent should also run this check **proactively before TTD0 fails**. A failure record is not required if the 2× count plus authoritative N-image stamped manifest is already present.

### Root cause pattern

A prior/replayed carousel preparation pass can create a second Carousel Slide record for each logical TikTok slide while both sets remain linked to the same Platform Output. TTD0 then counts both sets and sees twice the approved image count even though the Platform Output itself still has the correct N-image stamped package.

### Safe automatic repair

1. Treat the ordered `Render_Clip_List_JSON` as authoritative only when it contains exactly **N** valid public image URLs.
2. Rebuild `TikTok_Draft_Assets_JSON` from those N URLs in stamped order.
3. Keep `Image_Count = N` and the draft type as Photo Carousel (or Single Photo for N=1).
4. Clear `Publish_Error_Stage` and `Publish_Error_Message`; clear publish locks/retry time.
5. Set `Publish_Status = Ready to Publish` and `TikTok_Draft_Status = Ready for Delivery`.
6. Resume the normal TTD1 draft-initialization path.
7. **Do not delete physical media assets.** If duplicate Carousel Slide rows are cleaned up, detach only the provably duplicate links after a canonical 1..N set has been established.

### Do not auto-repair / escalate instead

Escalate when any of these are true:

- the stamped manifest is missing, has a different count, or contains non-public/blank URLs;
- a TikTok draft publish ID or public post ID already exists and a second initialization could duplicate a post;
- the ready-slide count is not the exact 2× signature and the underlying mismatch is ambiguous;
- slide ordering cannot be proven;
- the output is already Published or manually completed.

### Runtime implementation

- Detector: `services/pipeline-runner/quality_agent/signatures.py`
- Publishing recovery: `services/pipeline-runner/ttd/ttd0.py`
- Signature ID: `QA-TT-DUPLICATE-SLIDES`

TTD0 also has a conservative stamped-manifest fallback for other slide-table count mismatches when the authoritative manifest exactly matches the approved image count. The explicit Quality Agent signature above remains the exact 2× duplicate-link pattern.


## QA-ENGAGEMENT-* — Social Engagement Automation failures

**First observed:** Engagement module Stage A/B, October 8, 2026.

### Signatures

Recognize these `kind` values from Engagement Action `classification.kind` / Worker ledger:

| Kind | Meaning | Recovery |
|---|---|---|
| `engagement_duplicate` | Idempotency key already published/queued | Do not retry; open Engagement history |
| `engagement_repeated_comment` | Near-identical comment text | Edit or skip |
| `engagement_unsupported` | Official API cannot perform the action | Open Post only; never mark automated success |
| `engagement_permission` | OAuth/permission expired | Re-authorize profile; suspend platform until fixed |
| `engagement_quota` | Provider quota / rate limit | Back off until reset; do not raise Studio limits to bypass spam rules |
| `engagement_failed_comment` | Provider hard failure | Inspect error; never blind-retry |
| `engagement_wrong_profile` | Profile isolation mismatch | Switch to the correct brand profile |
| `engagement_irrelevant_ai` | Suggestion failed safety/relevance | Skip or regenerate |
| `engagement_post_deleted` | Target post 404 / deleted | Mark target Expired |
| `engagement_ambiguous` | Unclear whether comment exists | Verify via provider before any retry |

### Rules

- Never blind-retry failed external engagement actions.
- Ambiguous comment publishes must check existing comments first (YouTube uploader idempotency path).
- Unsupported platforms must remain Open Post / manual.

### Runtime implementation

- Classifier helpers: `apps/studio-api/engagement.mjs` → `classifyEngagementFailure`
- Catalog: `apps/studio-api/quality-checks.mjs`
- Signature family: `QA-ENGAGEMENT-*`
