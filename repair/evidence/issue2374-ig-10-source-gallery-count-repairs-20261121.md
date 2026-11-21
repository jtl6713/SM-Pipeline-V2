# Issue #2374 — 10 Instagram gallery source-count repairs (already applied)

**Production:** Supabase `vkwvscgisqsbuwagdvtb`, 2026-11-21 UTC.  
**This is a historical ledger, not a replayable repair script.**

Original eleven overdue Instagram Carousels had AP1C HTTP 400 `image_url is required` because the Instagram-specific AP0C staged fields (`IG_Public_Asset_URL` and `IG_Public_Asset_Status=Ready`) were absent. All 11 had source `Asset_4x5_Public_URL` images, but were already protected as `Changes Requested / Not Ready`; they must remain held pending fresh Factory approval.

[Image-header audit run #44884052634](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44884052634), [per-slide evidence #14699306934](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44884052634/artifacts/14699306934) verified **54/54** original source URLs return HTTP **206** and contain decodable 4:5 image dimensions. It found **10 unique complete canonical source galleries** and **one** (#9318, 4 linked records) with **two source slides already marked Deleted From Carousel**. Neither source URL nor approval state was changed by this read-only audit. Deleted-slide choices remain authoritative, so #9318 was **not** automatically repackaged.

**Exact 10 eligible outputs:** `9400:2, 9788:4, 9790:8, 9802:4, 9807:4, 9811:4, 9821:8, 9908:8, 9912:4, 9934:4` — **50 unique original source images**.

An atomic, row-locked, **all-or-none** Supabase transaction required exactly those 10 output identities, old held review/publishing state, zero parent image count, no active lock, zero AP0C-stage Instagram public URLs, zero saved nonempty child IDs, no public post or receipt, one cover, unique contiguous ordering, all 50 `Final Approved`/public-ready source rows and no deleted slides. Admission returned **true**, with **10/10** changed. The only changes were the truthful output-level `image_count` (2/4/8) and an append-only `error_messages.Studio_Recovery_IG_Source_Gallery_Verified_20261121` marker containing source fingerprint, CDN evidence and explicit `ig_public_assets_staged=false`, `graph_child_create_authorized=false`, `fresh_human_factory_approval_required=true`.

**Independent production readback at 08:17:30 UTC:** 10 restored source galleries, `image_count=50` total, **10/10** in `Changes Requested / Not Ready`, `do_not_publish=true`, auto=false, retry=false, with `assets_ready_count=0` and still at `Ready for Asset Prep`. Combined with earlier FB gallery metadata repair: **39** source-prepared galleries involving **180** verified existing images, but **0** new provider Photo IDs, Meta child IDs, remote uploads or publication receipts. Entire original media rework cohort remains **82**.

**Still required:** actually stage approved source images into the Instagram AP0C public-media fields under the normal pipeline and only after fresh human Factory approval plus no-duplicate provider preflight. Preserve #9318's intentional deleted slides until the canonical desired slide set is approved. Never republish from a missing receipt alone. This ledger is a record of an already applied correction, not authorization to reset or retry publication.
