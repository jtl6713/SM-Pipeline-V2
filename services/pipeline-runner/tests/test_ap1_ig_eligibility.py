from datetime import datetime

from ap1_ig.caption import cache_busted_video_url, graph_caption, reel_create_body
from ap1_ig.eligibility import eligibility_reason, is_eligible
from stages.registry import STAGE_NAMES, is_implemented


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def _eligible(**overrides):
    fields = {
        "Platform": "Instagram",
        "Platform_Output_Type": "Instagram Reel",
        "Review_Status": "Approved",
        "Output_Status": "Approved for Publishing",
        "Publish_Method": "Automated",
        "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False,
        "Publish_Status": "Ready to Publish",
        "Publish_Asset_URL": "https://media.chicagoshining.com/publish/platform-output-243/file.mp4",
        "Output_Caption": "Night walk",
        "Output_Hashtags": "#chicago",
        "Thumbnail_URL": "https://media.chicagoshining.com/studio/previews/cover.jpg",
    }
    fields.update(overrides)
    return _record(**fields)


def test_ap1_ig_is_registered():
    assert "ap1_ig" in STAGE_NAMES
    assert is_implemented("ap1_ig")
    assert is_implemented("publish_ig")


def test_ap1_ig_eligible_reel():
    assert is_eligible(_eligible())
    assert eligibility_reason(_eligible()) is None


def test_ap1_ig_gate_failures():
    assert eligibility_reason(_eligible(Platform="Facebook")) == "not_instagram"
    assert eligibility_reason(_eligible(Platform_Output_Type="Instagram Story")) == "not_instagram_reel"
    assert eligibility_reason(_eligible(Review_Status="Pending")) == "review_not_approved"
    assert eligibility_reason(_eligible(Auto_Publish_Enabled=False)) == "auto_publish_disabled"
    assert eligibility_reason(_eligible(Do_Not_Publish=True)) == "do_not_publish"
    assert eligibility_reason(_eligible(Published_At="2026-08-24T00:00:00.000Z")) == "already_published"
    assert eligibility_reason(_eligible(Publish_Asset_URL="")) == "missing_publish_asset_url"
    assert eligibility_reason(_eligible(Platform_Post_ID="1789")) == "already_has_platform_post"
    assert eligibility_reason({"id": "", "fields": {}}) == "missing_record_id"


def test_ap1_ig_replace_fields_must_match_request():
    record = _eligible(Replace_Transaction_ID="txn-1", Replace_Fingerprint="fp-1")
    assert eligibility_reason(record) == "replace_transaction_mismatch"
    assert eligibility_reason(record, replace_transaction_id="txn-1") == "replace_fingerprint_mismatch"
    assert eligibility_reason(record, replace_transaction_id="txn-1", replace_fingerprint="fp-1") is None


def test_ap1_ig_caption_and_cover():
    record = _eligible()
    assert graph_caption(record) == "Night walk\n\n#chicago"
    now = datetime(2026, 8, 24, 13, 40, 0)
    url = cache_busted_video_url(record, now)
    assert url.startswith("https://media.chicagoshining.com/publish/platform-output-243/file.mp4?")
    assert "v=20260824134000" in url
    body = reel_create_body(record, now)
    assert body["media_type"] == "REELS"
    assert body["share_to_feed"] is True
    assert "thumb_offset" not in body
    assert body["cover_url"].endswith("cover.jpg")
    assert body["caption"] == "Night walk\n\n#chicago"


def test_ap1_ig_drive_thumbnail_is_not_graph_cover():
    record = _eligible(Thumbnail_URL="https://drive.google.com/uc?id=13rIboxRJt50N9SWX12vfh2CBc4Jp6pMa")
    body = reel_create_body(record)
    assert "cover_url" not in body
    assert body["thumb_offset"] == 1500
