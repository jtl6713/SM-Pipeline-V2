from item4.clip_poster import clip_poster_bytes, is_video_preview_row, stamp_request_clip_poster


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
