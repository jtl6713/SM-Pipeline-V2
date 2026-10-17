# Factory Batch Approval Phase 3A — Format Eligibility (2026-10-17)

This matrix describes the **checked-in approval policy**, not live canary acceptance.
The production rollout manifest remains **chicago_ig_reels_v2**, maximum five.
Only explicit, reviewed operator submissions can approve real content.

| Profile | Platform | Output type | Policy state | Production state |
|---|---|---|---|---|
| Chicago | Instagram | Reel | v2 production permit | Enabled (limit 5) |
| Chicago | Instagram | Story | v3 dormant permit | Blocked pending release gates and live canary |
| Chicago | Instagram | Carousel, image | Not enabled | Blocked |
| Chicago | Facebook | Reel, Story, other | Not enabled | Blocked |
| Chicago | YouTube | Short, video | Not enabled | Blocked |
| Chicago | TikTok | Video draft, photo | Not enabled | Blocked |
| NYC, LA, Miami | All | All | Not enabled | Blocked |

## Existing safety boundaries

- Production modes are exact-match, production-base and Chicago-profile scoped, and enforce an exact five-output limit.
- The Worker re-fetches each record before starting batch mutation and again under the canonical output lock.
- The canonical `factoryApproveOutput` calls `approveOutputRecordForPublishing`, whose scheduling branch recognizes Stories separately from other formats.
- The new Story mode is **code-only dormant**: the production rollout manifest and deployment workflow do not recognize it for activation. Do not alter that condition before browser/staging verification of Story media, metadata, and scheduling.
- Approval does not authorize direct social-platform publication or bypass Do Not Publish, duplicate, archive, rendering, or existing publishing protections.

## Next release gate

1. Verify real Chicago Story records and the current publisher-specific caption, cover, media and scheduling prerequisites.
2. Add Story-aware Factory selection copy/UI and staging acceptance fixtures.
3. Expand the deployment workflow exact manifest validator in a separate activation PR.
4. Run the synthetic acceptance suite, Wrangler dry-run, and production-binding checks.
5. Enable only with operator approval and a specific reviewed Story canary. Roll back to `chicago_ig_reels_v2` if checks fail.

Do not reapprove the completed Reel Output #4906 canary.
