"""Regression: recording an existing public TikTok post is not a new publish."""
from ttd import ttd4


RECORD_ID = "recABCDEFGHIJKLMN"
LIVE_URL = "https://www.tiktok.com/t/ZTftJ6qmM/"


class MemoryAirtable:
    def __init__(self, **fields):
        self.record = {"id": RECORD_ID, "fields": {
            "Platform": "TikTok",
            "Output_ID": 3129,
            "TikTok_Draft_Type": "Video",
            "TikTok_Manual_Completion_Token": "token-for-test",
            "TikTok_Draft_Status": "Draft Delivered — Manual Action Required",
            "Manual_Completion_Status": "Required",
            "Do_Not_Publish": True,
            **fields,
        }}
        self.patches = []

    def get_record(self, table, record_id):
        assert record_id == RECORD_ID
        return self.record

    def update_record(self, table, record_id, fields):
        assert record_id == RECORD_ID
        self.patches.append(fields)
        self.record["fields"].update(fields)
        return self.record


def test_held_delivered_video_can_record_manual_publication_atomically(monkeypatch):
    client = MemoryAirtable()
    monkeypatch.setattr(ttd4, "AirtableClient", lambda: client)
    result = ttd4.process_request(
        output_record_id=RECORD_ID,
        action="submit",
        token="token-for-test",
        platform_post_url=LIVE_URL,
        music_completed="not_requested",
    )
    assert result["published"] is True
    assert result["http_status"] == 200
    assert len(client.patches) == 1  # no new TikTok init / draft / post
    updated = client.patches[0]
    assert updated["Do_Not_Publish"] is False
    assert updated["Platform_Post_URL"] == LIVE_URL
    assert updated["Manual_Published_URL"] == LIVE_URL
    assert updated["Manual_Completion_Status"] == "Completed"
    assert updated["Publish_Status"] == "Published"
    assert updated["Output_Status"] == "Published"
    assert updated["TikTok_Draft_Status"] == "Published"
    assert updated["Publish_Retry_Eligible"] is False


def test_hold_still_blocks_premature_completion(monkeypatch):
    client = MemoryAirtable(Manual_Completion_Status="")
    monkeypatch.setattr(ttd4, "AirtableClient", lambda: client)
    result = ttd4.process_request(
        output_record_id=RECORD_ID,
        action="submit", token="token-for-test", platform_post_url=LIVE_URL,
    )
    assert result["processed"] is False
    assert result["reason"] == "do_not_publish"
    assert result["http_status"] == 409
    assert client.patches == []


def test_invalid_token_still_cannot_override_hold(monkeypatch):
    client = MemoryAirtable()
    monkeypatch.setattr(ttd4, "AirtableClient", lambda: client)
    result = ttd4.process_request(
        output_record_id=RECORD_ID,
        action="submit", token="wrong-token", platform_post_url=LIVE_URL,
    )
    assert result["processed"] is False
    assert result["reason"] == "token_mismatch"
    assert client.patches == []
