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


def test_master_key_from_record_prefers_final_file():
    record = {
        "id": "recABCDEFGHIJKLMN",
        "fields": {
            "Final_File_URL": "https://media.chicagoshining.com/studio/master-assets/recPR1/a.mp4",
        },
    }
    assert master_r2_key_from_record(record) == "studio/master-assets/recPR1/a.mp4"
