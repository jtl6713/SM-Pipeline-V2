from ap0.public_mp4 import is_public_publish_url, master_r2_key_from_record, master_r2_key_from_url


def test_master_key_from_cdn_shaped_url():
    url = "https://media.chicagoshining.com/studio/master-assets/reclx20XPfNgPIYbA/clip.MP4"
    assert master_r2_key_from_url(url) == "studio/master-assets/reclx20XPfNgPIYbA/clip.MP4"


def test_public_publish_url_rejects_master_assets():
    assert not is_public_publish_url(
        "https://media.chicagoshining.com/studio/master-assets/recPR1/clip.mp4"
    )
    assert is_public_publish_url(
        "https://media.chicagoshining.com/publish/platform-output-283/finished.mp4"
    )
    assert is_public_publish_url(
        "https://media.chicagoshining.com/studio/previews/finished-video/recPR1/abc.mp4"
    )


def test_finished_video_preview_key():
    from ap0.public_mp4 import finished_video_preview_key

    assert finished_video_preview_key("rechW6KJz5vpf3bYx", "e7db4752c0494bd2ae") == (
        "studio/previews/finished-video/rechW6KJz5vpf3bYx/e7db4752c0494bd2ae.mp4"
    )


def test_existing_finished_preview_url_prefers_public_copy():
    from ap0.public_mp4 import existing_finished_preview_url

    master = {
        "id": "v1",
        "url": "https://media.chicagoshining.com/studio/master-assets/recPR1/a.mp4",
        "preview_public_url": "https://media.chicagoshining.com/studio/previews/finished-video/recPR1/v1.mp4",
    }
    assert existing_finished_preview_url(master).endswith("/studio/previews/finished-video/recPR1/v1.mp4")
    assert not existing_finished_preview_url({
        "url": "https://media.chicagoshining.com/studio/master-assets/recPR1/a.mp4",
    })


def test_ensure_public_mp4_streams_drive_file_to_put_file(tmp_path, monkeypatch):
    from ap0.public_mp4 import ensure_public_mp4_url

    record = {
        "id": "recRxp28DYcT9SEMW",
        "fields": {"Final_File_ID": "1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI"},
    }
    plan = {
        "r2_object_key": "publish/platform-output-375/1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI.mp4",
        "publish_asset_url": "https://media.chicagoshining.com/publish/platform-output-375/1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI.mp4",
    }
    seen = {}

    class FakeDrive:
        def download_file_to_path(self, file_id, dest_path, timeout=600):
            seen["file_id"] = file_id
            seen["dest"] = dest_path
            with open(dest_path, "wb") as fh:
                fh.write(b"mp4-bytes")
            return dest_path, "video/mp4"

    class FakeR2:
        def put_file(self, key, path, content_type):
            seen["key"] = key
            seen["path"] = path
            seen["content_type"] = content_type
            with open(path, "rb") as fh:
                seen["body"] = fh.read()
            return {"ok": True}

    monkeypatch.setattr("integrations.google_drive.GoogleDriveClient", FakeDrive)
    monkeypatch.setattr("integrations.r2_upload.R2UploadClient", FakeR2)
    url = ensure_public_mp4_url(None, record, plan)
    assert url == plan["publish_asset_url"]
    assert seen["file_id"] == "1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI"
    assert seen["key"] == plan["r2_object_key"]
    assert seen["body"] == b"mp4-bytes"
    assert seen["content_type"] == "video/mp4"

    record = {
        "id": "recABCDEFGHIJKLMN",
        "fields": {
            "Final_File_URL": "https://media.chicagoshining.com/studio/master-assets/recPR1/a.mp4",
        },
    }
    assert master_r2_key_from_record(record) == "studio/master-assets/recPR1/a.mp4"
