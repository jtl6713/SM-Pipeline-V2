# Quality Agent: Production → Factory handoff, end-to-end recovery

**Signature:** `QA-PRODUCTION-FACTORY-E2E-2846`  
**Code:** `apps/studio-api/quality-factory-handoff.mjs`  
**Tracked in:** issue #2846; incident evidence is from Content #2221, where #10855 Instagram Carousel, #10856 Facebook Photo Set, and #10858 YouTube were eventually found and submitted after a Factory field-projection fix. #10857 TikTok is not assumed complete just because its siblings are ready.

This is a **content-level** check. The authorized end state is a complete, actionable Factory review queue — **not** automatic human approval or publication.

## Required recognition

A Production Request is not "done" simply because a parent was Promoted, one output exists, or one sibling is rendered. Read its exact `output_plan.items` and compare the unique (profile, platform, output type) destinations against canonical `platform_outputs`. All planned output identities must be accounted for: no output, partial output, wrong output, duplicate output, and unresolved per-output state each have distinct diagnoses. A live claimed producer is **in progress**, not failed; expired/failed producer is investigated before one bounded resume. The check must not trigger a duplicate create from status alone.

Once outputs exist, inspect each **format's** deliverable:
* Video: completed MP4, accessible cover, audio/voiceover and captions, appropriate aspect and location-specific creative.
* Native-photo gallery: number of selected photos, actual canonical `carousel_slides` in order (not just a collage/thumbnail), correct IG/FB 4:5 or TikTok-native layout, public CDN/bytes, original source ownership, watermark and correctly matched content/profile/city.
* Missing or wrong assets: return to existing bounded media/crop/render repair. Rebuild and verify actual media. Do not just set `Render_Status`, `image_count`, `assets_ready_count`, `Approved For Final`, or source IDs to reassuring values. No invented provider IDs.
* Held outputs: a creative/copyright/rights/provider hold is **not** cleared by finding files or by a past approval receipt. Require exact authorized release after the underlying issue is verified. A production repair hold can show a preview-only card but cannot be selected for publishing approval.

## Factory visibility (critical regression)

When a canonical output is `Ready for Review / Review Sent / Not Ready`, unheld and media-ready, Quality Agent checks both:
1. Its exact record ID is included in **server** `lanes.needs_eyes` under the same content and profile.
2. The server card preserves canonical `publish_status: "Not Ready"`, `review_package_ready: true`, and does not lose eligibility because a **historical terminal/failed approval** is retained in browser recovery state. A true *in-flight* claim still prevents another approval. Check profile/search/pagination and UI cache when the card exists on the server but not in the client.

The 2026-11-23 incident was caused by `factoryCardFromRow` omitting `publish_status`. Server #10855/#10856 cards were already eligible, but the browser's old-batch recovery branch required exact `Not Ready`. PR #2845 fixed that field and the authenticated production readback verified both exact IDs and statuses. Never "repair" this by overwriting canonical Output Status to imitate the rendered video sibling.

## Recovery policy and authority

| Stage | Allowed next action | Hard stop |
| --- | --- | --- |
| Invalid/missing plan or owner | Reconcile plan, profile, production request and exact output destinations | No guessed fanout |
| Zero outputs | Existing narrowly eligible `studioRecoverEmptyPlatformOutputCron` may re-enter I3/I4 with one-shot R2 claim, held outputs and readback | No broadened automatic creation without new verified adapter |
| Partial outputs | Diagnose missing exact destination, original producer result, claim and duplicates; route to owned repair/retry path | No blind second I4/promote |
| Failed render/voiceover/crop | Existing workload-governed recovery, exact source and readback | No bypass of job lease |
| Missing/incorrect gallery slides | Rebuild only genuine media/links and inspect creative correctness | No human final-slide auto-stamp |
| Unresolved hold | Preserve and surface owner/action | No autonomous hold release |
| RFR but not Factory-visible | Compare actual server lanes, card fields, browser history; fix code and deploy with exact-ID canary | No false status rewrite |
| Everything ready | Stop at operator Factory approval, with complete package and queue evidence | No auto Approve, MAE schedule, external post, `published_at` |

Even if all C9 slides have HTTPS URLs and a Factory card exists, a deep `verifiedMediaEvidence` proof is needed before the Quality Agent calls a package fully ready: `cdn_bytes_verified`, `topic_location_verified`, `rights_verified`, `branding_verified`, `aspect_ratio_verified`, and (for video) `audio_verified`. Each must be `true` for the exact output. An unperformed probe is `verification_required`, not a passed image or silent approval. The compact recent-request scanner does **not** generate this evidence by itself.

The **separate** human image-finalization and Factory submission gates remain authoritative. A user click needs authenticated actor, final slide evidence, exact batch/claim safety, and independent publication preflight. The Quality Agent may diagnose progress before that, never authorize an action on the user's behalf.

## Monitoring and evidence

The Quality Agent's compact sampler reads **at most four** newest promoted/submitted Production Requests with ready output plans and their exact content's Platform Outputs, using two bounded, server-authenticated Supabase queries and one-minute coalescing. It does not query the full database or treat a truncated/failed read as zero findings. It reports `repair_required`, `in_progress`, `verification_required`, or `awaiting_human_factory_approval` with the blocked stage and specific actions. Because it omits expensive slide/CDN byte probes, **verification_required is not a clean pass**; exact native-gallery/Factory inspection happens in the detailed path. The Factory Desk also runs a no-extra-query card/visibility projection audit over its already loaded rows.

This is **detection and safe recovery orchestration**, not a second unbounded producer. The preexisting one-minute zero-output recovery remains limited to previously validated autonomous/escalated cases. A general partial-fanout writer requires independent admission, idempotency, existing-output ownership proof, workload governor limits, and canary/deploy verification before activation. No broad unreviewed write authority is added by this signature.

## Regression obligations

Run `quality-factory-handoff.test.mjs`, `quality-checks.test.mjs`, `factory-desk.test.mjs`, `factory-quality-monitor.test.mjs` and Worker/Pages CI. Include zero/partial/duplicate/wrong-profile plans, live produce, failed render, absent/corrupt slides, unverified deep probe, hold preservation, historical Failed/terminal batch, lost card `publish_status`, hidden card with matching server readiness, and successful stop before user approval. Verify postdeploy on the actual Factory page and exact output IDs; a healthy NYC count is never enough.
