import pytest

from airtable.constants import CAROUSEL_SLIDES_TABLE
from fb.assets import (
    slide_formula, ready_photo_formula, list_ready_slides, list_ready_photos,
)
from supabase_formula import formula_to_postgrest_filter, attach_formula_filter

OUTPUT_REC = "recABCDEFGHIJKLMN"
OTHER_REC = "recZYXWVUTSRQPONM"


def test_missing_output_number_queries_only_exact_output_record():
    slide = slide_formula("", output_record_id=OUTPUT_REC)
    assert 'FIND("' + OUTPUT_REC + '",ARRAYJOIN({Platform Output}))>0' in slide
    assert 'FIND("",' not in slide
    photo = ready_photo_formula("", "abc0123", output_record_id=OUTPUT_REC)
    assert 'FIND("' + OUTPUT_REC + '",ARRAYJOIN({Platform Output}))>0' in photo
    assert '{FB_Photo_Package_Revision}="abc0123"' in photo
    translated = formula_to_postgrest_filter(CAROUSEL_SLIDES_TABLE, slide)
    assert translated is not None
    assert f"fields->>Platform Output.like.*{OUTPUT_REC}*" in translated
    assert "PO_Output_ID" not in translated
    assert "Shared_Asset_Approved" in translated
    rendered = attach_formula_filter("/rest/v1/carousel_slides?select=*", translated)
    assert "Platform%20Output.like" in rendered
    assert OUTPUT_REC in rendered
    translated_photo = formula_to_postgrest_filter(CAROUSEL_SLIDES_TABLE, photo)
    assert translated_photo is not None and "FB_Photo_ID" in translated_photo


def test_empty_or_unsafe_slide_identity_is_fail_closed():
    for identity in ("", "None", "not-an-id", "1023x"):
        with pytest.raises(ValueError):
            slide_formula(identity)
        with pytest.raises(ValueError):
            ready_photo_formula(identity, "")
    with pytest.raises(ValueError):
        slide_formula("1023", output_record_id="not-record-id")
    with pytest.raises(ValueError):
        ready_photo_formula("", 'rev" OR true', output_record_id=OUTPUT_REC)


def test_numeric_legacy_formula_still_requires_nonempty_number():
    assert "PO_Output_ID" in slide_formula("123")
    assert "PO_Output_ID" in ready_photo_formula("123", "a")


class FakeClient:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def list_records(self, table, **kwargs):
        self.calls.append((table, kwargs))
        return list(self.rows)


def _slide(number, link):
    return {"id": "recSLIDE" + str(number).zfill(10), "fields": {
        "Platform Output": link,
        "Slide Number": number,
        "Current Order": number,
        "Asset_4x5_Public_Status": "Ready",
        "Asset_4x5_Public_URL": "https://media.chicagoshining.com/test.jpg",
    }}


def test_postfilter_excludes_partial_or_cross_output_links():
    valid = _slide(1, [OUTPUT_REC])
    client = FakeClient([
        _slide(2, [OTHER_REC]),
        _slide(3, [OUTPUT_REC, OTHER_REC]),
        valid,
        _slide(4, []),
    ])
    ready = list_ready_slides(client, "", output_record_id=OUTPUT_REC, max_photos=10)
    assert [row["id"] for row in ready] == [valid["id"]]
    assert client.calls[0][0] == CAROUSEL_SLIDES_TABLE
    assert client.calls[0][1]["max_records"] == 11
    photos = list_ready_photos(client, "", "abc", output_record_id=OUTPUT_REC)
    assert [row["id"] for row in photos] == [valid["id"]]
