import json
from datetime import datetime, timezone

from render.fields import first_linked_id, linked_ids
from p2.processor import _extend_video_duration_for_voiceover
from studio_produce.constants import STEP_LABELS, STEP_PERCENT
from studio_produce.context import outputs_formula
from studio_produce.job import derive_route, finished_origin_kind, is_finished_route, job_is_stale, job_is_terminal, new_job, next_step, parse_job, with_step
from studio_produce.queue import master_transfer_id, rebuild_variant_manifest, required_ratios, ratios_for_asset, variant_transfer_id
from studio_produce.media import asset_is_video, playable_url, remotion_clip_url
from studio_produce.queue import rebuild_variant_manifest
from studio_produce.stamp import assign_clip_frames, duration_seconds, finished_source_package, is_native_photo, output_effective, photo_sequence_url, source_package, stamp_fields
from studio_produce.steps import (
    _is_delay_render_failure,
    pick_resume_step,
    render_progress_detail,
    thumbnail_required,
    voiceover_missing,
    voiceover_required,
)
from studio_produce.thumbnail import cover_content_status_fields
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


def test_delay_render_failure_requeues_exit_code_1():
    assert _is_delay_render_failure(
        {"fields": {"Remotion_Error_Message": "Remotion render failed with exit code 1"}}
    )
    assert _is_delay_render_failure(
        {"fields": {"Final_File_Error_Message": "delayRender() call was not cleared"}}
    )
    assert not _is_delay_render_failure({"fields": {"Remotion_Error_Message": "asset 404"}})


def test_p2_extends_non_story_outputs_instead_of_rejecting_long_voiceover():
    class FakeClient:
        def __init__(self):
            self.updates = []
            self.outputs = {
                "recReel": {"id": "recReel", "fields": {"Studio_Output_Type": "Reel", "Studio_Effective_Voiceover_Mode": "Yes"}},
                "recStory": {"id": "recStory", "fields": {"Studio_Output_Type": "Story", "Studio_Effective_Voiceover_Mode": "No"}},
            }

        def update_record(self, table, record_id, fields, typecast=False):
            self.updates.append((table, record_id, fields))
            return {"id": record_id, "fields": fields}

        def get_record(self, table, record_id):
            return self.outputs[record_id]

    client = FakeClient()
    item = {
        "id": "recContent",
        "fields": {
            "Content_Duration": 30,
            "Voiceover_Tail_Seconds": 2,
            "Platform Outputs": [{"id": "recReel"}, {"id": "recStory"}],
        },
    }
    request = {"id": "recRequest", "fields": {"Video_Duration_Seconds": 30}}
    required = _extend_video_duration_for_voiceover(client, item, request, 32.28)

    assert required == 34.3
    assert any(record_id == "recContent" and fields.get("Content_Duration") == 34.3 for _, record_id, fields in client.updates)
    assert any(record_id == "recRequest" and fields.get("Video_Duration_Seconds") == 34.3 for _, record_id, fields in client.updates)
    assert any(record_id == "recReel" and fields.get("Studio_Effective_Video_Duration_Seconds") == 34.3 for _, record_id, fields in client.updates)
    assert not any(record_id == "recStory" for _, record_id, _ in client.updates)


def test_measured_voiceover_duration_overrides_requested_target_and_extends_render():
    output = {"fields": {"Studio_Effective_Voiceover_Mode": "Yes"}}
    request = {
        "fields": {
            "Voiceover_Mode": "Yes",
            "Voiceover_Duration_Seconds": 15,
            "Video_Duration_Seconds": 30,
            "Voiceover_Tail_Seconds": 2,
        }
    }
    parent = {
        "fields": {
            "Voiceover_URL": "https://example.test/voice.mp3",
            "Voiceover_Duration_Seconds": 32.28,
            "Preferred_Music_URL": "https://example.test/music.mp3",
        }
    }
    effective = output_effective(output, request, parent)
    assert effective["voiceover_duration_seconds"] == 32.28
    assert effective["music_url"] == "https://example.test/music.mp3"
    assert duration_seconds(
        story=False,
        clip_count=10,
        effective=effective,
        request=request,
        output=output,
    ) == 34.3


