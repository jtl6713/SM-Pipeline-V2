from p0202.constants import SEARCH_FORMULA
from p0202.eligibility import eligibility_reason
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
