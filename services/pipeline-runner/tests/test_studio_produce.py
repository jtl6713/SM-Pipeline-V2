import json
from datetime import datetime, timezone

from render.fields import first_linked_id, linked_ids
from studio_produce.constants import STEP_LABELS, STEP_PERCENT
from studio_produce.context import outputs_formula
from studio_produce.job import derive_route, finished_origin_kind, is_finished_route, job_is_stale, job_is_terminal, new_job, next_step, parse_job, with_step
from studio_produce.queue import master_transfer_id, rebuild_variant_manifest, required_ratios, variant_transfer_id
from studio_produce.stamp import finished_source_package, is_native_photo, stamp_fields
from studio_produce.steps import pick_resume_step, thumbnail_required, voiceover_required
from studio_produce.thumbnail_prompt import COLORFUL_3D_RULE, build_finished_thumbnail_prompt


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


def test_derive_route_finished_video():
    route = derive_route(
        {
            "Production_Notes": "origin=ez-wizard; ez-input=finished-video. Finished passthrough.",
            "Studio_Master_Assets_JSON": '[{"id":"v1","source":"upload","url":"https://media.chicagoshining.com/studio/master-assets/x.mp4"}]',
        },
        [{"fields": {"Studio_Output_Type": "Reel", "Platform": "Instagram"}}],
    )
    assert route == "finished-video:passthrough"
    assert is_finished_route(route)
    assert finished_origin_kind({"Production_Notes": "ez-input=finished-video"}) == "finished-video"


def test_derive_route_finished_stills():
    route = derive_route(
        {
            "Production_Notes": "origin=ez-wizard; ez-input=finished-stills",
            "Studio_Master_Assets_JSON": '[{"id":"a1","source":"upload"}]',
        },
        [{"fields": {"Studio_Output_Type": "Carousel", "Platform": "Instagram"}}],
    )
    assert route == "finished-stills:passthrough"
    assert finished_origin_kind({"Production_Request_Notes": "ez-input=finished-carousel"}) == "finished-stills"


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


def test_voiceover_not_needed_does_not_require_p2():
    request = {"fields": {"Voiceover_Mode": "Yes", "Thumbnail_Mode": "Yes"}}
    parent = {"fields": {"Voiceover_Status": "Not Needed"}}
    assert voiceover_required(request, parent) is False
    assert voiceover_required({"fields": {"Voiceover_Mode": "Yes"}}, {"fields": {"Voiceover_Status": "Ready"}}) is True
    assert thumbnail_required({"fields": {"Thumbnail_Mode": "Yes"}}) is True
    assert thumbnail_required({"fields": {"Thumbnail_Mode": "Use Photo Frame"}}) is False


def test_pick_resume_step_jumps_to_stamp_when_selected():
    request = {"fields": {"Studio_Variant_Status": "Ready"}}
    outputs = [{"fields": {"Asset_Selection_Status": "Selected", "Output_Status": "In Production"}}]
    assert pick_resume_step(request, outputs) == "stamp"
    ready = [{"fields": {
        "Output_Status": "Ready for Review",
        "Final_File_URL": "https://media.chicagoshining.com/studio/previews/x.mp4",
    }}]
    assert pick_resume_step(request, ready) == "done"


def test_native_photo_detection():
    assert is_native_photo("Instagram", "Single Image")
    assert is_native_photo("Facebook", "Multi-Image Post")
    assert not is_native_photo("Instagram", "Story")
    assert not is_native_photo("Instagram", "Reel")
    assert not is_native_photo("TikTok", "Video Draft")


def test_finished_video_package_skips_crops():
    request = {
        "id": "recPRFinished",
        "fields": {
            "Production_Notes": "origin=ez-wizard; ez-input=finished-video",
            "Studio_Variant_Status": "Not Needed",
            "Studio_Master_Assets_JSON": json.dumps([{
                "id": "v1",
                "order": 1,
                "name": "final.mp4",
                "mime_type": "video/mp4",
                "url": "https://media.chicagoshining.com/studio/master-assets/final.mp4",
            }]),
        },
    }
    output = {"id": "recPO1", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel"}}
    package = finished_source_package(request, output, None)
    assert package["finished"] is True
    assert package["finished_kind"] == "finished-video"
    assert package["clips"][0]["overlay"] is None
    fields = stamp_fields(package, None)
    assert fields["Output_Status"] == "Ready for Review"
    assert fields["Render_Status"] == "Rendered"
    assert fields["Final_File_URL"].endswith(".mp4")
    assert fields["Composition_ID"] is None


def test_finished_stills_package_is_native():
    request = {
        "id": "recPRStills",
        "fields": {
            "Production_Notes": "origin=ez-wizard; ez-input=finished-stills",
            "Studio_Master_Assets_JSON": json.dumps([
                {"id": "a1", "order": 1, "name": "one.jpg", "mime_type": "image/jpeg", "url": "https://media.chicagoshining.com/studio/master-assets/one.jpg"},
                {"id": "a2", "order": 2, "name": "two.jpg", "mime_type": "image/jpeg", "url": "https://media.chicagoshining.com/studio/master-assets/two.jpg"},
            ]),
        },
    }
    output = {"id": "recPO2", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Carousel"}}
    package = finished_source_package(request, output, None)
    assert package["native"] is True
    assert package["clip_count"] == 2
    fields = stamp_fields(package, None)
    assert fields["Render_Status"] == "Native Photo Route"
    assert fields["Output_Status"] == "Ready for Review"
    assert not fields.get("Final_File_URL")


def test_finished_thumbnail_prompt_requires_colorful_3d():
    prompt = build_finished_thumbnail_prompt(
        {"fields": {"Requested_Title": "Rainy Chicago"}},
        {"fields": {"Caption": "Lake Shore Drive at dusk"}},
    )
    assert "Rainy Chicago" in prompt
    assert "Lake Shore Drive" in prompt
    assert "colorful 3D block lettering" in prompt
    assert COLORFUL_3D_RULE in prompt
    assert "Do not use" in prompt and "black-and-gold" in prompt
