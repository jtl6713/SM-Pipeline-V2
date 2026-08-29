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
from yt.package import description_final, idempotency_key


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
    yt1 = _record(Platform="YouTube", YouTube_Stage="YT1")
    assert ytp1_eligibility_reason(yt1) is None
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
