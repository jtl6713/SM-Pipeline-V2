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
    assert is_eligible(_eligible(
        Publish_Status="Publishing",
        Platform_Media_ID="17890000000000000",
    ))
    assert eligibility_reason(_eligible(Publish_Status="Publishing")) == "publish_status_not_ready"


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
    assert "thumb_offset" not in body
    optional = reel_create_body(record, require_native_cover=False)
    assert optional["thumb_offset"] == 1500


def test_ap1_ig_render_review_owned_hold_blocks_even_after_legacy_hold_cleared():
    assert eligibility_reason(_eligible(
        Do_Not_Publish=False,
        Studio_Render_Review_Hold_Active=True,
    )) == "render_review_hold"
    assert eligibility_reason(_eligible(
        Do_Not_Publish=False,
        Studio_Render_Review_Hold_Active=False,
        Studio_Render_Review_Hold_ID="rrhold-00000001",
    )) == "render_review_hold"
    assert eligibility_reason(_eligible(
        Do_Not_Publish=False,
        Studio_Review_Hold_ID="staging-hold-0001",
    )) == "render_review_hold"


def test_ap1_ig_review_hold_blocks_existing_container_resume():
    blocked = _eligible(
        Do_Not_Publish=False,
        Publish_Status="Publishing",
        Platform_Media_ID="17890000000000000",
        Studio_Render_Review_Hold_ID="rrhold-00000001",
    )
    assert eligibility_reason(blocked) == "render_review_hold"
    assert not is_eligible(blocked)


def test_ap1_ig_absent_review_fields_preserve_existing_publish_eligibility():
    assert eligibility_reason(_eligible(
        Studio_Render_Review_Hold_Active=False,
        Studio_Render_Review_Hold_ID="",
        Studio_Review_Hold_ID="",
    )) is None


def test_ap1_ig_guard_early_return_releases_only_owned_lock_without_requeue():
    from ap1_ig.processor import _release_preflight_lock_if_exact_owner
    now = "2026-11-02T17:01:00Z"
    class Fake:
        def __init__(self):
            self.fields = {
                "Publish_Locked_By": "AP1-IG", "Publish_Locked_At": now,
                "Last_Publish_Attempt_At": now, "Publish_Status": "Publishing",
                "Platform_Media_ID": "18127559140783117",
            }
            self.writes = []
        def get_record(self, table, record_id):
            return {"id": record_id, "fields": self.fields}
        def update_record(self, table, record_id, fields, **kwargs):
            self.writes.append(fields)

    client = Fake()
    assert _release_preflight_lock_if_exact_owner(
        client, "recABCDEFGHIJKLMN", now, reason="review_hold"
    ) is True
    update = client.writes[0]
    assert update["Publish_Locked_By"] == ""
    assert update["Publish_Locked_At"] is None
    assert update["Publish_Retry_Eligible"] is False
    assert "Publish_Status" not in update
    assert "Platform_Media_ID" not in update

def test_ap1_ig_guard_cannot_clear_changed_lock_or_published_output():
    from ap1_ig.processor import _release_preflight_lock_if_exact_owner
    now = "2026-11-02T17:01:00Z"
    class Fake:
        def __init__(self, **fields):
            self.fields = {
                "Publish_Locked_By": "AP1-IG", "Publish_Locked_At": now,
                "Last_Publish_Attempt_At": now, "Publish_Status": "Publishing",
                **fields,
            }
            self.writes = []
        def get_record(self, table, record_id):
            return {"id": record_id, "fields": self.fields}
        def update_record(self, table, record_id, patch, **kwargs):
            self.writes.append(patch)

    for patch in [
        {"Publish_Locked_At": "2026-11-02T17:30:00Z"},
        {"Publish_Locked_By": "another_runner"},
        {"Platform_Post_ID": "18168690085479740"},
        {"Published_At": "2026-11-02T17:10:00Z"},
    ]:
        client = Fake(**patch)
        assert _release_preflight_lock_if_exact_owner(
            client, "recABCDEFGHIJKLMN", now, reason="review_hold"
        ) is False
        assert client.writes == []


