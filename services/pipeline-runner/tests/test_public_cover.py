from ap0.public_cover import (
    cover_needs_public_stage,
    cover_r2_key,
    drive_file_id_from_url,
    graph_fetchable_cover_url,
    native_grid_cover_required,
)


def test_graph_fetchable_cover_requires_public_image():
    assert graph_fetchable_cover_url(
        "https://media.chicagoshining.com/studio/previews/thumbnails/recX/cover.png"
    ).endswith("cover.png")
    assert graph_fetchable_cover_url(
        "https://media.chicagoshining.com/publish/platform-output-281/cover.jpg"
    )
    assert not graph_fetchable_cover_url(
        "https://drive.google.com/uc?id=13rIboxRJt50N9SWX12vfh2CBc4Jp6pMa"
    )
    assert not graph_fetchable_cover_url(
        "https://media.chicagoshining.com/publish/platform-output-281/finished.mp4"
    )


def test_drive_id_from_thumbnail_urls():
    assert drive_file_id_from_url("https://drive.google.com/uc?id=13rIboxRJt50N9SWX12vfh2CBc4Jp6pMa") == (
        "13rIboxRJt50N9SWX12vfh2CBc4Jp6pMa"
    )
    assert drive_file_id_from_url(
        "https://drive.google.com/file/d/13rIboxRJt50N9SWX12vfh2CBc4Jp6pMa/view"
    ) == "13rIboxRJt50N9SWX12vfh2CBc4Jp6pMa"


def test_cover_needs_stage_for_drive_but_not_cdn():
    drive = {
        "fields": {
            "Thumbnail_URL": "https://drive.google.com/uc?id=13rIboxRJt50N9SWX12vfh2CBc4Jp6pMa",
            "Output_ID": 281,
        }
    }
    public = {
        "fields": {
            "Thumbnail_URL": "https://media.chicagoshining.com/publish/platform-output-281/cover.png",
            "Output_ID": 281,
        }
    }
    assert cover_needs_public_stage(drive) is True
    assert cover_needs_public_stage(public) is False
    assert cover_r2_key(drive, "png") == "publish/platform-output-281/cover.png"


def test_native_grid_cover_required_for_rendered_video():
    assert native_grid_cover_required({"fields": {"Studio_Output_Type": "Reel"}})
    assert native_grid_cover_required({"fields": {"Studio_Output_Type": "Slideshow Reel"}})
    assert native_grid_cover_required({"fields": {"Studio_Output_Type": "Slideshow Video"}})
    assert native_grid_cover_required({"fields": {"Platform_Output_Type": "YouTube Short"}})
    assert native_grid_cover_required({"fields": {"Platform_Output_Type": "YouTube Slideshow Video"}})
    assert native_grid_cover_required({"fields": {"Platform_Output_Type": "Facebook Reel"}})
    assert native_grid_cover_required({"fields": {"Platform_Output_Type": "Facebook Slideshow Reel"}})
    assert not native_grid_cover_required({"fields": {"Studio_Output_Type": "Single Image"}})
    assert not native_grid_cover_required(
        {"fields": {"Studio_Output_Type": "Video Draft", "Platform": "TikTok"}}
    )
    assert not native_grid_cover_required({"fields": {"Platform_Output_Type": "TikTok Video Draft"}})
