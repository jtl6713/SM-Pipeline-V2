from quality_agent.signatures import (
    PROMOTED_PROFILE_DRIFT,
    TIKTOK_DUPLICATE_SLIDES,
    detect_promoted_profile_drift,
    detect_tiktok_duplicate_slides,
)


def test_detect_tiktok_duplicate_slides_signature():
    result = detect_tiktok_duplicate_slides(
        actual=14,
        expected=7,
        stamped_urls=[f"https://media.chicagoshining.com/{i}.jpg" for i in range(7)],
    )
    assert result is not None
    assert result["id"] == TIKTOK_DUPLICATE_SLIDES
    assert result["duplicate_factor"] == 2
    assert result["auto_repair_safe"] is True


def test_duplicate_signature_requires_authoritative_manifest():
    assert detect_tiktok_duplicate_slides(actual=14, expected=7, stamped_urls=[]) is None
    assert detect_tiktok_duplicate_slides(
        actual=13,
        expected=7,
        stamped_urls=[f"https://media.chicagoshining.com/{i}.jpg" for i in range(7)],
    ) is None


def test_detect_promoted_profile_drift_from_unanimous_authoritative_assets():
    chicago_profile = "recT2rbKX3MF7cVFU"
    nyc_profile = "recgtK8Z7eNADNtVy"
    chicago_brand = "recjLbnpXhVnqHBgG"
    nyc_brand = "recZ8UCeKTp1XVZWq"

    result = detect_promoted_profile_drift(
        candidate_status="Promoted",
        promoted_content_record_id="recSwEkA30M355CRB",
        authoritative_asset_profile_ids=[nyc_profile] * 7,
        candidate_profile_ids=[chicago_profile],
        content_profile_ids=[chicago_profile],
        production_brand_ids=[chicago_brand],
        production_output_brand_ids=[chicago_brand],
        profile_to_brand={nyc_profile: nyc_brand},
    )

    assert result is not None
    assert result["id"] == PROMOTED_PROFILE_DRIFT
    assert result["canonical_profile_id"] == nyc_profile
    assert result["expected_brand_id"] == nyc_brand
    assert result["authoritative_asset_count"] == 7
    assert result["auto_repair_safe"] is True
    assert result["repair"]["Idea Candidate.Content_Profile"] == [nyc_profile]
    assert result["repair"]["Content Item.Content_Profile"] == [nyc_profile]
    assert result["repair"]["Production Request.Brand"] == [nyc_brand]
    assert result["repair"]["Production Request Outputs.Brand"] == [nyc_brand]


def test_promoted_profile_drift_refuses_mixed_or_missing_asset_authority():
    kwargs = dict(
        candidate_status="Promoted",
        promoted_content_record_id="recPromoted1234567",
        candidate_profile_ids=["recChicago123456"],
        content_profile_ids=["recChicago123456"],
    )
    assert detect_promoted_profile_drift(
        authoritative_asset_profile_ids=[],
        **kwargs,
    ) is None
    assert detect_promoted_profile_drift(
        authoritative_asset_profile_ids=["recNyc1234567890", "recChicago123456"],
        **kwargs,
    ) is None


def test_promoted_profile_drift_does_not_fire_when_chain_matches_assets():
    nyc_profile = "recgtK8Z7eNADNtVy"
    nyc_brand = "recZ8UCeKTp1XVZWq"
    assert detect_promoted_profile_drift(
        candidate_status="Promoted",
        promoted_content_record_id="recCorrect12345678",
        authoritative_asset_profile_ids=[nyc_profile] * 4,
        candidate_profile_ids=[nyc_profile],
        content_profile_ids=[nyc_profile],
        production_brand_ids=[nyc_brand],
        production_output_brand_ids=[nyc_brand],
        profile_to_brand={nyc_profile: nyc_brand},
    ) is None
