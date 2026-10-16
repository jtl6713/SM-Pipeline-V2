import json

from fbs3.caption import reel_description
from p3.helpers import caption_for_notification, caption_with_hashtags
from rr1.email_builder import build_review_card
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


def test_review_email_caption_block_contains_hashtags_once():
    record = _record("Walk the city.", "#Chicago #Travel")
    card = build_review_card(record, decision_webhook_url="https://example.com/review")
    assert "Caption + hashtags" in card
    assert card.count("#Chicago") == 1
    assert card.count("#Travel") == 1


def test_notification_caption_keeps_at_most_five_hashtags():
    tags = "#One #Two #Three #Four #Five #Six #Seven"
    shown = caption_for_notification("Walk the city.", tags)
    assert shown == "Walk the city.\n\n#One #Two #Three #Four #Five"
    assert "#Six" not in shown
    assert "#Seven" not in shown
    assert caption_with_hashtags("Walk the city.", tags).count("#") == 7


def test_review_email_caption_block_stops_at_five_hashtags():
    record = _record(
        "Walk the city. #Chicago",
        "#Chicago #Travel #Food #Night #Skyline #Extra #More",
    )
    card = build_review_card(record, decision_webhook_url="https://example.com/review")
    assert "#Chicago" in card
    assert "#Travel" in card
    assert "#Food" in card
    assert "#Night" in card
    assert "#Skyline" in card
    assert "#Extra" not in card
    assert "#More" not in card
    assert "Walk the city. #Chicago\n\n#Travel #Food #Night #Skyline" in card
