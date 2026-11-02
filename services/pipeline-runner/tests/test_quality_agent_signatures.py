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

from quality_agent.signatures import IG_STALE_UPLOAD, detect_ig_stale_upload

def _ig_row(**overrides):
    fields = {
        "Output_ID": 9289, "Platform": "Instagram",
        "Platform_Output_Type": "Instagram Reel",
        "Publish_Status": "Publishing", "Publish_Locked_By": "AP1-IG",
        "Publish_Locked_At": "2026-11-02T15:00:00Z",
        "Last_Publish_Attempt_At": "2026-11-02T15:01:00Z",
        "Review_Status": "Approved", "Output_Status": "Approved for Publishing",
        "Publish_Method": "Automated", "Auto_Publish_Enabled": True,
    }
    fields.update(overrides)
    return {"id": "recDaOnGoHG9p819j", "fields": fields}

_NOW = "2026-11-02T16:00:00Z"

def test_ig_stale_detects_orphan_and_requires_provider_preflight():
    hit = detect_ig_stale_upload(_ig_row(), now_utc=_NOW)
    assert hit["id"] == IG_STALE_UPLOAD
    assert hit["age_seconds"] == 3540
    assert hit["auto_repair_safe"] is False
    assert "MAE_atomic_reservation" in hit["requires"]

def test_ig_stale_heartbeat_and_live_lease_prevent_recovery():
    assert detect_ig_stale_upload(_ig_row(), now_utc=_NOW,
        runner_heartbeat_utc="2026-11-02T15:59:00Z") is None
    assert detect_ig_stale_upload(_ig_row(), now_utc=_NOW,
        runner_lease_expires_utc="2026-11-02T16:10:00Z") is None

def test_ig_stale_never_releases_hold_or_cooldown():
    for field, value in [
        ("Do_Not_Publish", True), ("Studio_Render_Review_Hold_ID", "hold"),
        ("Test_Run_ID", "test"), ("Replace_Transaction_ID", "replacement"),
        ("Published_At", "2026-11-02T15:30:00Z"),
        ("Publish_Next_Retry_At", "2026-11-02T16:10:00Z")]:
        assert detect_ig_stale_upload(_ig_row(**{field: value}), now_utc=_NOW) is None

def test_ig_stale_requires_age_and_valid_timestamp():
    assert detect_ig_stale_upload(_ig_row(), now_utc="2026-11-02T15:20:00Z") is None
    assert detect_ig_stale_upload(_ig_row(Publish_Locked_At=None), now_utc=_NOW) is None

def test_ig_saved_container_must_reconcile_not_recreate():
    result = detect_ig_stale_upload(
        _ig_row(Platform_Media_ID="18127559140783117"), now_utc=_NOW)
    assert result["remote_identity_saved"] is True
    assert result["action"] == "verify_existing_provider_post"
    assert result["auto_repair_safe"] is False
