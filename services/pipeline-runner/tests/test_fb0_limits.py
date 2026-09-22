from fb import fb0
from fb.constants import STATUS_MANUAL_FALLBACK, STATUS_READY_FOR_PHOTO


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


class FakeClient:
    def __init__(self, output):
        self.output = output
        self.updates = []

    def get_record(self, table, record_id):
        return self.output

    def update_record(self, table, record_id, fields, typecast=False):
        self.updates.append(dict(fields))
        self.output["fields"].update(fields)
        return self.output


class FakeSettings:
    def __init__(self, values):
        self.values = values

    def get(self, key, default=None):
        return self.values.get(key, default)


def _ready_slides(count):
    return [
        {
            "id": f"recSLIDE{i:02d}ABCDEFG",
            "fields": {
                "Current Order": i,
                "Slide Number": i,
                "Shared_Asset_Revision": f"rev-{i}",
                "Asset_4x5_Public_URL": f"https://media.example/{i}.jpg",
            },
        }
        for i in range(1, count + 1)
    ]


def test_fb0_caps_oversized_package_and_routes_multi_photo(monkeypatch):
    output = _record(
        Platform="Facebook",
        Auto_Publish_Enabled=True,
        Image_Output_Selected=True,
        FB_Publish_Status="Ready for Assets",
        FB_Image_Publish_Mode="Single Photo",
        FB_Resolved_Publish_Mode="Single Photo",
        Output_ID="594",
        Image_Count=15,
        Publish_Attempt_Count=0,
    )
    client = FakeClient(output)
    monkeypatch.setattr(fb0, "AirtableClient", lambda: client)
    monkeypatch.setattr(fb0, "PipelineSettings", lambda _client: FakeSettings({
        "FB_MAX_PHOTOS": 10,
        "FB_IMAGE_STAGE_MAX_RETRIES": 3,
    }))
    monkeypatch.setattr(fb0, "list_ready_slides", lambda *_args, **_kwargs: _ready_slides(10))

    result = fb0.process_request(output_record_id=output["id"])

    assert result["processed"] is True
    assert result["image_count_capped"] is True
    assert result["requested_image_count"] == 15
    assert result["expected_image_count"] == 10
    assert result["fb_publish_status"] == STATUS_READY_FOR_PHOTO
    assert any(update.get("Image_Count") == 10 for update in client.updates)
    assert any(update.get("FB_Image_Publish_Mode") == "Multi-Photo Collage" for update in client.updates)


def test_fb0_stops_retrying_after_configured_limit(monkeypatch):
    output = _record(
        Platform="Facebook",
        Auto_Publish_Enabled=True,
        Image_Output_Selected=True,
        FB_Publish_Status="Ready for Assets",
        FB_Image_Publish_Mode="Multi-Photo Collage",
        Output_ID="594",
        Image_Count=5,
        Publish_Attempt_Count=2,
    )
    client = FakeClient(output)
    monkeypatch.setattr(fb0, "AirtableClient", lambda: client)
    monkeypatch.setattr(fb0, "PipelineSettings", lambda _client: FakeSettings({
        "FB_MAX_PHOTOS": 10,
        "FB_IMAGE_STAGE_MAX_RETRIES": 3,
    }))
    monkeypatch.setattr(fb0, "list_ready_slides", lambda *_args, **_kwargs: _ready_slides(3))

    result = fb0.process_request(output_record_id=output["id"])

    assert result["processed"] is True
    assert result["retry"] is False
    assert result["reason"] == "asset_mismatch_retry_exhausted"
    final = client.updates[-1]
    assert final["FB_Publish_Status"] == STATUS_MANUAL_FALLBACK
    assert final["Publish_Retry_Eligible"] is False
    assert final["Publish_Next_Retry_At"] is None
    assert final["Manual_Fallback_Required"] is True
