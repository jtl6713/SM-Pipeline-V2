from its1.processor import normalize_scenes
from its1.prompt import build_timed_script_prompt
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
