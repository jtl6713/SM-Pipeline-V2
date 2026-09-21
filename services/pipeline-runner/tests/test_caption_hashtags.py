import json

from fbs3.caption import reel_description
from p3.helpers import caption_with_hashtags
from studio_produce.steps import apply_caption
from ttd.package import photo_description
from yt.package import description_final, package_fields


def _record(caption="Walk the city.", hashtags="#Chicago #Travel"):
    return {
        "id": "recTEST",
        "fields": {
            "Output_ID": "999",
            "Output_Title": "Test",
            "Output_Caption": caption,
            "Output_Hashtags": hashtags,
        },
    }


def test_caption_with_hashtags_appends_only_missing_tokens():
    assert caption_with_hashtags(
        "Walk the city. #Chicago",
        "#Chicago #Travel #Explore",
    ) == "Walk the city. #Chicago\n\n#Travel #Explore"


def test_publish_surfaces_do_not_duplicate_embedded_hashtags():
    record = _record("Walk the city.\n\n#Chicago #Travel")
    expected = "Walk the city.\n\n#Chicago #Travel"
    assert reel_description(record) == expected
    assert photo_description(record) == expected
    assert description_final(record) == expected


def test_youtube_package_persists_separate_tags_json():
    record = _record("Walk the city.\n\n#Chicago #Travel")
    fields = package_fields(
        record,
        {"privacy": "public", "category_id": "22", "made_for_kids": "false", "synthetic": "false"},
        source_url="https://example.com/video.mp4",
        prepared_at="2026-09-21T12:00:00Z",
    )
    assert json.loads(fields["YouTube_Tags_JSON"]) == ["Chicago", "Travel"]
    assert fields["YouTube_Description_Final"] == "Walk the city.\n\n#Chicago #Travel"


class _CaptionClient:
    def __init__(self):
        self.updates = []

    def update_record(self, table_id, record_id, fields, typecast=False):
        self.updates.append((table_id, record_id, fields, typecast))
        return {"id": record_id, "fields": fields}


def test_studio_apply_caption_backfills_parent_hashtags_to_existing_output_caption():
    client = _CaptionClient()
    parent = {
        "id": "recPARENT",
        "fields": {
            "Caption": "Beverly Hills after dusk.",
            "Hashtags": "#BeverlyHills #LosAngeles #ExploreLA",
        },
    }
    output = {
        "id": "recOUTPUT",
        "fields": {
            "Output_Caption": "Beverly Hills after dusk.",
            "Output_Hashtags": "",
        },
    }

    apply_caption(client, parent, [output], {})

    assert len(client.updates) == 1
    _, record_id, patch, typecast = client.updates[0]
    assert record_id == "recOUTPUT"
    assert patch["Output_Hashtags"] == "#BeverlyHills #LosAngeles #ExploreLA"
    assert patch["Output_Caption"].endswith("#BeverlyHills #LosAngeles #ExploreLA")
    assert typecast is True
