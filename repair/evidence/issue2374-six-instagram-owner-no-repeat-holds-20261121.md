# Issue #2374 — protected owner/publication evidence for 6 stale-401 Instagram Carousels

Production source: `vkwvscgisqsbuwagdvtb`. Verified 2026-11-21 at 08:24 UTC.

**This ledger documents a one-time ALREADY-APPLIED production source correction. Do not rerun it as a migration or authorize new posts.**

## Provider owner evidence (read-only)

Exact outputs: NYC `9868, 9882, 9893, 9895, 9905`, Miami `10631`. Each had original AP1C child HTTP 401 on Nov 18–19, and was still Approved/Ready/auto-retry-enabled without a saved public post URL or timestamp.

1. [Protected current-owner check run #44883549737](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44883549737) succeeded with exact NYC and Miami IG owner account identity and media-read HTTP 200 using four Graph GETs. Earlier 401 errors are historical and don't prove tokens are currently invalid.
2. [Protected native owned-media GET run #44884608568](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44884608568), [evidence artifact #14698939367](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/44884608568/artifacts/14698939367), succeeded. Graph GET calls 10, NYC owned inventory 239 items in three complete pages, Miami 217 in three complete pages, total **456** owner-native media records. All six original source captions had **zero native `CAROUSEL_ALBUM` + valid `/p/` + caption prefix candidate** in that recent history. This is **NOT** proof of nonpublication and **NOT** evidence to reupload: original captions may have changed or the source-to-provider asset correlation may be unavailable.
3. No provider writes, media creates, retries, new scheduled dates, published timestamps or inferred public URLs occurred from either audit.

## Actual safe source-only hold (already applied once)

An exact-ID, row-locking, all-or-none Supabase operation admitted exactly the six original source records only after verifying approved/ready states, historical HTTP 401 error, no current remote receipt, no active lock owner, historical lock timestamp older than 30 minutes, no recent quality-agent owner in 24 hours, original source profile NYC/Miami and absence of previous audit marker.

It changed ONLY:
- `do_not_publish=true`
- `auto_publish_enabled=false`
- `publish_retry_eligible=false`
- `publish_next_retry_at=NULL`, `ig_carousel_next_retry_at=NULL`
- Append-only `error_messages.Studio_Overdue_Provider_Readonly_Reconciled_20261121` retaining original retry/auto/DNP flags, owner GET evidence, scan sizes, artifact IDs, `original_asset_publication_ownership_verified=false`, `new_media_post_retry_authorized=false` and human release requirement.

**Intentionally untouched:** original `review_status=Approved`, `output_status=Approved for Publishing`, `publish_status=Ready to Publish`, `scheduled_post_date`, asset gallery, `published_at=NULL`, `platform_post_url=NULL`. The six are **STILL** in the approved overdue/unverified count. This is a safety reconciliation, **not** a fabricated count reduction.

An independent production readback at 2026-11-21 08:24:31 UTC confirmed **6/6** exact records in the requested protected retry state **without** leaving the overdue cohort; all **82** original rework holds remain, **161** outputs still overdue/no public receipt. Previously verified gallery-count repairs remain **29 FB packages / 130 source images** and **10 IG packages / 50 source images** (39 packages, 180 images), still requiring human Factory approval.

## Remaining operator gate

Resolve original upload identity with additional job/asset evidence or an unequivocal exact provider post receipt. Never infer nonpublication from no caption match, never clear DNP/retry holds merely because NYC/Miami owner tokens are currently healthy, and never mark Published without an exact owner/media identity and time proof. Preserve concurrent P1 #2340 recovery locks, other original gallery holds and normal MAE. Issue #2374 remains OPEN.
