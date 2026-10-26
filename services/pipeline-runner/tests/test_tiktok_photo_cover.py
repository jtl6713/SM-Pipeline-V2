"""Regression coverage for TikTok photo-carousel grid covers."""
import json
import pytest
from ttd.cover import TikTokPhotoCoverError, prepare_photo_cover_manifest
from ttd.package import cover_text, handoff_email_text, image_count_label, photo_cover_attached

BASE = "https://media.chicagoshining.com/publish/"
COVER = BASE + "platform-output-123/cover.jpg"
A, B = BASE + "slides/a.jpg", BASE + "slides/b.jpg"


def record(cover=COVER, draft="Photo Carousel", manifest=None):
    return {"fields": {
        "Output_ID": "123", "Thumbnail_URL": cover, "TikTok_Draft_Type": draft,
        "TikTok_Draft_Assets_JSON": json.dumps(manifest or []),
    }}


def test_cover_insertion_does_not_change_approved_slide_order(monkeypatch):
    from ttd import cover
    monkeypatch.setattr(cover, "ensure_public_cover_url", lambda *a, **kw: COVER)
    approved = [A, B]
    manifest, index = prepare_photo_cover_manifest(None, record(), approved)
    assert (manifest, index) == ([COVER, A, B], 0)
    assert approved == [A, B]
    assert prepare_photo_cover_manifest(None, record(), manifest) == (manifest, 0)


def test_cover_already_present_selects_correct_index_without_reordering(monkeypatch):
    from ttd import cover
    monkeypatch.setattr(cover, "ensure_public_cover_url", lambda *a, **kw: COVER)
    assert prepare_photo_cover_manifest(None, record(), [A, COVER, B]) == ([A, COVER, B], 1)


def test_single_photo_never_adds_a_cover(monkeypatch):
    from ttd import cover
    monkeypatch.setattr(cover, "ensure_public_cover_url", lambda *a, **kw: (_ for _ in ()).throw(AssertionError("should not stage")))
    assert prepare_photo_cover_manifest(None, record(), [A]) == ([A], 0)


def test_missing_cover_blocks_incorrect_grid_upload(monkeypatch):
    from ttd import cover
    monkeypatch.setattr(cover, "ensure_public_cover_url", lambda *a, **kw: "")
    with pytest.raises(TikTokPhotoCoverError, match="requires a designed"):
        prepare_photo_cover_manifest(None, record(cover=""), [A, B])


def test_no_room_never_discards_approved_images(monkeypatch):
    from ttd import cover
    monkeypatch.setattr(cover, "ensure_public_cover_url", lambda *a, **kw: COVER)
    with pytest.raises(TikTokPhotoCoverError, match="no room"):
        prepare_photo_cover_manifest(None, record(), [A, B], max_photos=2)


def test_nonpublic_or_wrong_extension_rejected(monkeypatch):
    from ttd import cover
    monkeypatch.setattr(cover, "ensure_public_cover_url", lambda *a, **kw: "https://drive.google.com/picture.jpg")
    with pytest.raises(TikTokPhotoCoverError, match="verified media domain"):
        prepare_photo_cover_manifest(None, record(), [A, B])
    monkeypatch.setattr(cover, "ensure_public_cover_url", lambda *a, **kw: BASE + "cover.png")
    with pytest.raises(TikTokPhotoCoverError, match="JPG or WebP"):
        prepare_photo_cover_manifest(None, record(), [A, B])


def test_email_confirms_auto_selected_cover_and_counts_real_package():
    output = record(manifest=[COVER, A, B])
    assert photo_cover_attached(output)
    assert image_count_label(output) == "3"
    assert "Included in carousel" in cover_text(output)
    assert "Confirm the included 3D cover" in handoff_email_text(output)


def test_old_draft_without_cover_has_manual_fallback_instructions():
    output = record(manifest=[A, B])
    assert not photo_cover_attached(output)
    assert "Not attached" in cover_text(output)