def test_render_progress_detail_counts_ready_outputs():
    rows = [
        {"fields": {"Output_Status": "Ready for Review", "Final_File_URL": "https://example/a.mp4"}},
        {"fields": {"Output_Status": "In Production", "Render_Status": "Rendering"}},
        {"fields": {"Output_Status": "In Production", "Render_Status": "Rendering"}},
        {"fields": {"Output_Status": "Ready for Review", "Studio_Preview_URL": "https://example/b.mp4"}},
        {"fields": {"Output_Status": "In Production"}},
        {"fields": {"Output_Status": "Ready for Review", "Render_Status": "Native Photo Route"}},
    ]
    assert render_progress_detail(rows) == "Rendering 3/6"
    assert render_progress_detail([]) == "Rendering"
    assert render_progress_detail(None) == "Rendering"


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
        "Studio_Output_Type": "Reel",
        "Final_File_URL": "https://media.chicagoshining.com/studio/previews/x.mp4",
        "Thumbnail_URL": "https://media.chicagoshining.com/studio/previews/thumbnails/recX/cover-9x16.png",
    }}]
    assert pick_resume_step(request, ready) == "done"
    missing_cover = [{"fields": {
        "Output_Status": "Ready for Review",
        "Studio_Output_Type": "Reel",
        "Final_File_URL": "https://media.chicagoshining.com/studio/previews/x.mp4",
    }}]
    assert pick_resume_step(request, missing_cover) == "stamp"
    story_ready = [{"fields": {
        "Output_Status": "Ready for Review",
        "Studio_Output_Type": "Story",
        "Final_File_URL": "https://media.chicagoshining.com/studio/previews/x.mp4",
    }}]
    assert pick_resume_step(request, story_ready) == "done"


def test_pick_resume_step_returns_to_audio_when_voiceover_missing():
    # Output 432 / CI 137: Voiceover_Status said Ready and Content_Status was "Thumbnail Ready",
    # but Voiceover_URL was blank. Resuming at stamp/render made R4 wait forever.
    request = {"fields": {"Voiceover_Mode": "Yes", "Studio_Variant_Status": "Ready"}}
    parent = {"id": "recParent", "fields": {"Voiceover_Status": "Ready", "Content_Status": "Thumbnail Ready"}}
    selected = [{"fields": {"Asset_Selection_Status": "Selected", "Output_Status": "In Production"}}]
    rendering = [{"fields": {"Render_Status": "Ready for Render", "Output_Status": "In Production"}}]
    assert voiceover_missing(request, parent) is True
    assert pick_resume_step(request, selected, parent=parent, route="ai:photo_sequence") == "audio"
    assert pick_resume_step(request, rendering, parent=parent, route="ai:photo_sequence") == "audio"
    # Once narration exists the normal resume rules apply again.
    voiced = {"id": "recParent", "fields": {"Voiceover_Status": "Generated", "Voiceover_URL": "https://drive.google.com/uc?id=vo"}}
    assert voiceover_missing(request, voiced) is False
    assert pick_resume_step(request, selected, parent=voiced, route="ai:photo_sequence") == "stamp"
    # Narration off / not needed never forces the audio step.
    assert voiceover_missing(request, {"fields": {"Voiceover_Status": "Not Needed"}}) is False
    assert pick_resume_step({"fields": {"Voiceover_Mode": "No"}}, selected, parent=parent, route="ai:photo_sequence") == "stamp"
    # Finished-video passthrough never narrates.
    finished = {"fields": {"Voiceover_Mode": "Yes", "Production_Notes": "ez-input=finished-video"}}
    assert voiceover_missing(finished, parent) is False
    assert pick_resume_step(finished, selected, parent=parent, route="finished:passthrough") == "stamp"
    # Finished deliverables still win.
    ready = [{"fields": {
        "Output_Status": "Ready for Review",
        "Studio_Output_Type": "Reel",
        "Final_File_URL": "https://media.chicagoshining.com/studio/previews/x.mp4",
        "Thumbnail_URL": "https://media.chicagoshining.com/studio/previews/thumbnails/recX/cover-9x16.png",
    }}]
    assert pick_resume_step(request, ready, parent=parent, route="ai:photo_sequence") == "done"