def test_ap1_ig_ambiguous_graph_failure_quarantines_without_erasing_container():
    from ap1_ig.processor import _mark_failed
    class Fake:
        def __init__(self):
            self.updates = []
        def update_record(self, table, record_id, fields, **kwargs):
            self.updates.append(fields)
    client = Fake()
    record = {"id": "recABCDEFGHIJKLMN", "fields": {
        "Platform_Media_ID": "18127559140783117", "Output_Notes": "",
    }}
    _mark_failed(client, record, RuntimeError("Meta response lost"),
                 remote_side_effect_possible=True)
    fields = client.updates[0]
    assert fields["Publish_Status"] == "Failed"
    assert fields["Publish_Retry_Eligible"] is False
    assert fields["Manual_Fallback_Required"] is True
    assert fields["Publish_Next_Retry_At"] is None
    assert "Platform_Media_ID" not in fields
    assert "Last_Publish_Attempt_At" not in fields
    assert "18127559140783117" in fields["Platform_Publish_Response_JSON"]


def test_ap1_ig_graph_create_timeout_without_saved_id_cannot_blind_retry():
    from ap1_ig.processor import _mark_failed
    class Fake:
        def __init__(self):
            self.updates = []
        def update_record(self, table, record_id, fields, **kwargs):
            self.updates.append(fields)
    client = Fake()
    record = {"id": "recABCDEFGHIJKLMN", "fields": {
        "Platform_Media_ID": "", "Output_Notes": "",
    }}
    _mark_failed(client, record, TimeoutError("Create response lost"),
                 remote_side_effect_possible=True)
    fields = client.updates[0]
    assert fields["Publish_Status"] == "Failed"
    assert fields["Publish_Retry_Eligible"] is False
    assert fields["Manual_Fallback_Required"] is True
    assert "Platform_Media_ID" not in fields


def test_ap1_ig_pre_graph_failure_keeps_bounded_retry_when_no_request_was_sent():
    from ap1_ig.processor import _mark_failed
    class Fake:
        def __init__(self):
            self.updates = []
        def update_record(self, table, record_id, fields, **kwargs):
            self.updates.append(fields)
    client = Fake()
    _mark_failed(client, {"id": "recABCDEFGHIJKLMN", "fields": {
        "Platform_Media_ID": "", "Output_Notes": "",
    }}, RuntimeError("Graph configuration unavailable"),
                 remote_side_effect_possible=False)
    fields = client.updates[0]
    assert fields["Publish_Status"] == "Ready to Publish"
    assert fields["Publish_Retry_Eligible"] is True
    assert fields["Platform_Media_ID"] == ""


def test_ap1_ig_guard_cleanup_accepts_airtable_millisecond_utc_echo():
    from ap1_ig.processor import _release_preflight_lock_if_exact_owner

    lock_stamp = "2026-11-02T17:01:00Z"
    class Fake:
        def __init__(self, changed=False):
            self.fields = {
                "Publish_Locked_By": "AP1-IG",
                "Publish_Locked_At": "2026-11-02T17:01:00.000Z",
                "Last_Publish_Attempt_At":
                    "2026-11-02T17:01:00.000+00:00",
                "Publish_Status": "Publishing",
                "Platform_Media_ID": "18127559140783117",
            }
            if changed:
                self.fields["Publish_Locked_At"] = "2026-11-02T17:01:01.000Z"
            self.writes = []
        def get_record(self, table, record_id):
            return {"id": record_id, "fields": self.fields}
        def update_record(self, table, record_id, patch, **kwargs):
            self.writes.append(patch)

    client = Fake()
    assert _release_preflight_lock_if_exact_owner(
        client, "recABCDEFGHIJKLMN", lock_stamp, reason="review_hold"
    ) is True
    assert len(client.writes) == 1
    assert client.writes[0]["Publish_Locked_By"] == ""
    assert "Platform_Media_ID" not in client.writes[0]

    moved = Fake(changed=True)
    assert _release_preflight_lock_if_exact_owner(
        moved, "recABCDEFGHIJKLMN", lock_stamp, reason="review_hold"
    ) is False
    assert moved.writes == []
