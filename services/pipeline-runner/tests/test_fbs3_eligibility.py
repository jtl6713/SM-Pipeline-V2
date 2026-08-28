from datetime import datetime

from fbs3.caption import cache_busted_public_url, public_mp4_url, reel_description, reel_title
from fbs3.eligibility import create_eligibility_reason, poll_eligibility_reason
from fbs3.poll import reel_is_ready, reel_is_terminal_error, reel_permalink
from stages.registry import STAGE_NAMES, is_implemented


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def _ready(**overrides):
    fields = {
        "FB_Slideshow_Status": "Video Ready",
        "FB_Slideshow_Public_URL": "https://media.chicagoshining.com/publish/platform-output-233/reel.mp4",
        "Output_Caption": "Night rain on Michigan Avenue",
        "Output_Hashtags": "#ChicagoShining #Chicago",
        "Output_Title": "Rainy Chicago",
    }
    fields.update(overrides)
    return _record(**fields)


def _processing(**overrides):
    fields = {
        "FB_Slideshow_Status": "Reel Processing",
        "FB_Slideshow_Meta_Video_ID": "123456789012345",
    }
    fields.update(overrides)
    return _record(**fields)


def test_fbs3_is_registered():
    assert "fbs3" in STAGE_NAMES
    assert "fbs4" in STAGE_NAMES
    assert is_implemented("fbs3")
    assert is_implemented("fbs4")


def test_fbs3_create_gates():
    assert create_eligibility_reason(_ready()) is None
    assert create_eligibility_reason(_ready(FB_Slideshow_Status="Retry Pending", Publish_Error_Stage="FBS3_UPLOAD")) is None
    assert create_eligibility_reason(_ready(FB_Slideshow_Status="Initializing Reel")) == "slideshow_status_not_ready"
    assert create_eligibility_reason(_ready(FB_Slideshow_Public_URL="")) == "missing_slideshow_public_url"
    assert create_eligibility_reason(
        _ready(FB_Slideshow_Public_URL="https://media.chicagoshining.com/studio/master-assets/recX/clip.mp4")
    ) == "missing_slideshow_public_url"
    assert public_mp4_url(
        _ready(Publish_Asset_URL="https://media.chicagoshining.com/publish/platform-output-282/finished.mp4")
    ).endswith("finished.mp4")
    assert create_eligibility_reason(_ready(FB_Slideshow_Status="Retry Pending", Publish_Error_Stage="FBS4")) == (
        "fbs3_retry_stage_mismatch"
    )
    assert create_eligibility_reason({"id": "", "fields": {}}) == "missing_record_id"


def test_fbs3_caption_and_cache_bust():
    record = _ready()
    assert reel_title(record) == "Rainy Chicago"
    assert reel_description(record) == "Night rain on Michigan Avenue\n\n#ChicagoShining #Chicago"
    url = cache_busted_public_url(record, datetime(2026, 8, 24, 15, 21, 0))
    assert url.startswith("https://media.chicagoshining.com/publish/platform-output-233/reel.mp4?")
    assert "v=20260824152100" in url
    untitled = _ready(Output_Title="", Title_Text="", Output_Caption="")
    assert reel_title(untitled) == "ChicagoShining"


def test_fbs4_poll_gates():
    assert poll_eligibility_reason(_processing()) is None
    assert poll_eligibility_reason(_processing(FB_Slideshow_Status="Published Pending Finalize")) is None
    assert poll_eligibility_reason(_processing(FB_Slideshow_Status="Video Ready")) == "slideshow_status_not_processing"
    assert poll_eligibility_reason(_processing(FB_Slideshow_Meta_Video_ID="", Platform_Post_ID="")) == (
        "missing_facebook_video_id"
    )
    assert poll_eligibility_reason(_processing(FB_Slideshow_Meta_Video_ID="", Platform_Post_ID="987")) is None


def test_fbs4_status_rules():
    assert reel_is_ready({"permalink_url": "https://www.facebook.com/reel/1/"})
    assert reel_is_ready({"status": {"publishing_phase": {"status": "complete"}}})
    assert reel_is_ready({"status": {"video_status": "ready"}})
    assert not reel_is_ready({"status": {"video_status": "processing"}})
    assert reel_is_terminal_error({"status": {"video_status": "error"}}, 200)
    assert reel_is_terminal_error({"error": {"message": "bad request"}}, 400)
    assert not reel_is_terminal_error({"status": {"video_status": "processing"}}, 200)
    assert not reel_is_terminal_error({}, 503)
    assert reel_permalink({"id": "123"}, "999") == "https://www.facebook.com/reel/123/"
    assert reel_permalink({}, "999") == "https://www.facebook.com/reel/999/"
