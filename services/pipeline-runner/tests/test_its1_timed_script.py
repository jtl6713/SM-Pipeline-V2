from its1.processor import normalize_creative_scenes, normalize_scenes, process_request
from its1.prompt import build_creative_first_prompt, build_timed_script_prompt
from stages.registry import STAGE_NAMES, is_implemented


def test_its1_is_registered():
    assert "its1" in STAGE_NAMES
    assert is_implemented("its1")


def test_its1_prompt_requires_exact_catalog_names():
    prompt = build_timed_script_prompt(
        title="Upper West Side subway, 90 seconds",
        summary="How to ride the 1 train without looking lost.",
        location="Upper West Side",
        market="NYC",
        catalog=[
            {"id": "recWide1", "name": "UpperWestSide_72nd_platform.jpg", "location": "Upper West Side"},
            {"id": "recOmny2", "name": "OMNY_reader_closeup.jpg", "location": "72nd Street"},
        ],
    )
    assert "Upper West Side subway, 90 seconds" in prompt
    assert "UpperWestSide_72nd_platform.jpg" in prompt
    assert "recOmny2" in prompt
    assert "TARGET MARKET" not in prompt
    assert "suggested_visual MUST be copied exactly" in prompt


def test_its1_creative_first_prompt_asks_for_shot_descriptions_not_filenames():
    prompt = build_creative_first_prompt(
        title="Chicago golden hour",
        summary="A conversational concept about winter light, the riverwalk, and the CTA. Do not dump this whole brief into one scene.",
        location="Chicago",
        market="Chicago",
    )
    assert "story-first Script a Short writer" in prompt
    assert "Never paste the whole brief" in prompt
    assert 'no "you still need a photo"' in prompt
    assert "Exact Asset Name" not in prompt
    assert "LIBRARY MEDIA CATALOG" not in prompt


def test_normalize_creative_scenes_keeps_shot_text_without_forcing_catalog_ids():
    scenes = normalize_creative_scenes(
        {
            "scenes": [
                {
                    "voiceover_text": "Chicago's golden hour now starts at four.",
                    "suggested_visual": "Blue-hour aerial of icy Lake Michigan with the skyline behind it",
                },
                {
                    "voiceover_text": "Follow the river while the light is still warm.",
                    "suggested_visual": "Sunlit Riverwalk steps facing downtown towers",
                },
            ]
        }
    )
    assert len(scenes) == 2
    assert scenes[0]["media_asset_id"] == ""
    assert "Lake Michigan" in scenes[0]["suggested_visual"]


def test_creative_first_process_skips_catalog_floor(monkeypatch):
    monkeypatch.setattr(
        "its1.processor.generate_timed_script",
        lambda prompt: {
            "raw_text": "{}",
            "parsed": {
                "scenes": [
                    {
                        "voiceover_text": "Start on the shoreline.",
                        "suggested_visual": "Icy breakwater with skyline glow",
                    },
                    {
                        "voiceover_text": "Then walk the river.",
                        "suggested_visual": "Riverwalk terrace in late afternoon light",
                    },
                ]
            },
        },
    )
    result = process_request(
        title="Golden hour",
        summary="Winter light short",
        creative_first=True,
        catalog=[],
    )
    assert result["processed"] is True
    assert result["creative_first"] is True
    assert len(result["scenes"]) == 2


def test_normalize_scenes_matches_catalog_filenames():
    catalog = [
        {"id": "recWide1", "name": "UpperWestSide_72nd_platform.jpg"},
        {"id": "recOmny2", "name": "OMNY_reader_closeup.jpg"},
        {"id": "recSign3", "name": "Uptown_Bronx_entrance_sign.jpg"},
    ]
    scenes = normalize_scenes(
        {
            "scenes": [
                {
                    "voiceover_text": "Start at 72nd Street.",
                    "suggested_visual": "UpperWestSide_72nd_platform.jpg",
                    "media_asset_id": "recWide1",
                },
                {
                    "voiceover_text": "Tap OMNY.",
                    "suggested_visual": "OMNY_reader_closeup.jpg",
                },
            ]
        },
        catalog,
    )
    assert scenes[0]["media_asset_id"] == "recWide1"
    assert scenes[1]["suggested_visual"] == "OMNY_reader_closeup.jpg"
    assert scenes[1]["media_asset_id"] == "recOmny2"

