from fbs1.eligibility import create_eligibility_reason, poll_eligibility_reason, stage_eligibility_reason
from fbs1.payload import build_render_payload
from fbs1.slides import slide_clip, slide_formula
from stages.registry import STAGE_NAMES, is_implemented


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def _ready(**overrides):
    fields = {
        "Platform": "Facebook",
        "FB_Resolved_Publish_Mode": "Slideshow Reel",
        "FB_Slideshow_Status": "Ready to Render",
        "Do_Not_Publish": False,
        "Output_ID": "233",
        "Image_Count": 2,
        "Title_Text": "Rainy Chicago",
        "Brand_Text": "ChicagoShining",
        "Thumbnail_URL": "https://media.chicagoshining.com/cover.jpg",
        "Selected_Music_URL": "https://media.chicagoshining.com/music.mp3",
        "Music_Volume": 0.08,
        "Voiceover_URL": "https://media.chicagoshining.com/vo.mp3",
    }
    fields.update(overrides)
    return _record(**fields)


def _rendering(**overrides):
    fields = {
        "FB_Slideshow_Status": "Rendering",
        "FB_Slideshow_Render_Status_URL": "http://127.0.0.1:3333/status/job-1",
    }
    fields.update(overrides)
    return _record(**fields)


def _stage(**overrides):
    fields = {
        "Platform": "Facebook",
        "Platform_Output_Type": "Facebook Reel",
        "Output_Status": "Approved for Publishing",
        "Review_Status": "Approved",
        "Final_File_ID": "1abcDriveFile",
        "Do_Not_Publish": False,
    }
    fields.update(overrides)
    return _record(**fields)


def test_fbs1_is_registered():
    assert "fbs1" in STAGE_NAMES
    assert "fbs2" in STAGE_NAMES
    assert is_implemented("fbs1")
    assert is_implemented("fbs2")


def test_fbs1_create_gates():
    assert create_eligibility_reason(_ready()) is None
    assert create_eligibility_reason(_ready(FB_Slideshow_Status="Retry Pending", Publish_Error_Stage="FBS1_ASSETS")) is None
    assert create_eligibility_reason(_ready(Platform="Instagram")) == "not_facebook"
    assert create_eligibility_reason(_ready(FB_Resolved_Publish_Mode="Single Photo")) == "not_slideshow_reel"
    assert create_eligibility_reason(_ready(FB_Slideshow_Status="Video Ready")) == "slideshow_status_not_ready_to_render"
    assert create_eligibility_reason(_ready(Platform_Post_ID="123")) == "already_has_platform_post"
    assert create_eligibility_reason(_ready(Do_Not_Publish=True)) == "do_not_publish"
    assert create_eligibility_reason({"id": "", "fields": {}}) == "missing_record_id"


def test_fbs2_poll_gates():
    assert poll_eligibility_reason(_rendering()) is None
    assert poll_eligibility_reason(_rendering(FB_Slideshow_Status="Retry Pending", Publish_Error_Stage="FBS2_STORAGE")) is None
    assert poll_eligibility_reason(_rendering(FB_Slideshow_Status="Video Ready")) == "slideshow_status_not_rendering"
    assert poll_eligibility_reason(_rendering(FB_Slideshow_Render_Status_URL="")) == "missing_slideshow_status_url"
    assert poll_eligibility_reason(_rendering(FB_Slideshow_Status="Retry Pending", Publish_Error_Stage="FBS1")) == (
        "fbs2_retry_stage_mismatch"
    )


def test_fbs2_stage_gates():
    assert stage_eligibility_reason(_stage()) is None
    assert stage_eligibility_reason(_stage(Platform_Output_Type="Facebook Story")) == "not_facebook_reel"
    assert stage_eligibility_reason(_stage(Final_File_ID="")) == "missing_final_file_id"
    assert stage_eligibility_reason(_stage(Publish_Asset_URL="https://media.chicagoshining.com/a.mp4")) == (
        "already_has_publish_asset"
    )
    assert stage_eligibility_reason(_stage(FB_Slideshow_Public_URL="https://media.chicagoshining.com/a.mp4")) == (
        "already_has_slideshow_public_url"
    )


def test_fbs1_payload_and_slide_formula():
    slides = [
        _record(**{"Asset_4x5_Public_URL": "https://cdn/a.jpg", "Slide Number": 1, "Current Order": 1}),
        _record(**{"Asset_4x5_Public_URL": "https://cdn/b.jpg", "Slide Number": 2, "Current Order": 2}),
    ]
    payload = build_render_payload(_ready(), slides)
    assert payload["compositionId"] == "FacebookImageSlideshow9x16"
    assert payload["filename"] == "facebook-slideshow-output-233.mp4"
    assert payload["durationInFrames"] == 210
    assert payload["durationSeconds"] == 7
    assert payload["voiceover"]["url"] == "https://media.chicagoshining.com/vo.mp3"
    assert payload["music"]["volume"] == 0.08
    assert payload["music"]["startFromSeconds"] == 0
    assert len(payload["clips"]) == 2
    assert slide_clip(slides[0])["url"] == "https://cdn/a.jpg"
    assert 'FIND("233",ARRAYJOIN({PO_Output_ID}))>0' in slide_formula("233")
