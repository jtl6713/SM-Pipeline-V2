"""P1 #2464: a missing ordered 9:16 photo set is an asset repair, not a retry loop."""
from __future__ import annotations

from ttd import ttd0


def test_ttd0_zero_ready_slides_parks_without_timed_retry(monkeypatch):
    record_id = "recABCDEFGHIJKLMN"
    output = {
        "id": record_id,
        "fields": {
            "Platform": "TikTok",
            "Output_ID": "9941",
            "Auto_Publish_Enabled": True,
            "Do_Not_Publish": False,
            "TikTok_Draft_Status": "Ready for Assets",
            "Publish_Attempt_Count": 4,
            "Image_Output_Selected": True,
            "Image_Publish_Mode": "TikTok Draft",
            "Asset_Aspect_Family": "9:16",
            "Image_Output_Type": "Photo Carousel",
            "Image_Count": 4,
        },
    }

    class FakeClient:
        def __init__(self):
            self.updates = []

        def get_record(self, table_id, requested_id):
            assert requested_id == record_id
            return output

        def update_record(self, table_id, requested_id, fields, **kwargs):
            assert requested_id == record_id
            self.updates.append(dict(fields))
            return {"id": requested_id, "fields": dict(fields)}

    client = FakeClient()
    monkeypatch.setattr(ttd0, "AirtableClient", lambda: client)
    monkeypatch.setattr(ttd0, "PipelineSettings", lambda _: type("Settings", (), {"get": lambda self, key: None})())
    monkeypatch.setattr(ttd0, "list_ready_slides", lambda *_args, **_kwargs: [])

    result = ttd0.process_request(output_record_id=record_id)

    assert result["processed"] is True
    assert result["reason"] == "asset_repair_required"
    assert result["retry"] is False
    assert result["needs_asset_repair"] is True
    assert result["slide_count"] == 0
    assert result["expected_image_count"] == 4

    assert len(client.updates) == 2
    started, parked = client.updates
    assert started["Publish_Attempt_Count"] == 5  # history preserved, never reset
    assert parked["Publish_Status"] == "Failed"
    assert parked["TikTok_Draft_Status"] == "Retry Pending"
    assert parked["Publish_Error_Stage"] == "TTD0_ASSETS"
    assert parked["Publish_Next_Retry_At"] is None
    assert parked["Publish_Retry_Eligible"] is False
    assert parked["TikTok_Draft_Assets_JSON"] == ""
    assert "explicitly rearmed" in parked["Output_Notes"]
    # There is no TikTok create/upload callback in this path.


def test_ttd0_existing_dnp_hold_prohibits_any_write(monkeypatch):
    output = {"id": "recABCDEFGHIJKLMN", "fields": {
        "Platform": "TikTok", "Auto_Publish_Enabled": False,
        "Do_Not_Publish": True, "TikTok_Draft_Status": "Retry Pending",
        "Publish_Error_Stage": "TTD0_ASSETS", "Publish_Retry_Eligible": False,
    }}

    class FakeClient:
        def get_record(self, *_args):
            return output

        def update_record(self, *_args, **_kwargs):
            raise AssertionError("a held output must never be mutated by TTD0")

    monkeypatch.setattr(ttd0, "AirtableClient", FakeClient)
    result = ttd0.process_request(output_record_id=output["id"])
    assert result["processed"] is False
    assert result["reason"] == "auto_publish_disabled"
