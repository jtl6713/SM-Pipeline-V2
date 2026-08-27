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
        "https://media.chicagoshining.com/studio/previews/platform-output/recX/cover.jpg"
    )


def test_master_key_from_record_prefers_final_file():
    record = {
        "id": "recABCDEFGHIJKLMN",
        "fields": {
            "Final_File_URL": "https://media.chicagoshining.com/studio/master-assets/recPR1/a.mp4",
        },
    }
    assert master_r2_key_from_record(record) == "studio/master-assets/recPR1/a.mp4"
