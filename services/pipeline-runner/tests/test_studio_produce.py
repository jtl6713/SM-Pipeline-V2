import json
from datetime import datetime, timezone

from render.fields import first_linked_id, linked_ids
from studio_produce.constants import STEP_LABELS, STEP_PERCENT
from studio_produce.context import outputs_formula
from studio_produce.job import derive_route, finished_origin_kind, is_finished_route, job_is_stale, job_is_terminal, new_job, next_step, parse_job, with_step
from studio_produce.queue import master_transfer_id, rebuild_variant_manifest, required_ratios, ratios_for_asset, variant_transfer_id
from studio_produce.media import asset_is_video, playable_url
from studio_produce.queue import rebuild_variant_manifest
from studio_produce.stamp import assign_clip_frames, finished_source_package, is_native_photo, source_package, stamp_fields
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
    youtube_plan = {
        "items": [
            {"aspect_ratio": "9:16", "platform": "Instagram"},
            {"aspect_ratio": "4:5", "platform": "Facebook"},
            {"aspect_ratio": "9:16", "platform": "YouTube"},
        ]
    }
    assets = [{"id": "hero", "order": 1}, {"id": "two", "order": 2}, {"id": "three", "order": 3}]
    assert ratios_for_asset(youtube_plan, assets[0], assets) == ["9:16", "4:5", "16:9"]
    assert ratios_for_asset(youtube_plan, assets[1], assets) == ["9:16", "4:5"]
    assert ratios_for_asset(youtube_plan, assets[2], assets) == ["9:16", "4:5"]


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


def test_rebuild_manifest_youtube_cover_only_on_hero():
    request_id = "recPR"
    assets = [
        {"id": "hero", "order": 1, "name": "one.jpg"},
        {"id": "two", "order": 2, "name": "two.jpg"},
        {"id": "three", "order": 3, "name": "three.jpg"},
    ]
    plan = {
        "items": [
            {"aspect_ratio": "9:16", "platform": "Instagram"},
            {"aspect_ratio": "4:5", "platform": "Facebook"},
            {"aspect_ratio": "9:16", "platform": "YouTube"},
        ]
    }
    ratios = required_ratios(plan)
    manifest = rebuild_variant_manifest(request_id, assets, ratios, [], plan=plan)
    assert "16:9" in ratios
    assert manifest["plan_target_count"] == 6
    assert manifest["target_count"] == 7


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
    assert thumbnail_required(
        {"fields": {"Thumbnail_Mode": "No"}},
        [{"fields": {"Studio_Output_Type": "Reel"}}],
    ) is True
    assert thumbnail_required(
        {"fields": {"Studio_Output_Plan_JSON": '{"items":[{"output_type":"Short","platform":"YouTube"}]}', "Thumbnail_Mode": "Use photo frame"}},
    ) is True


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


def test_clip_origin_is_not_finished_passthrough():
    assert finished_origin_kind({"Production_Notes": "origin=ez-wizard; ez-input=photos-and-clips"}) == ""
    route = derive_route(
        {
            "Production_Notes": "origin=ez-wizard; ez-input=photos-and-clips",
            "Studio_Master_Assets_JSON": json.dumps([
                {"id": "p1", "mime_type": "image/jpeg"},
                {"id": "v1", "mime_type": "video/mp4", "media_kind": "video"},
            ]),
        },
        [{"fields": {"Studio_Output_Type": "Reel", "Platform": "Instagram"}}],
    )
    assert route == "uploaded:photo_sequence"
    assert not is_finished_route(route)


def test_rebuild_manifest_video_skips_jpeg_crop():
    assets = [
        {
            "id": "clip1",
            "order": 1,
            "name": "walk.mp4",
            "mime_type": "video/mp4",
            "media_kind": "video",
            "google_drive_file_id": "dvid",
            "media_asset_record_id": "recVID0000000001",
            "url": "https://media.chicagoshining.com/studio/previews/walk.mp4",
            "duration_seconds": 8,
        }
    ]
    manifest = rebuild_variant_manifest("recPR", assets, ["9:16"], [], plan={"items": [{"aspect_ratio": "9:16"}]})
    assert manifest["plan_complete"] is True
    assert manifest["assets"][0]["variants"]["9:16"]["recipe_version"] == "video-passthrough"
    assert manifest["assets"][0]["variants"]["9:16"]["preview_url"].endswith("walk.mp4")


