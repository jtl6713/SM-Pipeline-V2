import json

from fb.assets import canonical_doubled_slide_repair
from fb import fb1


def _source(n):
    return f"1GoogleDriveSource{n:02d}abcdefghijk"


def _record_id(n):
    return "rec" + str(n).zfill(14)


def _url(output_rec_id, index):
    return f"https://media.chicagoshining.com/studio/previews/lettered/{output_rec_id}/{index}.jpg"


def _doubled_fixture(*, tamper_drive=False, missing_approval=False):
    output_id = _record_id(987)
    manifest = [
        {
            "order": n,
            "googleDriveFileId": _source(n),
            "mediaAssetRecordId": _record_id(n),
            "url": _url(output_id, n - 1),
        }
        for n in range(1, 5)
    ]
    parent = {
        "id": output_id,
        "fields": {
            "Render_Clip_List_JSON": json.dumps(manifest),
            "Image_Count": 4,
        },
    }
    slides = []
    for n in range(1, 5):
        for copy in (0, 1):
            # The first order-two source URL is deliberately wrong. Neither
            # row matches the approved /1.jpg, but their Drive IDs both do.
            image_index = n - 1 if n != 2 else n + copy
            source = _source(n)
            if tamper_drive and n == 2 and copy == 1:
                source = "1DifferentGoogleDriveSource"
            slides.append({
                "id": _record_id(n * 10 + copy),
                "fields": {
                    "Current Order": n,
                    "Slide Number": n,
                    "Platform Output": [output_id],
                    "Asset_4x5_File_URL": f"https://drive.google.com/file/d/{source}/view?usp=drivesdk",
                    "Asset_4x5_Public_URL": _url(output_id, image_index),
                    "Asset_4x5_Public_Status": "Ready",
                    "Shared_Asset_Approved": True,
                    "Review Status": "Changes Requested" if missing_approval and n == 2 and copy == 1 else "Final Approved",
                    "Deleted From Carousel": False,
                },
            })
    return parent, slides


def test_fb0_safe_doubled_repair_accepts_verified_native_drive_links():
    output, slides = _doubled_fixture()
    plan = canonical_doubled_slide_repair(output, slides, 4)
    assert plan is not None
    canonical, surplus, changes = plan
    assert len(canonical) == 4
    assert len(surplus) == 4
    assert [row["fields"]["Current Order"] for row in canonical] == [1, 2, 3, 4]
    assert len({row["id"] for row in canonical + surplus}) == 8
    assert [row["fields"]["Asset_4x5_Public_URL"] for row in canonical] == [
        _url(output["id"], i) for i in range(4)
    ]
    for n, row in enumerate(canonical, 1):
        assert changes[row["id"]]["Google Drive File ID"] == _source(n)
        assert changes[row["id"]]["Asset_Family_Key"] == _record_id(n)
    # The order-two survivor is repaired to the immutable approved public URL.
    assert canonical[1]["id"] in changes
    assert changes[canonical[1]["id"]]["Asset_4x5_Public_URL"] == _url(output["id"], 1)


def test_fb0_doubled_repair_refuses_wrong_source_or_unapproved_rows():
    for options in ({"tamper_drive": True}, {"missing_approval": True}):
        output, slides = _doubled_fixture(**options)
        assert canonical_doubled_slide_repair(output, slides, 4) is None


class FakeClient:
    def __init__(self):
        self.updates = []

    def update_record(self, table, record_id, fields, **kwargs):
        self.updates.append((table, record_id, fields, kwargs))
        return {"id": record_id, "fields": fields}


def test_fb1_meta_checkpoint_is_held_not_retried():
    client = FakeClient()
    result = fb1._fail_auth_checkpoint(
        client, _record_id(123), {}, slide_number=3,
    )
    assert result["terminal"] is True
    assert result["reason"] == "meta_account_checkpoint"
    assert result["auth_checkpoint"] is True
    assert len(client.updates) == 1
    fields = client.updates[0][2]
    assert fields["FB_Publish_Status"] == "Manual Fallback Required"
    assert fields["Publish_Status"] == "Failed"
    assert fields["Publish_Retry_Eligible"] is False
    assert fields["Publish_Next_Retry_At"] is None
    assert fields["Manual_Fallback_Required"] is True
    assert fields["Publish_Error_Stage"] == "FB1_META_CHECKPOINT"
