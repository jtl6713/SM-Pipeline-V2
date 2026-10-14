from p2.elevenlabs_client import resolve_content_voice_id, voice_id_for_name
from p2.processor import _trigger_p3, can_commit_generated_media, item_wants_ai_thumbnail
from p2.formulas import (
    p2_exact_content_formula,
    recheck_silent_thumbnail,
    recheck_voiceover_and_thumbnail,
    recheck_voiceover_only,
)
from p2.stale_clears import stale_media_run_clears
from p2.thumbnail_client import build_thumbnail_prompt


def test_p2_exact_content_formula_blank_test_run():
    formula = p2_exact_content_formula("recABC123", "")
    assert 'RECORD_ID()="recABC123"' in formula
    assert "{Test_Run_ID}=BLANK()," in formula


def test_p2_exact_content_formula_with_test_run():
    formula = p2_exact_content_formula("recABC123", "test-42")
    assert '{Test_Run_ID}="test-42",' in formula


def test_recheck_formulas_include_record_id():
    record_id = "recXYZ789"
    assert record_id in recheck_voiceover_and_thumbnail(record_id)
    assert record_id in recheck_voiceover_only(record_id)
    assert record_id in recheck_silent_thumbnail(record_id)


def test_stale_media_run_keeps_paid_voiceover_file():
    parent = {
        "fields": {
            "Include_Voiceover": "Yes",
            "Voiceover_URL": "",
            "Voiceover_Google_Drive_File_ID": "drive123",
            "Voiceover_Normalization_Status": "Normalized",
            "Voiceover_Normalization_Details": "tts-lease:2026-10-14T18:00:00+00:00:abc",
            "Voiceover_Normalized_At": "2026-01-01T00:00:00Z",
        }
    }
    clears = stale_media_run_clears(parent)
    assert "Voiceover_Google_Drive_File_ID" not in clears
    assert "Voiceover_Normalization_Details" not in clears
    assert "Voiceover_Normalization_Status" not in clears


def test_stale_media_run_clears_thumbnail_residue():
    parent = {
        "fields": {
            "Thumbnail_Status": "Ready",
            "Thumbnail_URL": "",
            "Thumbnail_Google_Drive_File_ID": "thumb123",
        }
    }
    clears = stale_media_run_clears(parent)
    assert clears == {"Thumbnail_Google_Drive_File_ID": None}
    generated = stale_media_run_clears({
        "fields": {
            "Thumbnail_Status": "Generated",
            "Thumbnail_URL": "",
            "Thumbnail_Google_Drive_File_ID": "thumb456",
        }
    })
    assert generated == {"Thumbnail_Google_Drive_File_ID": None}


def test_p2_commits_cover_when_status_is_generated_without_url():
    item = {
        "fields": {
            "Include_Thumbnail": "Yes",
            "Thumbnail_Status": "Generated",
            "Thumbnail_Prompt": "3D heat wave vs snow CTA",
            "Thumbnail_URL": "",
            "Voiceover_URL": "",
        }
    }
    assert item_wants_ai_thumbnail(item) is True
    assert can_commit_generated_media(item, generated_thumb=True) is True
    already = {"fields": {**item["fields"], "Voiceover_URL": "https://drive.example/vo.mp3"}}
    assert can_commit_generated_media(already, generated_thumb=True) is False


def test_voice_id_mapping():
    assert voice_id_for_name("George") == "JBFqnCBsd6RMkjVDRZzb"
    assert voice_id_for_name("other") == "xVQH621DS3eyBYrseRt5"


def test_resolve_content_voice_id_prefers_voice_id():
    item = {
        "fields": {
            "Voice_ID": "6F5Zhi321D3Oq7v1oNT4",
            "Voice_Name": "Hank - Deep and Engaging Narrator",
            "Voice": "Kate",
        }
    }
    assert resolve_content_voice_id(item) == "6F5Zhi321D3Oq7v1oNT4"


def test_resolve_content_voice_id_falls_back_to_legacy_name():
    assert resolve_content_voice_id({"fields": {"Voice": "George"}}) == "JBFqnCBsd6RMkjVDRZzb"
    assert resolve_content_voice_id({"fields": {"Voice_Name": "Hank"}}) == "xVQH621DS3eyBYrseRt5"
    assert resolve_content_voice_id({"fields": {}}) == "xVQH621DS3eyBYrseRt5"


def test_thumbnail_prompt_suffix():
    prompt = build_thumbnail_prompt("Rainy Chicago skyline")
    assert "Rainy Chicago skyline" in prompt
    assert "IMPORTANT BRANDING RULE" in prompt
    assert "PHOTOREALISM" in prompt
    assert "restrained gold" in prompt
    assert "luxury-ad" in prompt


def test_p2_trigger_p3_uses_local_python_when_flagged(monkeypatch):
    from config import load_settings

    monkeypatch.setenv("STAGE_BACKEND_P3", "python")
    load_settings.cache_clear()

    def fake_process(**kwargs):
        return {"processed": True, "route": "studio_parent", **kwargs}

    monkeypatch.setattr("p3.processor.process_request", fake_process)
    result = _trigger_p3(content_record_id="recP3TEST", test_run_id="t1", source="unit")
    assert result["backend"] == "python"
    assert result["content_item_record_id"] == "recP3TEST"
    load_settings.cache_clear()
