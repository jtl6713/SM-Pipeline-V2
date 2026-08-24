from datetime import datetime

from ap1_igs.asset import cache_busted_story_url, story_asset_url
from ap1_igs.eligibility import create_eligibility_reason, poll_eligibility_reason
from stages.registry import STAGE_NAMES, is_implemented


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def _story(**overrides):
    fields = {
        "Platform": "Instagram",
        "Platform_Output_Type": "Instagram Story",
        "Review_Status": "Approved",
        "Output_Status": "Approved for Publishing",
        "Publish_Method": "Automated",
        "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False,
        "Publish_Status": "Ready to Publish",
        "Publish_Asset_URL": "https://media.chicagoshining.com/publish/platform-output-244/story.mp4",
    }
    fields.update(overrides)
    return _record(**fields)


def _publishing(**overrides):
    fields = {
        "Platform": "Instagram",
        "Review_Status": "Approved",
        "Do_Not_Publish": False,
        "IG_Story_Status": "Publishing",
        "IG_Story_Container_ID": "17890000000000000",
    }
    fields.update(overrides)
    return _record(**fields)


def test_ap1_igs_is_registered():
    assert "ap1_igs" in STAGE_NAMES
    assert "ap1_igs_poll" in STAGE_NAMES
    assert is_implemented("ap1_igs")
    assert is_implemented("ap1_igs_poll")


def test_ap1_igs_first_class_blank_or_ready():
    assert create_eligibility_reason(_story()) is None
    assert create_eligibility_reason(_story(IG_Story_Status="Ready")) is None


def test_ap1_igs_legacy_reel_story():
    record = _record(
        Platform="Instagram",
        Platform_Output_Type="Instagram Reel",
        IG_Story_Enabled=True,
        IG_Story_Status="Ready",
        Publish_Asset_URL="https://media.chicagoshining.com/publish/platform-output-244/story.mp4",
        Review_Status="Approved",
        Do_Not_Publish=False,
    )
    assert create_eligibility_reason(record) is None
    assert create_eligibility_reason(_record(**{**record["fields"], "IG_Story_Enabled": False})) == (
        "legacy_reel_story_not_ready"
    )


def test_ap1_igs_create_gates():
    assert create_eligibility_reason(_story(Platform="Facebook")) == "not_instagram"
    assert create_eligibility_reason(_story(Platform_Output_Type="Instagram Reel")) == (
        "legacy_reel_story_not_ready"
    )
    assert create_eligibility_reason(_story(Review_Status="Pending")) == "review_not_approved"
    assert create_eligibility_reason(_story(Auto_Publish_Enabled=False)) == "auto_publish_disabled"
    assert create_eligibility_reason(_story(IG_Story_Container_ID="1789")) == "already_has_story_container"
    assert create_eligibility_reason(_story(IG_Story_Status="Publishing")) == "story_status_not_ready"
    assert create_eligibility_reason({"id": "", "fields": {}}) == "missing_record_id"


def test_ap1_igs_replace_fields_must_match():
    record = _story(Replace_Transaction_ID="txn-1", Replace_Fingerprint="fp-1")
    assert create_eligibility_reason(record) == "replace_transaction_mismatch"
    assert create_eligibility_reason(record, replace_transaction_id="txn-1") == "replace_fingerprint_mismatch"
    assert create_eligibility_reason(record, replace_transaction_id="txn-1", replace_fingerprint="fp-1") is None


def test_ap1_igs_prefers_story_asset_url():
    record = _story(IG_Story_Asset_URL="https://media.chicagoshining.com/story-only.mp4")
    assert story_asset_url(record) == "https://media.chicagoshining.com/story-only.mp4"
    url = cache_busted_story_url(record, datetime(2026, 8, 24, 15, 1, 0))
    assert url.startswith("https://media.chicagoshining.com/story-only.mp4?")
    assert "v=20260824150100" in url


def test_ap1_igs_poll_gates():
    assert poll_eligibility_reason(_publishing()) is None
    assert poll_eligibility_reason(_publishing(IG_Story_Status="Ready")) == "story_status_not_publishing"
    assert poll_eligibility_reason(_publishing(IG_Story_Container_ID="")) == "missing_story_container"
    assert poll_eligibility_reason(_publishing(IG_Story_Post_ID="1801")) == "already_has_story_post"
    record = _publishing(Replace_Transaction_ID="txn-1")
    assert poll_eligibility_reason(record) == "replace_transaction_mismatch"
    assert poll_eligibility_reason(record, replace_transaction_id="txn-1") is None