def test_cover_write_keeps_p2_selector_until_voiceover_exists():
    waiting = {"fields": {"Content_Status": "Ready for Voiceover", "Voiceover_URL": ""}}
    assert cover_content_status_fields(waiting) == {}
    voiced = {"fields": {"Content_Status": "Ready for Voiceover", "Voiceover_URL": "https://drive.google.com/uc?id=vo"}}
    assert cover_content_status_fields(voiced) == {"Content_Status": "Thumbnail Ready"}
    assert cover_content_status_fields({"fields": {"Content_Status": "In Production"}}) == {"Content_Status": "Thumbnail Ready"}
    assert cover_content_status_fields(None) == {"Content_Status": "Thumbnail Ready"}


def test_native_photo_detection():
    assert is_native_photo("Instagram", "Single Image")
    assert is_native_photo("Facebook", "Multi-Image Post")
    assert not is_native_photo("Instagram", "Story")
    assert not is_native_photo("Instagram", "Reel")
    assert not is_native_photo("TikTok", "Video Draft")


def test_finished_video_story_is_ten_second_teaser():
    request = {
        "id": "recPRStoryTeaser",
        "fields": {
            "Production_Notes": "origin=az-finished-video; ez-input=finished-video; az-auto-queue=1",
            "Studio_Variant_Status": "Not Needed",
            "Studio_Master_Assets_JSON": json.dumps([{
                "id": "v1",
                "order": 1,
                "name": "final.mp4",
                "mime_type": "video/mp4",
                "duration_seconds": 120,
                "url": "https://media.chicagoshining.com/studio/previews/finished-video/recPRStoryTeaser/v1.mp4",
                "preview_public_url": "https://media.chicagoshining.com/studio/previews/finished-video/recPRStoryTeaser/v1.mp4",
            }]),
        },
    }
    output = {"id": "recPOStory", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Story", "Aspect_Ratio": "9:16"}}
    package = finished_source_package(request, output, None)
    assert package["finished"] is False
    assert package["story_teaser"] is True
    assert package["composition_id"] == "ChicagoShiningPhotoSequence"
    assert package["total_frames"] == 300
    assert package["clips"][0]["startFromSeconds"] == 0
    assert package["clips"][0]["outSeconds"] == 10
    assert package["clips"][0]["keepSourceAudio"] is True
    assert package["clips"][0]["muted"] is False
    fields = stamp_fields(package, None)
    assert fields["Render_Status"] == "Ready for Render"
    assert fields["Composition_ID"] == "ChicagoShiningPhotoSequence"
    assert fields.get("Final_File_URL") in (None, "")
    assert fields.get("Music_URL") in (None, "")
    assert fields.get("Music_Volume") in (None, 0)


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
                "url": "https://media.chicagoshining.com/studio/previews/finished-video/recPRFinished/v1.mp4",
                "preview_public_url": "https://media.chicagoshining.com/studio/previews/finished-video/recPRFinished/v1.mp4",
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
    assert fields["Final_File_URL"].endswith("/studio/previews/finished-video/recPRFinished/v1.mp4")
    assert fields["Publish_Asset_URL"] == fields["Final_File_URL"]
    assert fields["Composition_ID"] is None


def test_finished_video_package_prefers_public_preview_over_master_assets():
    request = {
        "id": "recPRPreview",
        "fields": {
            "Production_Notes": "origin=ez-wizard; ez-input=finished-video",
            "Studio_Master_Assets_JSON": json.dumps([{
                "id": "v1",
                "order": 1,
                "name": "final.mp4",
                "mime_type": "video/mp4",
                "url": "https://media.chicagoshining.com/studio/master-assets/recPRPreview/v1.mp4",
                "preview_public_url": "https://media.chicagoshining.com/studio/previews/finished-video/recPRPreview/v1.mp4",
            }]),
        },
    }
    output = {"id": "recPOPreview", "fields": {"Platform": "YouTube", "Studio_Output_Type": "Short"}}
    package = finished_source_package(request, output, None)
    fields = stamp_fields(package, None)
    assert fields["Final_File_URL"].endswith("/studio/previews/finished-video/recPRPreview/v1.mp4")
    assert "master-assets" not in fields["Final_File_URL"]
    assert fields["Publish_Asset_URL"] == fields["Final_File_URL"]


def test_ensure_finished_preview_skips_put_when_public_url_present():
    from studio_produce.public_preview import ensure_finished_preview_masters

    class Dummy:
        def update_record(self, *args, **kwargs):
            raise AssertionError("public preview already exists")

    request = {
        "id": "recPR1",
        "fields": {
            "Studio_Master_Assets_JSON": json.dumps([{
                "id": "v1",
                "name": "a.mp4",
                "mime_type": "video/mp4",
                "url": "https://media.chicagoshining.com/studio/previews/finished-video/recPR1/v1.mp4",
                "preview_public_url": "https://media.chicagoshining.com/studio/previews/finished-video/recPR1/v1.mp4",
                "preview_r2_key": "studio/previews/finished-video/recPR1/v1.mp4",
            }]),
        },
    }
    assert ensure_finished_preview_masters(Dummy(), request) is request


def test_drive_video_is_not_a_designed_cover():
    from studio_produce.thumbnail import is_designed_cover_url

    assert is_designed_cover_url("") is False
    assert is_designed_cover_url("https://drive.google.com/uc?id=abc&export=download") is False
    assert is_designed_cover_url("https://media.chicagoshining.com/studio/master-assets/x.mp4") is False
    assert is_designed_cover_url("https://media.chicagoshining.com/studio/previews/clip-posters/x.jpg") is False
    assert is_designed_cover_url(
        "https://media.chicagoshining.com/studio/previews/thumbnails/recX/cover-9x16.png"
    ) is True
    assert is_designed_cover_url("https://example.com/thumb.png") is False
    from studio_produce.thumbnail import needs_grid_cover
    assert needs_grid_cover({"fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel"}}) is True
    assert needs_grid_cover({"fields": {"Platform": "Instagram", "Studio_Output_Type": "Story"}}) is False
    assert needs_grid_cover({"fields": {"Platform": "TikTok", "Studio_Output_Type": "Video Draft"}}) is True


