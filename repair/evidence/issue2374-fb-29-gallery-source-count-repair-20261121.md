# Issue #2374 — 29 verified Facebook source-gallery count repairs (already applied)

**Production project:** `vkwvscgisqsbuwagdvtb`. **Audit:** 2026-11-21 UTC.
**This file is an evidence ledger, NOT a script to replay.**

## Exact source evidence

Protected gallery [PR #2450](https://github.com/jtl6713/SM-Pipeline-V2/pull/2450), merged `6fdb7972abf07ebc8e48353dd3c6bb1a70725681`, includes `repair/manifests/issue2374-fb-source-gallery-36-20261121.json`. The exact 36 held FB0 records map to **206** approved shared public 4:5 source slides.

An independent, no-credential public-CDN HTTP/Image-header audit [run #44883330741](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44883330741) and [per-image artifact #14699275591](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44883330741/artifacts/14699275591) verified:
- **206/206** reachable image responses with valid decodable headers; all HTTP **206** (bounded range requests).
- **205/206** have 4:5 dimensions.
- **29/36** source galleries have exactly one cover at slide 1, unique contiguous slide numbers, Final Approved assets, and all valid 4:5 image headers.
- **Six** galleries have conflicting duplicated approved slide numbers and must be curated, not auto-deduplicated: `9822,9876,9883,9920,9967,10022`.
- **One** gallery has a defective cover: output `9272`, slide 1 is **1080x1920 (9:16)** instead of the package's 4:5 source aspect; it requires careful framing and fresh approval.

## Actual guarded metadata repair on 29 uniquely validated source galleries

**Exact outputs and validated cardinalities**:

`5438:4, 9314:4, 9319:4, 9401:2, 9789:4, 9791:8, 9803:4, 9808:4, 9812:4, 9856:4, 9891:8, 9896:4, 9900:4, 9906:4, 9909:8, 9913:4, 9914:4, 9935:4, 9944:4, 9950:4, 9952:4, 9959:4, 9965:4, 10018:8, 10020:4, 10032:4, 10034:4, 10044:4, 10095:4`.

A row-locking, all-or-none Supabase transaction admitted **29/29**, only if all original held states and creative gallery source facts matched current live records. It restored the previously blank `image_count` to the **130** truthful existing image counts and added `error_messages.Studio_Recovery_Source_Gallery_Verified_20261121` with exact source fingerprint, CDN proof run/artifact and explicit `fresh_human_factory_approval_required=true`, `fb_platform_asset_package_ready=false`, `publish_retry_authorized=false`.

**Nothing else was changed**: `assets_ready_count` remains zero; no provider FB Photo IDs or published receipt were invented; `review_status=Changes Requested`, `output_status=Changes Requested`, `publish_status=Not Ready`, `do_not_publish=true`, `auto_publish_enabled=false`, `publish_retry_eligible=false`, and expired schedule cleared.

A **second independent production readback** confirmed exactly **29** records repaired with total `image_count=130`, **29/29** still held, and **82/82** protected reworks remain in the original audited recovery marker.

**Next physical-media steps:** Within Factory, review the existing 4:5 gallery, decide whether to create a Facebook-specific 1:1 variant per brand policy, select a canonical source for each of the six duplicate sets, fix #9272 cover, then package/preflight in FB0 under normal owner and human approval gates. All gallery records and original image URLs are preserved. No auto-render, photo upload, status reapproval, scheduling or public post is authorized by the metadata repair.

This entry documents an applied source-level preparation that reduces regeneration, *not* completion of 29 public posts.
