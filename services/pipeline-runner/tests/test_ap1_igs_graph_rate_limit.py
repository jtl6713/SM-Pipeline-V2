"""Regression: Meta Graph throttling while polling an EXISTING Instagram Story.

All cases are pure/mocked: no Airtable, Supabase or Meta requests.
"""
from datetime import datetime, timezone

from ap1_ig.graph import InstagramGraphError
from ap1_igs.eligibility import poll_eligibility_reason
from ap1_igs.poll import _mark_story_poll_rate_limited
from ap1_igs.rate_limit import (
    RATE_LIMIT_STAGE,
    graph_container_poll_rate_limited,
    next_story_poll_retry_at,
    story_poll_cooldown_reason,
)


def test_meta_error_four_is_a_rate_limit_not_terminal_container_failure():
    response = {"error": {"code": 4, "type": "OAuthException", "message": "(#4) Application request limit reached"}}
    assert graph_container_poll_rate_limited(response)
    assert graph_container_poll_rate_limited(
        InstagramGraphError("container status error", status_code="ERROR", status=str(response))
    )
    assert graph_container_poll_rate_limited({"error": {"code": 17, "message": "user rate limit"}})
    assert not graph_container_poll_rate_limited({"status_code": "ERROR", "status": "media processing failed"})
    assert not graph_container_poll_rate_limited({"error": {"code": 190, "message": "invalid access token"}})
    assert not graph_container_poll_rate_limited({"status_code": "FINISHED"})


def test_existing_longer_cooldown_is_preserved():
    clock = datetime(2026, 11, 20, 21, 0, tzinfo=timezone.utc)
    assert next_story_poll_retry_at(None, now=clock) == "2026-11-20T22:00:00Z"
    assert next_story_poll_retry_at("2026-11-20T23:00:00Z", now=clock) == "2026-11-20T23:00:00Z"
    assert next_story_poll_retry_at("2026-11-20T20:00:00Z", now=clock) == "2026-11-20T22:00:00Z"


def test_cooldown_prevents_any_existing_container_get_until_elapsed():
    now = datetime(2026, 11, 20, 21, 0, tzinfo=timezone.utc)
    assert story_poll_cooldown_reason(RATE_LIMIT_STAGE, "2026-11-20T22:00:00Z", now=now) == "story_poll_rate_limited"
    assert story_poll_cooldown_reason(RATE_LIMIT_STAGE, "2026-11-20T20:00:00Z", now=now) is None
    assert story_poll_cooldown_reason(RATE_LIMIT_STAGE, None, now=now) == "story_poll_cooldown_timestamp_invalid"
    assert story_poll_cooldown_reason("AP1_IGS_PUBLISHED_UNVERIFIED", None, now=now) is None


def test_native_poll_eligibility_honors_cooldown_and_never_creates_another_container():
    base = {
        "Platform": "Instagram",
        "Review_Status": "Approved",
        "IG_Story_Status": "Publishing",
        "IG_Story_Container_ID": "18115349108139610",
        "Do_Not_Publish": False,
        "Publish_Error_Stage": RATE_LIMIT_STAGE,
        "Publish_Next_Retry_At": "2099-01-01T00:00:00Z",
    }
    row = {"id": "recABCDEFGHIJKLMN", "fields": base}
    assert poll_eligibility_reason(row) == "story_poll_rate_limited"
    row["fields"]["Publish_Next_Retry_At"] = "2020-01-01T00:00:00Z"
    assert poll_eligibility_reason(row) is None
    row["fields"]["Do_Not_Publish"] = True
    assert poll_eligibility_reason(row) == "do_not_publish"


class _CaptureClient:
    def __init__(self):
        self.calls = []

    def update_record(self, table, record_id, fields, **kwargs):
        self.calls.append((table, record_id, fields, kwargs))


def test_rate_limit_recovery_only_stamps_existing_container_and_preserves_identity():
    client = _CaptureClient()
    row = {"id": "recABCDEFGHIJKLMN", "fields": {
        "IG_Story_Container_ID": "18115349108139610",
        "IG_Story_Status": "Publishing",
        "Publish_Next_Retry_At": "2099-01-01T00:00:00Z",
        "Output_Notes": "existing approved output",
        "Platform_Post_ID": "",
    }}
    _mark_story_poll_rate_limited(client, row)
    assert len(client.calls) == 1
    fields = client.calls[0][2]
    assert fields["IG_Story_Status"] == "Publishing"
    assert fields["Publish_Error_Stage"] == RATE_LIMIT_STAGE
    assert fields["Publish_Next_Retry_At"] == "2099-01-01T00:00:00Z"
    assert "18115349108139610" in fields["IG_Story_Error_Message"]
    for denied in ("IG_Story_Container_ID", "IG_Story_Post_ID", "Platform_Post_ID",
                   "Published_At", "Publish_Status", "Output_Status", "Publish_Retry_Eligible",
                   "Studio_Publish_Dispatch_Count", "Do_Not_Publish"):
        assert denied not in fields, denied


def test_native_poll_does_not_publish_on_throttled_or_unknown_status(monkeypatch):
    import ap1_igs.poll as native
    for graph_reply, expected_reason in [
        ({"error": {"code": 4, "message": "(#4) Application request limit reached"}}, "graph_container_rate_limited"),
        ({}, "container_not_confirmed_finished"),
    ]:
        client = _CaptureClient()
        record = {"id": "recABCDEFGHIJKLMN", "fields": {
            "Platform": "Instagram",
            "Review_Status": "Approved",
            "Do_Not_Publish": False,
            "IG_Story_Status": "Publishing",
            "IG_Story_Container_ID": "18115349108139610",
        }}
        client.get_record = lambda table, record_id: record

        class FakeGraph:
            def wait_for_container(self, container):
                assert container == "18115349108139610"
                return graph_reply

            def publish(self, container):
                raise AssertionError("media_publish must never run without verified FINISHED")

        monkeypatch.setattr(native, "AirtableClient", lambda: client)
        monkeypatch.setattr(native, "PipelineSettings", lambda value: {})
        monkeypatch.setattr(native, "load_instagram_graph_settings",
                            lambda settings, output, client: {"ig_user_id": "1", "token": "fake", "version": "v26.0"})
        monkeypatch.setattr(native, "InstagramReelClient", lambda **kwargs: FakeGraph())
        result = native.process_request(output_record_id=record["id"], wait=True)
        assert result["reason"] == expected_reason
        assert result.get("post_id") is None
        assert len(client.calls) == 1
        assert "Published_At" not in client.calls[0][2]
        assert "IG_Story_Post_ID" not in client.calls[0][2]