def test_creative_first_prompt_respects_exact_five_scenes():
    prompt = build_creative_first_prompt(
        title="Chicago evening guide",
        summary="Create exactly five scenes with a specific shot and unique voiceover per scene.",
        location="Chicago",
        market="Chicago",
        required_scene_count=5,
    )
    assert "Write EXACTLY 5 distinct scenes" in prompt
    assert "Do not add hook/CTA scenes beyond this count" in prompt
    assert "- Write 6 to 8 scenes" not in prompt


def test_its1_retries_seven_scene_ai_response_into_five_without_truncation(monkeypatch):
    calls = []

    def fake_ai(prompt):
        calls.append(prompt)
        count = 7 if len(calls) == 1 else 5
        return {
            "parsed": {
                "scenes": [
                    {
                        "voiceover_text": f"Unique spoken narration for scene {i + 1}.",
                        "suggested_visual": f"Specific shot {i + 1} of the Chicago skyline.",
                    }
                    for i in range(count)
                ]
            }
        }

    monkeypatch.setattr("its1.processor.generate_timed_script", fake_ai)
    result = process_request(
        title="Chicago evening guide",
        summary="Make exactly five scenes, each with a different skyline visual.",
        required_scene_count=5,
        creative_first=True,
        catalog=[],
    )
    assert result["processed"] is True
    assert result["required_scene_count"] == 5
    assert len(result["scenes"]) == 5
    assert len(calls) == 2
    assert "Write EXACTLY 5 distinct scenes" in calls[0]
    assert "previous AI proposal returned 7 scenes" in calls[1]
    assert len({scene["voiceover_text"] for scene in result["scenes"]}) == 5


def test_its1_never_silently_slices_seven_scenes_to_five(monkeypatch):
    calls = []

    def fake_ai(prompt):
        calls.append(prompt)
        return {
            "parsed": {
                "scenes": [
                    {
                        "voiceover_text": f"Distinct spoken scene {i + 1}.",
                        "suggested_visual": f"Specific scene visual {i + 1}.",
                    }
                    for i in range(7)
                ]
            }
        }

    monkeypatch.setattr("its1.processor.generate_timed_script", fake_ai)
    result = process_request(
        title="Chicago landmarks", summary="Five scenes only.",
        required_scene_count=5, creative_first=True,
    )
    assert len(calls) == 2
    assert result["processed"] is False
    assert result["reason"] == "scene_count_mismatch"
    assert result["actual_scene_count"] == 7
    assert result["scenes"] == []


def test_its1_rejects_out_of_range_and_boolean_scene_count():
    import pytest
    for count in (True, 1, 13, "5", 5.5):
        with pytest.raises(ValueError, match="integer between 2 and 12"):
            process_request(
                title="Chicago", required_scene_count=count, creative_first=True,
                dry_run=True,
            )


def test_worker_and_runner_forward_exact_scene_count():
    from pathlib import Path
    runner_root = Path(__file__).resolve().parents[1]
    stage = (runner_root / "stages" / "its1.py").read_text()
    worker = (runner_root.parents[1] / "apps" / "studio-api" / "worker-functions-02.mjs").read_text()
    assert '"required_scene_count": extra.get("required_scene_count")' in stage
    assert 'required_scene_count: Number.isInteger(requiredSceneCount)' in worker
    assert "requiredSceneCount: sceneDirections.requested_count" in worker
    assert "parsed.length === requiredSceneCount" in worker
