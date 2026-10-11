from r2.studio_exact_source import (
    build_exact_source_selection,
    requires_openai_for_output,
)


def _output(**fields):
    return {"id": "recOUT1", "fields": fields}


def _content(**fields):
    return {"id": "recCI1", "fields": fields}


def test_requires_openai_false_for_locked_exact_source_package():
    content = _content(
        Studio_Source_Authority_Status="Ready",
        Studio_Source_Selected_Assets_JSON='{"selected_clips":[{"media_asset_record_id":"recA","google_drive_url":"https://drive.google.com/file/d/a/view","durationFrames":90}]}',
    )
    output = _output(
        Asset_Selection_Notes="Studio exact source authority",
        Preferred_Music_Media_Asset_ID="recMusic1",
    )
    assert requires_openai_for_output(output, content) is False
    selection = build_exact_source_selection(
        output=output,
        content_item=content,
        music_candidates=[{
            "id": "recMusic1",
            "fields": {
                "Asset Name": "Track",
                "Google Drive URL": "https://drive.google.com/file/d/m/view",
                "Duration_Seconds": 120,
            },
        }],
        required_music_seconds=30,
    )
    assert selection is not None
    assert selection["route"] == "exact_source_skip_openai"
    assert selection["parsed"]["selection_status"] == "Selected"
    assert selection["parsed"]["selected_clips"][0]["media_asset_record_id"] == "recA"
    assert selection["parsed"]["selected_music"]["media_asset_record_id"] == "recMusic1"


def test_requires_openai_true_without_locked_clips():
    content = _content(
        Studio_Source_Authority_Status="Ready",
        Studio_Source_Selected_Assets_JSON='{"selected_clips":[]}',
    )
    output = _output(Asset_Selection_Notes="Studio exact source authority")
    assert requires_openai_for_output(output, content) is True
    assert build_exact_source_selection(output=output, content_item=content) is None
