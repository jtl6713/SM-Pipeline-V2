"""Regression checks for issue #2556 (Facebook output 10738)."""

import json

from fb import assets, fb0


OUTPUT_REC = "recABCDEFGHIJKLMN"


def manifest(location="Echo-Park"):
    return [
        {
            "order": i,
            "url": f"https://media.chicagoshining.com/studio/previews/lettered/{OUTPUT_REC}/{i-1}.jpg",
            "assetName": f"{location}-{i}__4x5__fill-crop-v2.jpg",
            "googleDriveFileId": f"1SampleDriveImageFileNumber{i:02d}abcdefgh",
            "mediaAssetRecordId": f"recSampleAsset{i:02d}AB",
        }
        for i in range(1, 5)
    ]


def output(clips=None):
    return {
        "id": OUTPUT_REC,
        "fields": {
            "Platform": "Facebook",
            "Platform_Output_Type": "Facebook Photo Set",
            "Studio_Output_Type": "Multi-Image Post",
            "Output_ID": "10738",
            "Output_Title": "Echo Park Golden Hour",
            "Output_Caption": "Echo Park lake and swan boats at sunset.",
            "Review_Status": "Approved",
            "Image_Count": 4,
            "Render_Clip_List_JSON": json.dumps(clips if clips is not None else manifest()),
        },
    }


class Client:
    def __init__(self):
        self.created = []
        self.updates = []

    def list_records(self, *_args, **_kwargs):
        return []

    def create_records(self, _table, rows, **_kwargs):
        self.created = [{"id": "recTestSlide" + str(i).zfill(4), "fields": row}
                        for i, row in enumerate(rows)]
        return self.created

    def update_record(self, _table, _rec_id, fields, **_kwargs):
        self.updates.append(fields)
        return {"fields": fields}

    def get_record(self, *_args):
        return self.output


def test_complete_matching_manifest_reconstructs_four_verified_linked_slides(monkeypatch):
    client = Client()
    monkeypatch.setattr(assets, "list_ready_slides", lambda *_a, **_kw: client.created)
    checked = []
    result = assets.recover_missing_photo_slides(
        client, output(), 4,
        verify_url=lambda url: checked.append(url) or True,
    )
    assert result == {"created": 4, "reason": "recovered_verified_manifest"}
    assert len(checked) == 4
    assert [row["fields"]["Current Order"] for row in client.created] == [1, 2, 3, 4]
    assert all(row["fields"]["Platform Output"] == [OUTPUT_REC] for row in client.created)
    assert all(row["fields"]["Shared_Asset_Approved"] is True for row in client.created)


def test_runyon_images_are_not_linked_to_echo_park_post():
    client = Client()
    called = []
    result = assets.recover_missing_photo_slides(
        client, output(manifest("Runyon-Canyon-Park")), 4,
        verify_url=lambda url: called.append(url) or True,
    )
    assert result == {"created": 0, "reason": "source_location_mismatch"}
    assert not client.created and not called


def test_incomplete_or_inaccessible_manifest_never_marks_assets_ready():
    for clips in (manifest()[:3], manifest()[::-1]):
        client = Client()
        result = assets.recover_missing_photo_slides(
            client, output(clips), 4, verify_url=lambda url: True,
        )
        assert result["created"] == 0
        assert not client.created

    client = Client()
    result = assets.recover_missing_photo_slides(
        client, output(), 4, verify_url=lambda url: False,
    )
    assert result == {"created": 0, "reason": "public_4x5_image_preflight_failed"}
    assert not client.created


def test_existing_linked_slide_is_not_duplicated():
    client = Client()
    client.list_records = lambda *_a, **_kw: [{"fields": {"Platform Output": [OUTPUT_REC]}}]
    result = assets.recover_missing_photo_slides(
        client, output(), 4, verify_url=lambda url: True,
    )
    assert result == {"created": 0, "reason": "linked_slides_already_exist"}
    assert not client.created


def test_fb0_repairs_missing_multi_photo_mode(monkeypatch):
    rec = output()
    rec["fields"].update({
        "Auto_Publish_Enabled": True,
        "Image_Output_Selected": True,
        "FB_Publish_Status": "Ready for Assets",
        "Publish_Attempt_Count": 0,
    })
    client = Client()
    client.output = rec
    monkeypatch.setattr(fb0, "AirtableClient", lambda: client)
    monkeypatch.setattr(
        fb0, "PipelineSettings",
        lambda _c: type("Settings", (), {"get": lambda _self, key: {"FB_MAX_PHOTOS": 10, "FB_IMAGE_STAGE_MAX_RETRIES": 3}.get(key)})(),
    )
    monkeypatch.setattr(fb0, "list_ready_slides", lambda *_a, **_kw: [
        {
            "id": f"recSlideSample{i:02d}AB",
            "fields": {
                "Current Order": i, "Slide Number": i,
                "Shared_Asset_Revision": f"rev-{i}",
                "Asset_4x5_Public_URL": manifest()[i-1]["url"],
            },
        } for i in range(1, 5)
    ])
    result = fb0.process_request(output_record_id=OUTPUT_REC)
    assert result["photo_publish_mode_repaired"] is True
    assert result["slideshow_route"] is False
    assert result["fb_publish_status"] == "Ready for Photo Media"
    assert any(x.get("FB_Resolved_Publish_Mode") == "Multi-Photo Collage" for x in client.updates)
