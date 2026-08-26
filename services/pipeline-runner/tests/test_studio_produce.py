from datetime import datetime, timezone

from render.fields import first_linked_id, linked_ids
from studio_produce.constants import STEP_LABELS, STEP_PERCENT
from studio_produce.context import outputs_formula
from studio_produce.job import derive_route, job_is_stale, job_is_terminal, new_job, next_step, parse_job, with_step
from studio_produce.queue import master_transfer_id, rebuild_variant_manifest, required_ratios, variant_transfer_id
from studio_produce.stamp import is_native_photo


def test_parse_job_empty():
    assert parse_job("") == {}
    assert parse_job("not-json") == {}
    assert parse_job({"step": "crops"})["step"] == "crops"


def test_new_job_and_labels():
    job = new_job(route="ai:photo_sequence")
    assert job["schema_version"] == "studio.production-job.1"
    assert job["step"] == "themes"
    assert job["detail"] == STEP_LABELS["themes"]
    assert job["percent"] == STEP_PERCENT["themes"]
    assert job["job_id"].startswith("spj-")


def test_next_step_and_with_step():
    assert next_step("themes") == "audio"
    assert next_step("render") == "done"
    assert next_step("done") == "done"
    job = new_job(route="uploaded:native_still", step="crops")
    moved = with_step(job, "stamp")
    assert moved["step"] == "stamp"
    assert moved["attempt"] == 1
    retried = with_step(moved, "stamp")
    assert retried["attempt"] == 2
    waiting = with_step(moved, "stamp", detail="Rendering 0/6", bump_attempt=False)
    assert waiting["attempt"] == 1
    assert waiting["detail"] == "Rendering 0/6"


def test_derive_route_ai_photo_sequence():
    route = derive_route(
        {"Carousel_Image_Mode": "Make AI Generated"},
        [{"fields": {"Studio_Output_Type": "Reel", "Platform": "Instagram"}}],
    )
    assert route == "ai:photo_sequence"


def test_derive_route_uploaded_native():
    route = derive_route(
        {
            "Carousel_Image_Mode": "Use Uploaded Photos",
            "Studio_Master_Assets_JSON": '[{"id":"a1","source":"upload"}]',
        },
        [{"fields": {"Studio_Output_Type": "Single Image", "Platform": "Instagram"}}],
    )
    assert route == "uploaded:native_still"


def test_derive_route_mixed():
    route = derive_route(
        {
            "Production_Notes": "ez-input=mixed ez-ai=3 ez-manual=3",
            "Studio_Master_Assets_JSON": '[{"id":"a1","source":"upload"},{"id":"a2","source":"studio_ai"}]',
        },
        [
            {"fields": {"Studio_Output_Type": "Reel"}},
            {"fields": {"Studio_Output_Type": "Single Image"}},
        ],
    )
    assert route == "mixed:mixed_outputs"


def test_job_stale_and_terminal():
    now = datetime(2026, 8, 26, 3, 0, tzinfo=timezone.utc)
    fresh = {"step": "crops", "updated_at": "2026-08-26T02:59:00Z"}
    stale = {"step": "crops", "updated_at": "2026-08-26T02:50:00Z"}
    done = {"step": "done", "updated_at": "2026-08-26T02:00:00Z"}
    assert not job_is_stale(fresh, now=now, stale_after=180)
    assert job_is_stale(stale, now=now, stale_after=180)
    assert not job_is_stale(done, now=now, stale_after=180)
    assert job_is_terminal(done)
    assert not job_is_terminal(stale)
    assert job_is_stale({"step": "themes"}, now=now)


def test_transfer_ids_and_ratios():
    assert variant_transfer_id("recPR", "photo1", "9:16") == "ITEM4-VARIANT-fill-crop-v2-recPR-photo1-9x16"
    assert master_transfer_id("recPR", "photo1") == "ITEM4-MASTER-recPR-photo1"
    assert required_ratios({"items": [{"aspect_ratio": "9:16", "platform": "Instagram"}]}) == ["9:16"]
    assert "16:9" in required_ratios({"items": [{"aspect_ratio": "9:16", "platform": "YouTube"}]})


def test_rebuild_manifest_ready_count():
    request_id = "recPR"
    assets = [{"id": "a1", "order": 1, "name": "one.jpg", "google_drive_file_id": "d1", "media_asset_record_id": "recM"}]
    transfer_id = variant_transfer_id(request_id, "a1", "9:16")
    rows = [{
        "fields": {
            "Transfer_ID": transfer_id,
            "Transfer_Status": "Ready",
            "Preview_Status": "Ready",
            "Preview_URL": "https://media.chicagoshining.com/crop.jpg",
            "Drive_File_ID": "vd1",
            "Source_Media_Asset": ["recV"],
            "Target_File_Name": "one__9x16__fill-crop-v2.jpg",
        }
    }]
    manifest = rebuild_variant_manifest(request_id, assets, ["9:16"], rows)
    assert manifest["ready_count"] == 1
    assert manifest["plan_ready_count"] == 1
    assert manifest["plan_complete"] is True
    assert manifest["assets"][0]["variants"]["9:16"]["preview_url"].startswith("https://media.")


def test_first_linked_id_accepts_record_objects():
    assert first_linked_id(["recParent12345678"]) == "recParent12345678"
    assert first_linked_id([{"id": "recParent12345678", "name": "102"}]) == "recParent12345678"
    assert linked_ids(["recA123456789012", {"id": "recB123456789012"}]) == ["recA123456789012", "recB123456789012"]


def test_outputs_formula_uses_content_id():
    formula = outputs_formula("recPR", content_id=102)
    assert "102" in formula
    assert 'ARRAYJOIN({Content_Item})' in formula
    assert "recParent" in outputs_formula("recPR", "recParent")


def test_native_photo_detection():
    assert is_native_photo("Instagram", "Single Image")
    assert is_native_photo("Facebook", "Multi-Image Post")
    assert not is_native_photo("Instagram", "Story")
    assert not is_native_photo("Instagram", "Reel")
    assert not is_native_photo("TikTok", "Video Draft")
