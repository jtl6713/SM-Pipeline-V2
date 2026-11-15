from item4.constants import SMV1_PENDING_CROP_FORMULA, SMV1_PRODUCTION_FORMULA
from queue_reads import queue_formula_filter, try_list_queue_records


def test_ready_lists_do_not_require_airtable_depth_probe(monkeypatch):
    """Phase6 SoR Ready selectors must not fall through for a short Ready copy."""
    seen = []

    def fake_rest(settings, path, method):
        seen.append(path)
        assert "offset=4999" not in path
        return [{"airtable_record_id": "recQ1", "status": "Ready", "payload": {}}]

    monkeypatch.setattr("queue_reads._rest", fake_rest)
    rows = try_list_queue_records(
        {"studio_phase6_write_source": "supabase", "supabase_url": "https://example.supabase.co", "supabase_service_role_key": "x"},
        formula='AND({Test_Run_ID}=BLANK(),{Transfer_Status}="Ready")',
        max_records=5,
    )
    assert rows is not None
    assert rows[0]["id"] == "recQ1"
    assert not any("offset=4999" in p for p in seen)


def test_crop_and_variant_selectors_translate():
    crop = queue_formula_filter(f'AND({{Test_Run_ID}}=BLANK(),{SMV1_PENDING_CROP_FORMULA})')
    assert crop is not None
    assert "payload->>asset_kind.eq.Platform Variant" in crop
    assert "status.eq.Pending" in crop
    assert "status.eq.Drive Uploaded" in crop
    processing = queue_formula_filter('AND({Test_Run_ID}=BLANK(),{Transfer_Status}="Processing")')
    assert "status.eq.Processing" in processing
    error = queue_formula_filter('AND({Test_Run_ID}=BLANK(),{Transfer_Status}="Error")')
    assert "status.eq.Error" in error
    assert queue_formula_filter(SMV1_PRODUCTION_FORMULA) is not None
    assert queue_formula_filter('FIND("rec", {Error_Message})') is None
