from stages.registry import STAGE_NAMES, is_implemented
from yt.eligibility import (
    package_source_url,
    upload_source_url,
    yt0_eligibility_reason,
    ytp1_eligibility_reason,
    yts1_eligibility_reason,
    yts2_eligibility_reason,
    yts3_eligibility_reason,
)
from yt.constants import THUMB_NOT_NEEDED, THUMB_PENDING
from yt.package import (
    description_final,
    hashtag_tokens,
    idempotency_key,
    thumbnail_status,
    youtube_tags,
    youtube_thumbnail_publish_enabled,
)
from yt.yts2 import thumbnail_fallback_source, vertical_still_attached, yts2_needs_videos_list


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def test_youtube_stages_are_registered():
    for name in ("yt0", "ytp1", "yts1", "yts2", "yts3"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_yt0_gates():
    ready = _record(Platform="YouTube", Auto_Publish_Enabled=True, Do_Not_Publish=False, Output_Title="Title")
    assert yt0_eligibility_reason(ready) is None
    assert yt0_eligibility_reason(_record(Platform="Instagram", Auto_Publish_Enabled=True)) == "not_youtube"
    assert yt0_eligibility_reason(_record(Platform="YouTube", Auto_Publish_Enabled=False)) == "auto_publish_disabled"
    assert yt0_eligibility_reason(_record(Platform="YouTube", Auto_Publish_Enabled=True, Do_Not_Publish=True)) == (
        "do_not_publish"
    )
    assert yt0_eligibility_reason(_record(Platform="YouTube", Auto_Publish_Enabled=True, Platform_Post_ID="abc")) == (
        "already_has_platform_post"
    )
    assert yt0_eligibility_reason(_record(Platform="YouTube", Auto_Publish_Enabled=True, YouTube_Video_ID="vid")) == (
        "already_has_youtube_video"
    )
    assert yt0_eligibility_reason(ready, replace_transaction_id="txn") == "replace_address_mismatch"
    assert yt0_eligibility_reason({"id": "", "fields": {}}) == "missing_record_id"


def test_ytp1_and_poll_gates():
    yt1 = _record(
        Platform="YouTube",
        YouTube_Stage="YT1",
        Publish_Asset_URL="https://media.chicagoshining.com/publish/platform-output-375/file.mp4",
    )
    assert ytp1_eligibility_reason(yt1) is None
    assert ytp1_eligibility_reason(_record(Platform="YouTube", YouTube_Stage="YT1")) == "missing_public_publish_url"
    assert ytp1_eligibility_reason(_record(
        Platform="YouTube",
        YouTube_Stage="YT1",
        Final_File_URL="https://drive.google.com/file/d/1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI/view",
    )) == "missing_public_publish_url"
    assert ytp1_eligibility_reason(_record(Platform="YouTube", YouTube_Stage="YT2")) == "youtube_stage_not_yt1"
    assert ytp1_eligibility_reason(_record(Platform="YouTube", YouTube_Stage="YT1", YouTube_Upload_Job_ID="job")) == (
        "already_has_upload_job"
    )

    yt2_job = _record(YouTube_Stage="YT2", YouTube_Upload_Job_ID="job-1")
    assert yts1_eligibility_reason(yt2_job) is None
    assert yts1_eligibility_reason(_record(YouTube_Stage="YT2", YouTube_Upload_Job_ID="job-1", YouTube_Video_ID="v")) == (
        "already_has_youtube_video"
    )
    assert yts1_eligibility_reason(_record(YouTube_Stage="YT1", YouTube_Upload_Job_ID="job-1")) == "youtube_stage_not_yt2"

    yt2_video = _record(YouTube_Stage="YT2", YouTube_Video_ID="abc123")
    assert yts2_eligibility_reason(yt2_video) is None
    assert yts2_eligibility_reason(_record(YouTube_Stage="YT2")) == "missing_youtube_video_id"

    yt4 = _record(YouTube_Stage="YT4", YouTube_Video_ID="abc123", YouTube_Processing_Status="Succeeded")
    assert yts3_eligibility_reason(yt4) is None
    assert yts3_eligibility_reason(_record(YouTube_Stage="YT4", YouTube_Video_ID="abc123")) == "processing_not_succeeded"
    short = _record(
        YouTube_Stage="YT4",
        YouTube_Video_ID="abc123",
        YouTube_Processing_Status="Succeeded",
        Platform_Output_Type="YouTube Short",
    )
    assert yts3_eligibility_reason(short) == "native_cover_not_uploaded"
    assert yts3_eligibility_reason(short, require_native_cover=False) is None
    short["fields"]["YouTube_Thumbnail_Status"] = "Uploaded"
    assert yts3_eligibility_reason(short) is None


def test_youtube_thumbnail_publish_defaults_off_except_native_covers():
    assert youtube_thumbnail_publish_enabled() is False
    assert youtube_thumbnail_publish_enabled({"YOUTUBE_AUTO_UPLOAD_THUMBNAIL": "true"}) is True
    assert youtube_thumbnail_publish_enabled({"YOUTUBE_AUTO_UPLOAD_THUMBNAIL": "0"}) is False
    short = _record(Platform_Output_Type="YouTube Short")
    assert youtube_thumbnail_publish_enabled(record=short) is True
    assert youtube_thumbnail_publish_enabled({"YOUTUBE_AUTO_UPLOAD_THUMBNAIL": "0"}, record=short) is True
    assert yts2_needs_videos_list(False) is False
    assert yts2_needs_videos_list(True) is True


def test_youtube_publish_at_prefers_operator_marker():
    from yt.package import youtube_publish_at

    assert youtube_publish_at(
        _record(
            Studio_Scheduled_At="2026-09-25T13:30:00.000Z",
            YouTube_Scheduled_Publish_At="2026-09-28T19:00:00.000Z",
            Scheduled_Post_Date="2026-09-28T19:00:00.000Z",
        )
    ) == "2026-09-25T13:30:00.000Z"
    assert youtube_publish_at(
        _record(
            YouTube_Scheduled_Publish_At="2026-09-28T19:00:00.000Z",
            Scheduled_Post_Date="2026-09-27T19:00:00.000Z",
        )
    ) == "2026-09-28T19:00:00.000Z"
    assert youtube_publish_at(_record(Scheduled_Post_Date="2026-09-27T19:00:00.000Z")) == "2026-09-27T19:00:00.000Z"


def test_vertical_still_is_required_for_shorts():
    assert vertical_still_attached({"studioVerticalStill": {"ok": True}}) is True
    assert vertical_still_attached({"studioVerticalStillError": "studio vertical still failed 403"}) is False
    assert vertical_still_attached({"kind": "youtube#thumbnailSetResponse"}) is False


def test_package_helpers():
    record = _record(
        Output_ID=233,
        Output_Caption="Caption",
        Output_Hashtags="#Chicago",
        Final_File_URL="https://drive.example/final.mp4",
        Publish_Asset_URL="https://media.chicagoshining.com/pub.mp4",
        Studio_Preview_URL="https://media.chicagoshining.com/preview.mp4",
    )
    assert package_source_url(record) == "https://drive.example/final.mp4"
    assert upload_source_url(record) == "https://media.chicagoshining.com/pub.mp4"
    assert description_final(record) == "Caption\n\n#Chicago"
    assert youtube_tags(record) == ["Chicago"]
    assert hashtag_tokens("#NewYorkCity #LowerManhattan", "also #NewYorkCity") == [
        "NewYorkCity",
        "LowerManhattan",
    ]
    assert youtube_tags(
        _record(
            Output_Caption="Lower Manhattan views\n#NewYorkCity #LowerManhattan",
            Output_Hashtags="#NewYorkShining",
        )
    ) == ["NewYorkShining", "NewYorkCity", "LowerManhattan"]
    assert idempotency_key(record) == "YT-233-recABCDEFGHIJKLMN-BASE"


def test_youtube_description_strips_duplicate_title():
    record = _record(
        Output_Title="A North Side stroll through Andersonville",
        Output_Caption=(
            "A North Side stroll through Andersonville\n"
            "A North Side stroll through Andersonville—wander Clark Street’s indie shops."
        ),
        Output_Hashtags="#Andersonville #Chicago",
    )
    assert description_final(record) == (
        "A North Side stroll through Andersonville—wander Clark Street’s indie shops.\n\n"
        "#Andersonville #Chicago"
    )
    # Already-correct captions stay unchanged.
    clean = _record(
        Output_Title="A North Side stroll through Andersonville",
        Output_Caption="Wander Clark Street’s indie shops, cafes, and the Swedish American Museum.",
        Output_Hashtags="#Chicago",
    )
    assert description_final(clean) == (
        "Wander Clark Street’s indie shops, cafes, and the Swedish American Museum.\n\n#Chicago"
    )


def test_youtube_short_thumbnail_status_stays_pending():
    assert thumbnail_status(_record(Platform_Output_Type="YouTube Short")) == THUMB_PENDING
    assert thumbnail_status(_record(Studio_Output_Type="Carousel")) == THUMB_NOT_NEEDED


def test_required_youtube_grid_cover_never_falls_back_to_clip_frame():
    output = _record(Clip_1_URL="https://example.com/clip-frame.jpg")
    assert thumbnail_fallback_source(output, cover_required=True) is None
    assert thumbnail_fallback_source(output, cover_required=False) == "https://example.com/clip-frame.jpg"
