from p0202.constants import SEARCH_FORMULA
from p0202.eligibility import eligibility_reason
from p0202.processor import request_identity_matches, request_still_current, stale_completion_cleanup_fields
from stages.registry import STAGE_NAMES, is_implemented


def _slide(**fields):
    return {"id": "recSLIDE000000001", "fields": fields}


def _ready(**overrides):
    fields = {
        "Slide_Voiceover_Status": "Ready",
        "Deleted From Carousel": 0,
        "Slide_Voiceover_Text": "Rain on Michigan Avenue.",
        "Slide_Voice_ID": "voice123",
        "Studio_Voice_Prep_Request_ID": "studio-recOUT-1",
    }
    fields.update(overrides)
    return _slide(**fields)


def test_p0202_is_registered():
    assert "p0202" in STAGE_NAMES
    assert is_implemented("p0202")


def test_p0202_search_formula_matches_make():
    assert '{Slide_Voiceover_Status}="Ready"' in SEARCH_FORMULA
    assert "{Deleted From Carousel}=0" in SEARCH_FORMULA
    assert '{Slide_Voiceover_Text}!=""' in SEARCH_FORMULA
    assert '{Slide_Voice_ID}!=""' in SEARCH_FORMULA
    assert '{Studio_Voice_Prep_Request_ID}!=""' in SEARCH_FORMULA


def test_p0202_eligible_slide():
    assert eligibility_reason(_ready()) is None


def test_p0202_gate_failures():
    assert eligibility_reason(_ready(Slide_Voiceover_Status="Generated")) == "status_not_ready"
    assert eligibility_reason(_ready(**{"Deleted From Carousel": True})) == "deleted"
    assert eligibility_reason(_ready(Slide_Voiceover_Text="")) == "missing_text"
    assert eligibility_reason(_ready(Slide_Voice_ID="")) == "missing_voice_id"
    assert eligibility_reason(_ready(Studio_Voice_Prep_Request_ID="")) == "missing_request_token"
    assert eligibility_reason(_ready(Slide_Voiceover_URL="https://drive.google.com/uc?id=abc")) == "already_has_url"


def test_p0202_stale_tts_request_cannot_overwrite_newer_scene_request():
    original = _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-100",
        Slide_Voiceover_Text="Original narration.",
        Slide_Voice_ID="voice-a",
    )
    assert request_still_current(original, _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-100",
        Slide_Voiceover_Text="Original narration.",
        Slide_Voice_ID="voice-a",
    )) is True
    assert request_still_current(original, _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-101",
        Slide_Voiceover_Text="Original narration.",
        Slide_Voice_ID="voice-a",
    )) is False
    assert request_still_current(original, _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-100",
        Slide_Voiceover_Text="New accepted narration.",
        Slide_Voice_ID="voice-a",
    )) is False
    assert request_still_current(original, _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-100",
        Slide_Voiceover_Text="Original narration.",
        Slide_Voice_ID="voice-b",
    )) is False


def test_p0202_completion_rejects_replaced_slide_or_ineligible_state():
    original = _ready()
    replacement = _ready()
    replacement["id"] = "recDIFFERENTSLIDE"
    assert request_still_current(original, replacement) is False
    assert request_still_current(original, _ready(Slide_Voiceover_Status="Generated")) is False
    assert request_still_current(original, _ready(**{"Deleted From Carousel": True})) is False
    assert request_still_current(original, None) is False



def test_p0202_request_identity_ignores_generated_status_but_not_new_request():
    original = _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-s4-vs1abc-100",
        Slide_Voiceover_Text="Accepted narration.",
        Slide_Voice_ID="voice-a",
    )
    generated_same = _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-s4-vs1abc-100",
        Slide_Voiceover_Text="Accepted narration.",
        Slide_Voice_ID="voice-a",
        Slide_Voiceover_Status="Generated",
        Slide_Voiceover_URL="https://drive.google.com/uc?id=old-job",
    )
    newer = _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-s5-vs1def-101",
        Slide_Voiceover_Text="Newer narration.",
        Slide_Voice_ID="voice-a",
        Slide_Voiceover_Status="Generated",
        Slide_Voiceover_URL="https://drive.google.com/uc?id=new-job",
    )
    assert request_identity_matches(original, generated_same) is True
    assert request_identity_matches(original, newer) is False


def test_p0202_post_write_race_compensation_restores_safe_state():
    narrated = _ready(
        Studio_Voice_Prep_Request_ID="studio-recOUT-s5-vs1def-101",
        Slide_Voiceover_Text="Newer narration.",
        Slide_Voice_ID="voice-a",
        Slide_Voiceover_Status="Generated",
        Slide_Voiceover_URL="https://drive.google.com/uc?id=old-job",
    )
    assert stale_completion_cleanup_fields(narrated) == {
        "Slide_Voiceover_Status": "Ready",
        "Slide_Voiceover_URL": None,
    }
    silent = _ready(
        Studio_Voice_Prep_Request_ID="",
        Slide_Voiceover_Text="",
        Slide_Voice_ID="voice-a",
        Slide_Voiceover_Status="Generated",
        Slide_Voiceover_URL="https://drive.google.com/uc?id=old-job",
    )
    assert stale_completion_cleanup_fields(silent) == {
        "Slide_Voiceover_Status": "Not Requested",
        "Slide_Voiceover_URL": None,
    }
