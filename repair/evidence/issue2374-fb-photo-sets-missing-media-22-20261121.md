# Issue #2374 — second Facebook Photo Set missing-media recovery (already applied)

**Production canonical store:** Supabase project `vkwvscgisqsbuwagdvtb`.  
**Date:** 2026-11-21 UTC.  
**Operation:** guarded, atomic, source-only rework state transition. **Already applied once. Do not replay this operation.**

## Proven incomplete candidates

After the first 14 protected rework holds were verified, another **22 original overdue Facebook Photo Sets** were still marked `Approved / Ready to Publish / FB Ready for Assets`, despite having:

- `image_count=0` and `assets_ready_count=0`.
- No selected-assets JSON/text, final file, publish file or recorded Facebook photo IDs.
- No stored public URL/timestamp, provider response, test flag or active lock owner.
- Previous `Studio_Publish_Dispatch_Count=2`, `Studio_Publish_Dispatch_Note=overdue-rescue: skipped: facebook_not_ready_for_assets`.
- `auto_publish_enabled=true`, `publish_retry_eligible=NULL` and DNP=false (so they were excluded from the earlier retry-eligible=true group).

**Exact output numbers:** `5438, 9272, 9314, 9319, 9401, 9789, 9791, 9803, 9808, 9812, 9856, 9876, 9891, 9950, 9952, 9959, 9965, 9967, 10018, 10020, 10044, 10095`.

The existing preview did **not** constitute a publishable selected image gallery. The past skipped dispatch was not used as negative provider-publication proof.

## Guarded one-time transition

A source-only SQL CTE locked exactly those 22 candidate records and admitted the update only if **all 22 still matched every live preflight**, including exact membership, original cohort audit marker, zero images, missing file and provider identities, expired date, identical stage, no active lock, null retry eligibility and explicit skip note. Admission returned `true` and updated **22/22**.

The changes are identical in intent to the earlier 14-output hold:
`review_status=Changes Requested`; `output_status=Changes Requested`; `publish_status=Not Ready`; `fb_publish_status=NULL`; DNP=true; auto_publish=false; retry_eligible=false; expired schedule and next-retry cleared. The `Studio_Overdue_Preflight_Repair_20261120` marker archives original statuses/date, dispatch count/note, why gallery construction is needed and the mandatory fresh-approval and duplicate-evidence gate.

No provider content, remote post, external account or unrelated Supabase row was mutated. No content was marked Published.

## Independent verification

A separate, post-transaction Supabase readback confirmed:
- **199** approved/overdue/no-public-receipt outputs remained (221 before this exact batch; 235 before both 2026-11-21 Facebook batches).
- **55** correctly protected media-rework records now exist (33 before this batch; 19 before both batches).
- Exactly **22/22** updated outputs have all required Changes Requested, DNP, no-auto, no-retry, no-expired-schedule flags with archived original recovery evidence.

**Total of both Facebook Photo Set batches:** 36 defective Ready records moved into protected rework; **zero** posts fabricated or public statuses inferred. These are not permanently resolved outputs. They need actual approved 1:1 Facebook images, preview, fresh Factory human approval, provider owner/account duplicate reconciliation and normal MAE scheduling.

The GitHub issue #2374 remains open. This file is an audit ledger of an already applied action, not a script to execute again.
