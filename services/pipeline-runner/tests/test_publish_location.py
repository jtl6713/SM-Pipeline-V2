from publish.location import (
    PublishLocation,
    append_location_line,
    location_text_from_records,
    lookup_place_page_id,
    resolve_publish_location,
)
from ap1_ig.caption import reel_create_body


def test_location_from_primary_field():
    content = {"id": "recContent0000001", "fields": {
        "Primary_Location": "Wicker Park",
        "Market_Name": ["Chicago"],
    }}
    output = {"id": "recOutput00000001", "fields": {"Output_Title": "Night lights"}}
    name, market, source = location_text_from_records(output=output, content_item=content)
    assert name == "Wicker Park"
    assert market == "Chicago"
    assert source == "content.Primary_Location"


def test_location_from_andersonville_copy():
    content = {"id": "recContent0000001", "fields": {
        "Content_Title": "A North Side stroll through Andersonville",
        "Idea_Summary": "Clark Street in Andersonville is Chicago at street level.",
        "Market_Name": ["Chicago"],
    }}
    output = {"id": "recOutput00000001", "fields": {}}
    name, market, source = location_text_from_records(output=output, content_item=content)
    assert name == "Andersonville"
    assert market == "Chicago"
    assert source == "copy_match"
    page_id, page_source = lookup_place_page_id(name)
    assert page_id == "213085162"
    assert page_source.startswith("chicago_places")


def test_resolve_publish_location_without_airtable_client():
    content = {"id": "recContent0000001", "fields": {
        "Content_Title": "Sunset at Millennium Park",
        "Market_Name": ["Chicago"],
    }}
    output = {"id": "recOutput00000001", "fields": {"Output_Caption": "Golden hour"}}
    place = resolve_publish_location(
        None,
        output,
        content_item=content,
    )
    assert place is not None
    assert place.name == "Millennium Park"
    assert place.page_id == "213370402"
    assert place.label == "Millennium Park, Chicago"


def test_append_location_line_skips_duplicate():
    place = PublishLocation(name="Andersonville", page_id="213085162", market="Chicago", source="t")
    body = "Walk through Andersonville, Chicago tonight."
    assert append_location_line(body, place) == body
    assert "📍 Andersonville, Chicago" in append_location_line("Quiet streets.", place)


def test_reel_create_body_includes_location_id():
    record = {
        "id": "recABCDEFGHIJKLMN",
        "fields": {
            "Publish_Asset_URL": "https://media.chicagoshining.com/publish/x.mp4",
            "Output_Caption": "Hello",
            "Thumbnail_URL": "https://media.chicagoshining.com/cover.jpg",
        },
    }
    body = reel_create_body(record, location_id="213085162")
    assert body["location_id"] == "213085162"
    bare = reel_create_body(record)
    assert "location_id" not in bare
