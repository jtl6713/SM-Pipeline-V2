"""Issue #2374: never advance a conflicting C8/C9 final gallery to Ready."""

from c8 import processor as c8
from c9 import processor as c9
from carousel.mapping import final_gallery_identity_reason


def slide(n, *, record_id=None, output_id=None):
    fields = {
        "Platform": "Instagram",
        "Platform_Output_Type": "Instagram Carousel",
        "AI Image Ratio": "4:5",
        "Aspect Ratio": "4:5",
        "Slide Number": n,
        "Current Order": n,
        "Slide Name": f"Slide {n}",
        "Review Status": "Final Approved",
        "Approved For Final": True,
        "Deleted From Carousel": False,
        "Final Image URL": f"https://media.chicagoshining.com/lettered/{n}.jpg",
        "Final Google Drive File ID": f"file-{n}",
    }
    if output_id:
        fields["Platform Output"] = [output_id]
    return {"id": record_id or f"rec{n:014d}", "fields": fields}


def test_gallery_gate_rejects_ambiguous_and_incomplete_sets():
    assert final_gallery_identity_reason([slide(1), slide(2)], min_slides=2, max_slides=10) is None
    assert final_gallery_identity_reason([slide(1)], min_slides=2) == "insufficient_final_slides"
    assert final_gallery_identity_reason([slide(1), slide(1, record_id="rec00000000000003")]) == (
        "duplicate_final_slide_number_or_identity"
    )
    assert final_gallery_identity_reason([slide(1), slide(3)]) == "noncontiguous_final_slide_sequence"
    assert final_gallery_identity_reason([slide(1), slide(2, record_id="rec00000000000001")]) == (
        "duplicate_final_slide_number_or_identity"
    )
    assert final_gallery_identity_reason([slide(1), slide(2.0)], min_slides=2) is None
    assert final_gallery_identity_reason([slide(1), slide(2.5)]) == "invalid_final_slide_number"
    assert final_gallery_identity_reason([slide(n) for n in range(1, 12)], max_slides=10) == (
        "too_many_final_slides_for_platform"
    )


def test_c8_conflicting_approved_creative_set_never_creates_or_updates_output(monkeypatch):
    parent = {
        "id": "recPARENT00000000",
        "fields": {
            "Content_ID": 1930,
            "Content_Title": "Chinatown Dumpling Hop",
            "Caption": "A photo walk",
        },
    }
    variants = [slide(1), slide(1, record_id="rec00000000000003")]
    class NoWriteClient:
        def create_records(self, *_a, **_kw):
            raise AssertionError("must not create an output for duplicate slides")

        def update_record(self, *_a, **_kw):
            raise AssertionError("must not mutate an output or slide for duplicate slides")

        def list_records(self, *_a, **_kw):
            raise AssertionError("must not even scan for an existing output yet")

    monkeypatch.setattr(c8, "AirtableClient", NoWriteClient)
    monkeypatch.setattr(c8, "load_parent", lambda *_a, **_kw: parent)
    monkeypatch.setattr(c8, "load_linked_slides", lambda *_a, **_kw: variants)
    monkeypatch.setattr(c8, "_trigger_c9", lambda *_a, **_kw: (_ for _ in ()).throw(
        AssertionError("no C9 publish-ready handoff for duplicate slides")
    ))
    result = c8.process_request(content_item_record_id=parent["id"])
    assert result["processed"] is True
    assert len(result["outputs"]) == 1
    assert result["outputs"][0]["blocked"] is True
    assert result["outputs"][0]["reason"] == "duplicate_final_slide_number_or_identity"
    assert result["outputs"][0]["graph_creates"] == 0


def test_c9_will_not_mark_ambiguous_or_single_image_instagram_carousel_ready(monkeypatch):
    output_id = "recOUTPUT00000000"
    output = {
        "id": output_id,
        "fields": {
            "Content_Item": ["recPARENT00000000"],
            "Platform": "Instagram",
            "Platform_Output_Type": "Instagram Carousel",
        },
    }
    linked = [slide(1, output_id=output_id), slide(1, record_id="rec00000000000003", output_id=output_id)]
    class NoWriteClient:
        def list_records(self, *_a, **_kw):
            return [output]

        def update_record(self, *_a, **_kw):
            raise AssertionError("ambiguous carousel cannot become Ready to Publish")

    monkeypatch.setattr(c9, "AirtableClient", NoWriteClient)
    monkeypatch.setattr(c9, "load_parent", lambda *_a, **_kw: {"id": "recPARENT00000000"})
    monkeypatch.setattr(c9, "load_linked_slides", lambda *_a, **_kw: linked)
    result = c9.process_request(output_record_id=output_id)
    assert result["processed"] is False
    assert result["reason"] == "duplicate_final_slide_number_or_identity"
    assert result["graph_creates"] == 0

    linked[:] = [slide(1, output_id=output_id)]
    result = c9.process_request(output_record_id=output_id)
    assert result["processed"] is False
    assert result["reason"] == "insufficient_final_slides"


def test_c9_valid_two_slide_gallery_can_still_be_marked_ready(monkeypatch):
    output_id = "recOUTPUT00000000"
    output = {
        "id": output_id,
        "fields": {
            "Content_Item": ["recPARENT00000000"],
            "Platform": "Instagram",
            "Platform_Output_Type": "Instagram Carousel",
        },
    }
    updates = []
    class CapturingClient:
        def list_records(self, *_a, **_kw):
            return [output]

        def update_record(self, _table, _id, fields):
            updates.append(dict(fields))

    monkeypatch.setattr(c9, "AirtableClient", CapturingClient)
    monkeypatch.setattr(c9, "load_parent", lambda *_a, **_kw: {"id": "recPARENT00000000"})
    monkeypatch.setattr(c9, "load_linked_slides", lambda *_a, **_kw: [
        slide(1, output_id=output_id), slide(2, output_id=output_id),
    ])
    response = c9.process_request(output_record_id=output_id)
    assert response["processed"] is True
    assert updates == [{"Publish_Status": "Ready to Publish"}]
