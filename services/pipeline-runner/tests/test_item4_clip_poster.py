import json

from item4.clip_poster import (
    clip_poster_bytes,
    ensure_request_clip_posters,
    is_video_master_asset,
    is_video_preview_row,
    looks_like_clip_poster_url,
    stamp_request_clip_poster,
)


def test_video_preview_row_detects_mov():
    assert is_video_preview_row({"Source_Extension": "MOV", "Source_Name": "IMG_6121.mov"}) is True
    assert is_video_preview_row({"Source_MIME_Type": "video/quicktime"}) is True
    assert is_video_preview_row({"Source_Extension": "jpg", "Source_Name": "skyline.jpg"}) is False


def test_clip_poster_uses_drive_thumbnail_without_downloading_mov():
    class Drive:
        def __init__(self):
            self.downloads = 0

        def download_thumbnail(self, _file_id):
            return b"jpeg-bytes-from-drive-thumb" + b"x" * 80, "image/jpeg"

        def download_file(self, _file_id):
            self.downloads += 1
            return b"not-a-frame", "video/quicktime"

    drive = Drive()
    poster, mime = clip_poster_bytes(drive, "drive123", "mov")
    assert mime == "image/jpeg"
    assert poster.startswith(b"jpeg-bytes-from-drive-thumb")
    assert drive.downloads == 0


def test_stamp_request_clip_poster_updates_matching_asset():
    class FakeAirtable:
        def __init__(self):
            self.fields = None

        def get_record(self, _table, _record_id):
            return {
                "fields": {
                    "Studio_Master_Assets_JSON": '[{"id":"a"},{"id":"clip1","name":"IMG_6121.mov"}]',
                }
            }

        def update_record(self, _table, _record_id, fields, **_kwargs):
            self.fields = fields
            return {}

    client = FakeAirtable()
    stamp_request_clip_poster(client, "recPR", "clip1", "https://media.chicagoshining.com/x.jpg", "studio/previews/x.jpg")
    assert "https://media.chicagoshining.com/x.jpg" in client.fields["Studio_Master_Assets_JSON"]
    assert "clip1" in client.fields["Studio_Master_Assets_JSON"]


def test_video_master_asset_and_poster_url():
    assert is_video_master_asset({"media_kind": "video", "name": "IMG_6121.mov"}) is True
    assert is_video_master_asset({"media_kind": "photo", "name": "IMG_6121.mov"}) is False
    assert looks_like_clip_poster_url("https://media.chicagoshining.com/studio/previews/clip-posters/recPR/clip1.jpg") is True
    assert looks_like_clip_poster_url("https://drive.google.com/file/d/abc/view") is False


def test_ensure_request_clip_posters_writes_r2_and_stamps_json():
    class FakeAirtable:
        def __init__(self):
            self.fields = {
                "Studio_Master_Assets_JSON": json.dumps(
                    [
                        {"id": "still1", "media_kind": "photo", "name": "sky.jpg"},
                        {
                            "id": "clip1",
                            "media_kind": "video",
                            "name": "IMG_6121.mov",
                            "google_drive_file_id": "drive123",
                        },
                    ]
                )
            }
            self.updates = []

        def get_record(self, _table, _record_id):
            return {"fields": self.fields}

        def update_record(self, _table, _record_id, fields, **_kwargs):
            self.fields.update(fields)
            self.updates.append(fields)
            return {}

    class Drive:
        def download_thumbnail(self, _file_id):
            return b"jpeg-bytes-from-drive-thumb" + b"x" * 80, "image/jpeg"

    class R2:
        def __init__(self):
            self.puts = []

        def put_object(self, key, content, content_type):
            self.puts.append((key, content, content_type))
            return {"ok": True}

        def preview_url(self, key):
            return f"https://media.chicagoshining.com/{key}"

    client = FakeAirtable()
    r2 = R2()
    result = ensure_request_clip_posters(client, "recPR", source_asset_id="clip1", drive=Drive(), r2=r2)
    assert result["ok"] is True
    assert result["posters"][0]["poster_url"].endswith("clip1.jpg")
    assert r2.puts
    assert "clip-posters/recPR/clip1.jpg" in client.fields["Studio_Master_Assets_JSON"]