def test_mixed_stamp_uses_video_trim_and_photo_floor():
    request = {
        "id": "recPRMix",
        "fields": {
            "Production_Notes": "origin=ez-wizard; ez-input=photos-and-clips",
            "Studio_Variant_Status": "Ready",
            "Studio_Master_Assets_JSON": json.dumps([
                {"id": "p1", "order": 1, "name": "one.jpg", "mime_type": "image/jpeg", "caption": ""},
                {
                    "id": "v1",
                    "order": 2,
                    "name": "two.mp4",
                    "mime_type": "video/mp4",
                    "media_kind": "video",
                    "duration_seconds": 6,
                    "in_seconds": 1,
                    "out_seconds": 5,
                    "google_drive_file_id": "video-drive-id",
                },
            ]),
            "Studio_Variant_Manifest_JSON": json.dumps({
                "assets": [
                    {
                        "id": "p1",
                        "order": 1,
                        "name": "one.jpg",
                        "variants": {
                            "9:16": {
                                "preview_url": "https://media.chicagoshining.com/one.jpg",
                                "media_asset_record_id": "recPHOTO00000001",
                                "file_name": "one.jpg",
                            }
                        },
                    },
                    {
                        "id": "v1",
                        "order": 2,
                        "name": "two.mp4",
                        "media_kind": "video",
                        "variants": {
                            "9:16": {
                                "preview_url": "https://media.chicagoshining.com/two.mp4",
                                "media_asset_record_id": "recVIDEO00000001",
                                "file_name": "two.mp4",
                                "media_kind": "video",
                            }
                        },
                    },
                ]
            }),
            "Studio_Output_Plan_JSON": json.dumps({
                "items": [{"platform": "Instagram", "output_type": "Reel", "aspect_ratio": "9:16"}]
            }),
        },
    }
    output = {"id": "recPOMix", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel", "Aspect_Ratio": "9:16"}}
    package = source_package(request, output, None)
    assert package is not None
    assert package["composition_id"] == "ChicagoShiningPhotoSequence"
    assert package["native"] is False
    kinds = [clip["media_kind"] for clip in package["clips"]]
    assert kinds == ["photo", "video"]
    video = package["clips"][1]
    assert video["durationFrames"] == 120
    assert video["startFromSeconds"] == 1
    assert video["url"] == "https://media.chicagoshining.com/two.mp4"
    assert video["google_drive_file_id"] == "video-drive-id"
    assert json.loads(package["render_clip_list_json"])[1]["googleDriveFileId"] == "video-drive-id"
    fields = stamp_fields(package, None)
    assert fields["Composition_ID"] == "ChicagoShiningPhotoSequence"
    assert fields["Render_Status"] == "Ready for Render"
    assert json.loads(fields["Selected_Assets_JSON"])["authority"] == "studio_owner_uploaded_exact_source"


def test_assign_clip_frames_scales_photos_not_video():
    clips = [
        {"source": {"media_kind": "photo"}},
        {"source": {"media_kind": "video", "duration_seconds": 10, "in_seconds": 0, "out_seconds": 10}},
    ]
    frames, total = assign_clip_frames(
        clips,
        story=False,
        effective={"video_duration_seconds": 16},
        request={"fields": {"Video_Duration_Seconds": 16}},
        output=None,
    )
    assert frames[1] == 300
    assert frames[0] == 180
    assert total == 480


def test_asset_is_video_helper():
    assert asset_is_video({"media_kind": "video"})
    assert asset_is_video({"name": "clip.mov"})
    assert not asset_is_video({"media_kind": "photo", "name": "clip.mov"})


def test_video_playable_url_uses_drive_authority_not_poster():
    assert playable_url({
        "media_kind": "video",
        "google_drive_file_id": "video-drive-id",
        "google_drive_url": "https://drive.google.com/file/d/video-drive-id/view",
        "preview_url": "https://media.example/video-poster.jpg",
    }) == "https://drive.google.com/file/d/video-drive-id/view"


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
