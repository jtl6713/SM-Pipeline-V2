from __future__ import annotations

from typing import Any


TIKTOK_DUPLICATE_SLIDES = "QA-TT-DUPLICATE-SLIDES"
PROMOTED_PROFILE_DRIFT = "QA-PROMOTED-PROFILE-DRIFT"


def _clean_ids(values: list[str] | tuple[str, ...] | set[str] | None) -> list[str]:
    return [str(value or "").strip() for value in (values or []) if str(value or "").strip()]


def detect_tiktok_duplicate_slides(
    *,
    actual: int,
    expected: int | None,
    stamped_urls: list[str] | None = None,
) -> dict[str, Any] | None:
    """Recognize the Output 997 duplicate-carousel signature.

    Signature:
    - TikTok photo package expects N approved images.
    - Ready Carousel Slide rows linked to the output total exactly 2*N.
    - The stamped output package still contains exactly N authoritative images.

    The stamped manifest requirement makes automatic recovery conservative: a
    doubled database link set alone is not enough to guess which assets belong.
    """
    try:
        actual_n = int(actual)
        expected_n = int(expected) if expected is not None else 0
    except (TypeError, ValueError):
        return None

    urls = [str(url or "").strip() for url in (stamped_urls or []) if str(url or "").strip()]
    if expected_n <= 0 or actual_n != expected_n * 2 or len(urls) != expected_n:
        return None

    return {
        "id": TIKTOK_DUPLICATE_SLIDES,
        "platform": "TikTok",
        "stage": "TTD0_ASSETS",
        "actual_ready_slides": actual_n,
        "expected_slides": expected_n,
        "duplicate_factor": 2,
        "authoritative_manifest_count": len(urls),
        "auto_repair_safe": True,
    }


def detect_promoted_profile_drift(
    *,
    candidate_status: str,
    promoted_content_record_id: str | None,
    authoritative_asset_profile_ids: list[str] | None,
    candidate_profile_ids: list[str] | None = None,
    content_profile_ids: list[str] | None = None,
    production_brand_ids: list[str] | None = None,
    production_output_brand_ids: list[str] | None = None,
    profile_to_brand: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    """Recognize a promoted item that was attached to the wrong city/profile.

    This is deliberately conservative because changing profile ownership is a
    cross-record repair. Automatic recovery is allowed only when:
    - the Idea Candidate is already Promoted and has a promoted Content Item;
    - every authoritative selected media asset points to the same Content Profile;
    - that unanimous media profile disagrees with at least one promoted-chain
      profile/brand field.

    This matches the Lower East Side incident: the candidate/content/production
    chain was Chicago while all seven selected source assets were NYC.
    """
    status = str(candidate_status or "").strip().casefold()
    promoted_id = str(promoted_content_record_id or "").strip()
    if status != "promoted" or not promoted_id.startswith("rec"):
        return None

    asset_profiles = _clean_ids(authoritative_asset_profile_ids)
    canonical_profiles = sorted(set(asset_profiles))
    if len(canonical_profiles) != 1:
        # Missing or mixed source ownership is not enough evidence to move a
        # promoted item between city profiles automatically.
        return None

    canonical_profile_id = canonical_profiles[0]
    candidate_profiles = sorted(set(_clean_ids(candidate_profile_ids)))
    content_profiles = sorted(set(_clean_ids(content_profile_ids)))
    request_brands = sorted(set(_clean_ids(production_brand_ids)))
    output_brands = sorted(set(_clean_ids(production_output_brand_ids)))

    expected_brand_id = str((profile_to_brand or {}).get(canonical_profile_id) or "").strip()

    mismatches: list[str] = []
    if candidate_profiles and candidate_profiles != [canonical_profile_id]:
        mismatches.append("Idea Candidate.Content_Profile")
    if content_profiles and content_profiles != [canonical_profile_id]:
        mismatches.append("Content Item.Content_Profile")
    if expected_brand_id and request_brands and request_brands != [expected_brand_id]:
        mismatches.append("Production Request.Brand")
    if expected_brand_id and output_brands and output_brands != [expected_brand_id]:
        mismatches.append("Production Request Outputs.Brand")

    if not mismatches:
        return None

    repair: dict[str, Any] = {
        "Idea Candidate.Content_Profile": [canonical_profile_id],
        "Content Item.Content_Profile": [canonical_profile_id],
        "Platform Outputs": "lookup-derived from Content Item; verify propagation after repair",
    }
    if expected_brand_id:
        repair["Production Request.Brand"] = [expected_brand_id]
        repair["Production Request Outputs.Brand"] = [expected_brand_id]

    return {
        "id": PROMOTED_PROFILE_DRIFT,
        "stage": "PROMOTION_PROFILE",
        "promoted_content_record_id": promoted_id,
        "canonical_profile_id": canonical_profile_id,
        "authoritative_asset_count": len(asset_profiles),
        "authoritative_asset_profile_count": 1,
        "expected_brand_id": expected_brand_id or None,
        "mismatches": mismatches,
        "repair": repair,
        "verify_after_repair": [
            "Platform Outputs.Content_Profile",
            "Platform Outputs.Market_Name",
        ],
        "auto_repair_safe": True,
    }