def test_stamp_fields_ignores_drive_video_thumbnail():
    request = {
        "id": "recPRDriveThumb",
        "fields": {
            "Production_Notes": "origin=ez-wizard; ez-input=finished-video",
            "Studio_Master_Assets_JSON": json.dumps([{
                "id": "v1",
                "order": 1,
                "name": "final.mp4",
                "mime_type": "video/mp4",
                "url": "https://media.chicagoshining.com/studio/master-assets/final.mp4",
            }]),
        },
    }
    output = {"id": "recPODrive", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel"}}
    package = finished_source_package(request, output, None)
    fields = stamp_fields(
        package,
        {"fields": {"Thumbnail_URL": "https://drive.google.com/uc?id=abc&export=download"}},
    )
    assert not fields.get("Thumbnail_URL")
    assert fields["Final_File_URL"].endswith(".mp4")


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


def test_rebuild_manifest_video_ready_without_public_http():
    assets = [
        {
            "id": "clip1",
            "order": 1,
            "name": "walk.mp4",
            "mime_type": "video/mp4",
            "media_kind": "video",
            "google_drive_file_id": "dvid",
            "media_asset_record_id": "recVID0000000001",
            "duration_seconds": 8,
        }
    ]
    manifest = rebuild_variant_manifest("recPR", assets, ["9:16"], [], plan={"items": [{"aspect_ratio": "9:16"}]})
    assert manifest["plan_complete"] is True
    assert manifest["assets"][0]["variants"]["9:16"]["preview_url"] == "/api/media-assets/recVID0000000001/stream"


def test_mixed_stamp_uses_video_trim_and_photo_floor():
    request = {
        "id": "recPRMix",
        "fields": {
            "Production_Notes": "origin=ez-wizard; ez-input=photos-and-clips",
            "Studio_Variant_Status": "Ready",
            "Studio_Master_Assets_JSON": json.dumps([
                {"id": "p1", "order": 1, "name": "one.jpg", "mime_type": "image/jpeg", "caption": "", "preview_url": "https://media.chicagoshining.com/studio/previews/item4/master-one.jpg", "media_asset_record_id": "recPHOTO00000001"},
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
    clip_list = json.loads(package["render_clip_list_json"])
    assert package["clips"][0]["url"] == "https://media.chicagoshining.com/studio/previews/item4/master-one.jpg"
    assert package["clips"][0]["fitMode"] == "full_with_solid_background"
    assert clip_list[0]["url"] == "https://media.chicagoshining.com/studio/previews/item4/master-one.jpg"
    assert clip_list[0]["fitMode"] == "full_with_solid_background"
    assert [clip["motionStyle"] for clip in package["clips"]] == ["none", "none"]
    assert [clip["motionStyle"] for clip in clip_list] == ["none", "none"]


def test_source_package_story_photos_use_slow_zoom():
    request = {
        "id": "recPRStory",
        "fields": {
            "Studio_Variant_Status": "Ready",
            "Studio_Master_Assets_JSON": json.dumps([
                {"id": "p1", "order": 1, "name": "one.jpg", "mime_type": "image/jpeg"},
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
                ]
            }),
            "Studio_Output_Plan_JSON": json.dumps({
                "items": [{"platform": "Instagram", "output_type": "Story", "aspect_ratio": "9:16"}]
            }),
        },
    }
    output = {"id": "recPOStory", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Story", "Aspect_Ratio": "9:16"}}
    package = source_package(request, output, None)
    assert package is not None
    assert package["total_frames"] == 300
    assert package["clips"][0]["durationFrames"] == 300
    assert package["clips"][0]["outSeconds"] is None
    assert package["clips"][0]["motionStyle"] == "slowZoom"
    assert package["clips"][0]["fitMode"] == "fill_crop"
    assert json.loads(package["render_clip_list_json"])[0]["motionStyle"] == "slowZoom"
    assert json.loads(package["render_clip_list_json"])[0]["fitMode"] == "fill_crop"


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


def test_assign_clip_frames_caps_five_long_videos_to_owner_duration():
    clips = [
        {"source": {"media_kind": "video", "duration_seconds": 60, "in_seconds": 0, "out_seconds": 60}}
        for _ in range(5)
    ]
    frames, total = assign_clip_frames(
        clips,
        story=False,
        effective={"video_duration_seconds": 30},
        request={"fields": {"Video_Duration_Seconds": 30}},
        output=None,
    )
    assert total == 900
    assert frames == [180, 180, 180, 180, 180]


def test_assign_clip_frames_trims_long_video_and_reserves_photo_floor():
    clips = [
        {"source": {"media_kind": "photo"}},
        {"source": {"media_kind": "photo"}},
        {"source": {"media_kind": "video", "duration_seconds": 60, "in_seconds": 0, "out_seconds": 60}},
    ]
    frames, total = assign_clip_frames(
        clips,
        story=False,
        effective={"video_duration_seconds": 30},
        request={"fields": {"Video_Duration_Seconds": 30}},
        output=None,
    )
    assert total == 900
    assert frames[0] == 90
    assert frames[1] == 90
    assert frames[2] == 720


def test_stamp_timing_pending_for_single_clip_with_music():
    fields = stamp_fields(
        {
            "native": False,
            "story": False,
            "clip_count": 1,
            "total_frames": 900,
            "clips": [{"url": "https://media.example/one.mp4", "media_asset_record_id": "recVIDEO00000001"}],
            "effective": {"music_url": "https://media.example/track.mp3", "background_music_mode": "Yes"},
            "render_clip_list_json": "[]",
            "selected_assets_json": "{}",
            "output_filename": "studio-test.mp4",
        },
        None,
    )
    assert fields["Timing_Status"] == "Pending"
    assert fields["Music_Volume"] == 0.6


def test_stamp_timing_skipped_without_music():
    fields = stamp_fields(
        {
            "native": False,
            "story": False,
            "clip_count": 5,
            "total_frames": 900,
            "clips": [{"url": "https://media.example/one.mp4", "media_asset_record_id": "recVIDEO00000001"}],
            "effective": {"music_url": "", "background_music_mode": "No"},
            "render_clip_list_json": "[]",
            "selected_assets_json": "{}",
            "output_filename": "studio-test.mp4",
        },
        None,
    )
    assert fields["Timing_Status"] == "Skipped"


def test_stamp_preserves_ready_timing_and_clip_list():
    package = {
        "native": False,
        "story": False,
        "clip_count": 1,
        "total_frames": 900,
        "clips": [{"url": "https://media.example/one.mp4", "media_asset_record_id": "recVIDEO00000001"}],
        "effective": {"music_url": "https://media.example/track.mp3", "background_music_mode": "Yes"},
        "render_clip_list_json": '[{"url":"https://media.example/unsticed.mp4"}]',
        "selected_assets_json": "{}",
        "output_filename": "studio-test.mp4",
    }
    fields = stamp_fields(
        package,
        None,
        existing={
            "fields": {
                "Timing_Status": "Ready",
                "Timing_Timeline_JSON": '{"schema_version":"timing.timeline.1"}',
                "Render_Clip_List_JSON": '[{"url":"https://media.example/sliced.mp4"}]',
            }
        },
    )
    assert "Timing_Status" not in fields
    assert "Render_Clip_List_JSON" not in fields
    assert "Render_Total_Frames" not in fields


def test_photo_sequence_url_ignores_stale_fill_crop_master_preview():
    master = {
        "preview_url": "https://media.chicagoshining.com/studio/previews/item4/recPR/ITEM4-VARIANT-fill-crop-v2-old.jpg",
    }
    variant = {
        "preview_url": "https://media.chicagoshining.com/studio/previews/item4/recPR/ITEM4-VARIANT-fill-crop-v2-new.jpg",
    }
    assert photo_sequence_url(master, variant) == variant["preview_url"]
    jpeg_master = {"preview_url": "https://media.chicagoshining.com/studio/previews/item4/recPR/master-one.jpg"}
    assert photo_sequence_url(jpeg_master, variant) == jpeg_master["preview_url"]


def test_stamp_recrop_rewrites_clip_list_and_reopens_timing():
    package = {
        "native": False,
        "story": False,
        "clip_count": 1,
        "total_frames": 900,
        "clips": [{"url": "https://media.chicagoshining.com/studio/previews/item4/a/ITEM4-VARIANT-fill-crop-v2-new.jpg", "media_asset_record_id": "recPHOTO00000001"}],
        "effective": {"music_url": "https://media.example/track.mp3", "background_music_mode": "Yes"},
        "render_clip_list_json": '[{"url":"https://media.chicagoshining.com/studio/previews/item4/a/ITEM4-VARIANT-fill-crop-v2-new.jpg","media_kind":"photo"}]',
        "selected_assets_json": "{}",
        "output_filename": "studio-test.mp4",
    }
    fields = stamp_fields(
        package,
        None,
        existing={
            "fields": {
                "Timing_Status": "Ready",
                "Timing_Timeline_JSON": '{"schema_version":"timing.timeline.1"}',
                "Render_Clip_List_JSON": '[{"url":"https://media.chicagoshining.com/studio/previews/item4/a/ITEM4-VARIANT-fill-crop-v2-old.jpg","media_kind":"photo"}]',
            }
        },
    )
    assert fields["Timing_Status"] == "Pending"
    assert fields["Timing_Timeline_JSON"] is None
    assert "fill-crop-v2-new.jpg" in fields["Render_Clip_List_JSON"]


def test_stamp_overlay_text_change_rewrites_clip_list_without_retiming():
    still = "https://media.chicagoshining.com/studio/previews/item4/a/photo.jpg"
    package = {
        "native": False,
        "story": False,
        "clip_count": 1,
        "total_frames": 900,
        "clips": [{"url": still, "media_asset_record_id": "recPHOTO00000001"}],
        "effective": {"music_url": "https://media.example/track.mp3", "background_music_mode": "Yes"},
        "render_clip_list_json": json.dumps([{"url": still, "media_kind": "photo", "overlay": {"text": "Tribune Tower"}}]),
        "selected_assets_json": "{}",
        "output_filename": "studio-test.mp4",
    }
    fields = stamp_fields(
        package,
        None,
        existing={
            "fields": {
                "Timing_Status": "Ready",
                "Timing_Timeline_JSON": '{"schema_version":"timing.timeline.1"}',
                "Render_Clip_List_JSON": json.dumps([{"url": still, "media_kind": "photo", "overlay": {"text": "Old Title"}}]),
            }
        },
    )
    assert "Timing_Status" not in fields
    assert "Tribune Tower" in fields["Render_Clip_List_JSON"]


def test_stamp_heals_pending_when_timeline_already_exists():
    fields = stamp_fields(
        {
            "native": False,
            "story": False,
            "clip_count": 1,
            "total_frames": 900,
            "clips": [{"url": "https://media.example/one.mp4", "media_asset_record_id": "recVIDEO00000001"}],
            "effective": {"music_url": "https://media.example/track.mp3", "background_music_mode": "Yes"},
            "render_clip_list_json": "[]",
            "selected_assets_json": "{}",
            "output_filename": "studio-test.mp4",
        },
        None,
        existing={"fields": {"Timing_Status": "Pending", "Timing_Timeline_JSON": '{"clips":[]}'}},
    )
    assert fields["Timing_Status"] == "Ready"
    assert "Render_Clip_List_JSON" not in fields


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


def test_remotion_clip_url_uses_drive_when_variant_is_studio_stream():
    master = {
        "media_kind": "video",
        "google_drive_file_id": "drive-video-1",
        "media_asset_record_id": "recVID0000000001",
    }
    variant = {
        "preview_url": "/api/media-assets/recVID0000000001/stream",
        "media_asset_record_id": "recVID0000000001",
        "google_drive_file_id": "drive-video-1",
    }
    assert remotion_clip_url(master, variant) == (
        "https://drive.google.com/uc?export=download&id=drive-video-1"
    )


def test_stamp_video_without_public_http_uses_drive_in_render_clip_list():
    # queue.py sets preview_url to /api/media-assets/.../stream when playable_url is empty.
    # Remotion cannot fetch that path; stamp must emit Drive instead.
    request = {
        "id": "recPRVideoDrive",
        "fields": {
            "Production_Notes": "origin=ez-wizard; ez-input=photos-and-clips",
            "Studio_Variant_Status": "Ready",
            "Studio_Master_Assets_JSON": json.dumps([
                {
                    "id": "v1",
                    "order": 1,
                    "name": "walk.mp4",
                    "mime_type": "video/mp4",
                    "media_kind": "video",
                    "google_drive_file_id": "dvid",
                    "media_asset_record_id": "recVID0000000001",
                    "duration_seconds": 8,
                }
            ]),
            "Studio_Variant_Manifest_JSON": json.dumps({
                "assets": [{
                    "id": "v1",
                    "order": 1,
                    "name": "walk.mp4",
                    "media_kind": "video",
                    "google_drive_file_id": "dvid",
                    "media_asset_record_id": "recVID0000000001",
                    "variants": {
                        "9:16": {
                            "aspect_ratio": "9:16",
                            "media_kind": "video",
                            "google_drive_file_id": "dvid",
                            "media_asset_record_id": "recVID0000000001",
                            "preview_url": "/api/media-assets/recVID0000000001/stream",
                            "preview_status": "Ready",
                            "duration_seconds": 8,
                        }
                    },
                }]
            }),
            "Studio_Output_Plan_JSON": json.dumps({
                "items": [{"platform": "Facebook", "output_type": "Reel", "aspect_ratio": "9:16"}]
            }),
        },
    }
    output = {
        "id": "recPOVideoDrive",
        "fields": {"Platform": "Facebook", "Studio_Output_Type": "Reel", "Aspect_Ratio": "9:16"},
    }
    package = source_package(request, output, None)
    assert package is not None
    clip_url = json.loads(package["render_clip_list_json"])[0]["url"]
    assert clip_url == "https://drive.google.com/uc?export=download&id=dvid"
    assert not clip_url.startswith("/api/media-assets/")


def test_finished_thumbnail_prompt_prefers_gold_lettering():
    prompt = build_finished_thumbnail_prompt(
        {"fields": {"Requested_Title": "Rainy Chicago"}},
        {"fields": {"Caption": "Lake Shore Drive at dusk"}},
    )
    assert "Rainy Chicago" in prompt
    assert "Lake Shore Drive" in prompt
    assert "gold" in prompt.lower()
    assert "photoreal" in prompt.lower()
    assert "~80%" in prompt
    assert COLORFUL_3D_RULE in prompt
    assert "restrained gold" in prompt
    assert "chrome" in prompt.lower()


def test_legacy_output_effective_keeps_parent_preferred_music_url():
    parent = {
        "fields": {
            "Preferred_Music_URL": "https://drive.example/music.mp3",
            "Include_Voiceover": "Yes",
            "Voiceover_Duration_Seconds": 32.28,
        }
    }
    request = {"fields": {"Voiceover_Mode": "Yes", "Background_Music_Mode": "Yes", "Video_Duration_Seconds": 30}}
    output = {"fields": {"Studio_Effective_Voiceover_Mode": "Yes", "Studio_Effective_Background_Music_Mode": "Yes"}}
    effective = output_effective(output, request, parent)
    assert effective["music_url"] == "https://drive.example/music.mp3"
    assert effective["voiceover_duration_seconds"] == 32.28


def test_duration_extends_requested_video_to_voiceover_plus_tail():
    effective = {
        "voiceover_mode": "Yes",
        "video_duration_seconds": 30,
        "voiceover_duration_seconds": 32.28,
        "voiceover_tail_seconds": 2,
    }
    assert duration_seconds(
        story=False,
        clip_count=10,
        effective=effective,
        request={"fields": {"Video_Duration_Seconds": 30}},
        output={"fields": {}},
    ) == 34.3


def test_recovery_audio_uses_parent_music_and_keeps_voiceover_on_photo_story():
    parent = {
        "fields": {
            "Voiceover_URL": "https://drive.google.com/uc?id=voice",
            "Preferred_Music_URL": "https://drive.google.com/uc?id=music",
        }
    }
    request = {"fields": {"Voiceover_Mode": "Yes", "Background_Music_Mode": "Yes"}}
    output = {
        "fields": {
            "Platform": "Instagram",
            "Studio_Output_Type": "Story",
            "Studio_Effective_Voiceover_Mode": "Yes",
            "Studio_Effective_Background_Music_Mode": "Yes",
        }
    }

    effective = output_effective(output, request, parent)
    assert effective["music_url"] == "https://drive.google.com/uc?id=music"

    fields = stamp_fields(
        {
            "native": False,
            "story": True,
            "story_teaser": False,
            "clip_count": 1,
            "total_frames": 300,
            "clips": [{"url": "https://media.example/one.jpg", "media_asset_record_id": "recPHOTO00000001"}],
            "effective": {**effective, "voiceover_mode": "Yes"},
            "render_clip_list_json": "[]",
            "selected_assets_json": "{}",
            "output_filename": "studio-story.mp4",
        },
        parent,
    )
    assert fields["Voiceover_URL"] is None  # Stories stay music-only; VO stays on the main Reel
    assert fields["Music_URL"] == "https://drive.google.com/uc?id=music"
    assert fields["Music_Volume"] == 0.6

