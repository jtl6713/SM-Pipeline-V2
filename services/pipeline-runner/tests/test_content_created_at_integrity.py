"""Content Items must never supply null creation timestamps to Supabase."""
from supabase_pipeline import _content_row, _partial_patch


def test_content_create_missing_timestamp_omits_created_at():
    row = _content_row({
        "id": "recContent1234567",
        "fields": {"Content_ID": 3001, "Content_Title": "LA storyboard"},
    }, "profile-uuid")
    assert "created_at" not in row
    assert row["content_number"] == 3001


def test_content_create_preserves_source_timestamps():
    value = "2026-11-16T08:10:00.000Z"
    row = _content_row({
        "id": "recContent1234567",
        "createdTime": value,
        "fields": {"Content_ID": 3001},
    }, "profile-uuid")
    assert row["created_at"] == value
    supplied = "2026-11-15T07:00:00.000Z"
    row = _content_row({
        "id": "recContent1234567",
        "createdTime": value,
        "fields": {"Content_ID": 3001, "Created_At": supplied},
    }, "profile-uuid")
    assert row["created_at"] == supplied


def test_sparse_content_patch_does_not_mutate_original_creation_time():
    assert "created_at" not in _partial_patch({
        "fields": {"Content_Status": "Thumbnail Ready", "Created_At": None}
    }, "content")
    assert "created_at" not in _partial_patch({
        "fields": {"Created_At": "2026-11-20T00:00:00.000Z"}
    }, "content")
