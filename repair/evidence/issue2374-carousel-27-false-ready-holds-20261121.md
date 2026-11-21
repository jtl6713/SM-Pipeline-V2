# Issue #2374 — 27 Instagram Carousel false-ready holds (already applied)

**Canonical production:** Supabase `vkwvscgisqsbuwagdvtb`.  
**Verified:** 2026-11-21 UTC.  
**Action:** one-time source-only atomic correction. **Do not replay this update.** No Graph/media writes, no public post creation, no retry or Airtable traffic.

## Two proven defects

**AP0C missing Instagram stage URL (11 outputs, 54 image records):**

`9318, 9400, 9788, 9790, 9802, 9807, 9811, 9821, 9908, 9912, 9934`

All 54 image records retain **Final Approved** and `Asset_4x5_Public_Status=Ready` plus HTTPS `media.chicagoshining.com` public 4:5 JPEGs, but *none* has a saved `IG_Public_Asset_URL` or `IG_Public_Asset_Status=Ready`. The AP1C runner reads the absent Instagram-specific field, causing Meta HTTP 400 `(#100) image_url is required`. The original gallery assets should be **re-staged**, not gratuitously regenerated or blindly copied to a new field without proof.

**Conflicting/duplicate or incomplete carousel slide sets (16 outputs):**

`8277, 8502, 8525, 9037, 9051, 9171, 9261, 9269, 9275, 9340, 9352, 9765, 9875, 9919, 10216, 10233`

AP1C detected slide-set mismatch. Most have multiple approved variants at the same slide number, sometimes with **different approved image URLs**; one has fewer than the expected number. No safe automatic choice of the correct visual set is possible. Preserve variants until review.

All **216** linked carousel slide records remain unchanged by this correction. Exact provider ID preflight found no saved *nonempty* IG child IDs, parent ID, published media ID, public receipt or active lock owner for any of the 27. Lack of saved IDs is **not proof that Meta never created remote media**.

## Atomic all-or-none recovery and readback

The first guarded attempt correctly refused the entire batch (admission=false, 0 rows changed) because **21** records had a nonempty **historical** `Publish_Locked_At` although their lock owner was blank. All those timestamps predated the operation by hours. A second attempt retained every same safety check and allowed a timestamp **only when the owner was blank and the timestamp was more than 30 minutes old**. No active lease was bypassed. An all-or-none row-locked CTE admitted exactly 27 matching original-cohort outputs, then updated **27/27**.

The original schedule, publishing/review/carousel stage, retry flags, dispatch count, stale lock timestamp and error were archived in the append-only `error_messages.Studio_Overdue_Preflight_Repair_20261120` marker.

Every held output is now:
- `review_status=Changes Requested`, `output_status=Changes Requested`, `publish_status=Not Ready`
- `do_not_publish=true`, `auto_publish_enabled=false`, `publish_retry_eligible=false`
- `scheduled_post_date=NULL`, `studio_scheduled_at=NULL` and no automatic retry time
- `ig_carousel_status=Ready for Asset Prep` for the 11 unstaged-asset defects, or `Retry Pending` for the 16 ambiguous slide sets
- Still **unverified against provider publication**; no new Published timestamp or URL inferred

An **independent** Supabase readback verified all **27/27** exact flags and **82** total protected media reworks (previously 55).

## Concurrent, unrelated publication receipts

While this correction took place, another recovery owner saved **six** Instagram Stories as Published with exact Story IDs, public URLs, and timestamps: outputs `4123, 4928, 1256, 5244, 5394, 5458` at 07:21–07:25 UTC. They were **not** published by this diagnosis or status correction.

Approved/overdue/no-receipt count fell from **198 to 165**: 27 honest rework holds and 6 concurrent independently recorded Story publications. This is NOT 33 newly published outputs.

## Release requirements

1. For the 11: re-stage the approved existing 4:5 gallery images via AP0C, verify public URLs and previews without resubmitting to Graph, obtain fresh Factory signoff.
2. For the 16: resolve conflicting approved slide identities, choose canonical cover and order, preview and reapprove. Do not delete alternative approved image records automatically.
3. For **all 27**: independently reconcile original provider delivery and verify absence of duplicate post before any new MAE schedule/dispatch; preserve locks and idempotency.
4. The accompanying AP1C code change prevents any **new** Meta child POST when a required IG public asset was not staged, and parks contradictory slide order without arbitrary selection.

This ledger documents an **already applied** source-only change. It is not a repeatable production migration or authorization to publish. Keep issue #2374 open until verified outcomes and creative rework are complete.
