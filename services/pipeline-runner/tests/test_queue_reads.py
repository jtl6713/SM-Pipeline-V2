from item4.constants import SMV1_PENDING_CROP_FORMULA, SMV1_PRODUCTION_FORMULA
from queue_reads import _shape, queue_formula_filter, try_list_queue_records


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


def test_shape_densifies_platform_variant_crop_fields():
    """SMV1 needs folder/dims/style from Phase 6 payload or crops never leave Pending."""
    row = _shape({
        "airtable_record_id": "recQcrop1",
        "status": "Pending",
        "payload": {
            "transfer_id": "ITEM4-VARIANT-fill-crop-v2-recPR-a1-9x16",
            "production_request_record_id": "recPR",
            "asset_kind": "Platform Variant",
            "source_drive_file_id": "driveSource1",
            "source_media_asset_id": "recMedia1",
            "aspect_ratio": "9:16",
            "target_drive_folder_id": "folderVariants",
            "target_file_name": "photo 9x16.jpg",
            "variant_style": "fill-crop-v2",
            "width": 1080,
            "height": 1920,
            "source_mime_type": "image/jpeg",
            "source_extension": "jpg",
            "preview_status": "Pending",
        },
    })
    assert row is not None
    fields = row["fields"]
    assert fields["Transfer_Status"] == "Pending"
    assert fields["Target_Drive_Folder_ID"] == "folderVariants"
    assert fields["Target_File_Name"] == "photo 9x16.jpg"
    assert fields["Variant_Style"] == "fill-crop-v2"
    assert fields["Width"] == 1080
    assert fields["Height"] == 1920
    assert fields["Source_MIME_Type"] == "image/jpeg"
    assert fields["Source_Extension"] == "jpg"
    assert fields["Source_Media_Asset"] == ["recMedia1"]
    assert fields["Aspect_Ratio"] == "9:16"


def test_master_original_source_locator_survives_supabase_queue_read():
    row = _shape({
        "airtable_record_id": "recMaster1",
        "status": "Pending",
        "payload": {
            "asset_kind": "Master Original",
            "source_r2_key": "studio/master-assets/recReq/video.mov",
            "source_url": "https://media.chicagoshining.com/studio/previews/video.mp4",
        },
    })
    assert row["fields"]["Source_R2_Key"] == "studio/master-assets/recReq/video.mov"
    assert row["fields"]["Source_URL"].endswith("/video.mp4")


def test_queue_read_preserves_local_admission_deferral(monkeypatch):
    import pytest
    from studio_produce.workload_governor import AdmissionDeferred

    def blocked(*args, **kwargs):
        raise AdmissionDeferred("supabase_read admission deferred")

    monkeypatch.setattr("queue_reads._rest", blocked)
    with pytest.raises(AdmissionDeferred, match="supabase_read"):
        try_list_queue_records(
            {"studio_phase6_write_source": "supabase", "supabase_url": "https://example.supabase.co", "supabase_service_role_key": "x"},
            formula=SMV1_PRODUCTION_FORMULA, max_records=5,
        )


def test_overlapping_smv1_drains_defer_before_queue_reads(monkeypatch, tmp_path):
    import pytest
    from item4 import processor
    from studio_produce import workload_governor as governor

    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH", str(tmp_path / "governor.sqlite"))
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "false")
    seen = []

    def admitted(**kwargs):
        seen.append(kwargs["production_request_record_id"])
        return {"processed_count": 1}

    monkeypatch.setattr(processor, "_process_drain_admitted", admitted)
    with governor.resource_slot("smv1_drain", limit=1, wait_seconds=0):
        with pytest.raises(governor.AdmissionDeferred, match="smv1_drain"):
            processor.process_drain(production_request_record_id="recPilsen")
        assert seen == []
    assert processor.process_drain(production_request_record_id="recPilsen")["processed_count"] == 1
    assert seen == ["recPilsen"]
    assert governor.snapshot()["active_resource_slots"]["smv1_drain"] == 0
