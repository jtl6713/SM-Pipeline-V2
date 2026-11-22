"""#2618: R4 typed metadata must survive Supabase-only full and sparse writes."""

from supabase_pipeline import _output_row, _partial_patch, _positive_render_frames


def test_r3_render_fields_written_to_typed_columns_and_legacy_bag():
    record = {"id": "recNYC2618test001", "fields": {
        "Output_ID": 2618, "Platform": "YouTube", "Format": "Short",
        "Render_Status": "Ready for Render",
        "Output_Filename": "studio-nyc-2618.mp4",
        "Render_Total_Frames": 450,
        "Composition_ID": "ChicagoShiningPhotoSequence",
    }}
    row = _output_row(record, "00000000-0000-0000-0000-000000000001", None)
    assert row["output_filename"] == "studio-nyc-2618.mp4"
    assert row["render_total_frames"] == 450
    assert row["error_messages"]["Output_Filename"] == "studio-nyc-2618.mp4"
    assert row["error_messages"]["Render_Total_Frames"] == 450
    assert row["error_messages"]["Composition_ID"] == "ChicagoShiningPhotoSequence"


def test_sparse_r3_updates_write_typed_columns_without_erasing_unrelated_fields():
    updated = _partial_patch({"id": "recOutput1", "fields": {
        "Output_Filename": " studio-miami.mp4 ", "Render_Total_Frames": "360",
    }}, "output")
    assert updated == {"output_filename": "studio-miami.mp4", "render_total_frames": 360}
    unchanged = _partial_patch({"id": "recOutput1", "fields": {"Render_Status": "Ready for Render"}}, "output")
    assert unchanged == {"render_status": "Ready for Render"}


def test_clear_and_invalid_frame_data_never_admit_render():
    assert _partial_patch({"id": "recOutput1", "fields": {
        "Output_Filename": "", "Render_Total_Frames": 0,
    }}, "output") == {"output_filename": None, "render_total_frames": None}
    for val in (None, "garbled", -1, 1.5):
        assert _positive_render_frames(val) is None
    assert _positive_render_frames("360") == 360
