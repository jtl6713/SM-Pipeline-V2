"""Publish-queue formulas from stored columns. No live calls."""

from datetime import datetime, timezone

from publish_queue import (
    apply_publish_queue_fields,
    fb_resolved_publish_mode,
    fb_action_due_now,
    ttd0_asset_route_ready,
    youtube_action_due_now,
)


NOW = datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc)


def test_youtube_due_uses_retry_clock():
    fields = {
        "Platform": "YouTube",
        "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False,
        "Publish_Status": "Ready to Publish",
        "YouTube_Stage": "Upload",
        "Publish_Next_Retry_At": "2026-11-12T17:00:00Z",
    }
    assert youtube_action_due_now(fields, NOW) == 1
    fields["Publish_Next_Retry_At"] = "2026-11-12T19:00:00Z"
    assert youtube_action_due_now(fields, NOW) == 0
    fields["YouTube_Stage"] = "Complete"
    fields["Publish_Next_Retry_At"] = None
    assert youtube_action_due_now(fields, NOW) == 0


def test_resolved_mode_and_tiktok_route():
    slideshow = {"Studio_Effective_Voiceover_Mode": "Yes", "Image_Count": 1}
    assert fb_resolved_publish_mode(slideshow) == "Slideshow Reel"
    photo = {
        "TikTok_Draft_Type": "Photo Carousel",
        "Asset_Aspect_Family": "9:16",
        "Image_Count": 3,
        "TikTok_9x16_Ready_Count": 3,
    }
    assert ttd0_asset_route_ready(photo) == 1
    photo["TikTok_9x16_Ready_Count"] = 2
    assert ttd0_asset_route_ready(photo) == 0
    video = {"TikTok_Draft_Type": "Video", "Publish_Asset_URL": "https://cdn.example/a.mp4"}
    assert ttd0_asset_route_ready(video) == 1


def test_apply_replaces_a_stale_snapshot():
    fields = {
        "Platform": "YouTube",
        "Auto_Publish_Enabled": True,
        "Publish_Status": "Ready to Publish",
        "YouTube_Stage": "Upload",
        "YouTube_Action_Due_Now": "0",
    }
    apply_publish_queue_fields(fields, NOW)
    assert fields["YouTube_Action_Due_Now"] == 1
    assert fields["FB_Resolved_Publish_Mode"] == "Single Photo"


def test_multi_image_facebook_photo_set_uses_native_photo_route_without_explicit_mode():
    # Supabase Photo Set #9894 had four approved slides but no stored image
    # publish mode. The old generic >1 image fallback incorrectly sent FB0 to
    # "Preparing Slideshow", leaving these posts overdue.
    fields = {
        "Platform": "Facebook",
        "Platform_Output_Type": "Facebook Photo Set",
        "Studio_Output_Type": "Multi-Image Post",
        "Image_Count": 4,
        "Image_Output_Selected": True,
        "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False,
        "Publish_Status": "Ready to Publish",
        "FB_Publish_Status": "Ready for Assets",
    }
    assert fb_resolved_publish_mode(fields) == "Multi-Photo Collage"
    apply_publish_queue_fields(fields, NOW)
    assert fields["FB_Resolved_Publish_Mode"] == "Multi-Photo Collage"
    assert fields["FB_Action_Due_Now"] == 1
    fields["FB_Image_Publish_Mode"] = "Slideshow Reel"
    assert fb_resolved_publish_mode(fields) == "Slideshow Reel"


def test_other_multi_image_formats_keep_slideshow_fallback():
    generic = {"Platform_Output_Type": "Facebook Reel", "Image_Count": 4}
    assert fb_resolved_publish_mode(generic) == "Slideshow Reel"
    native_lowercase = {"platform_output_type": "Facebook Photo Set",
                        "studio_output_type": "Multi-Image Post", "image_count": 4}
    assert fb_resolved_publish_mode(native_lowercase) == "Multi-Photo Collage"


def test_facebook_retry_prohibition_never_means_due_now():
    fields = {
        "Platform": "Facebook",
        "Platform_Output_Type": "Facebook Reel",
        "FB_Resolved_Publish_Mode": "Slideshow Reel",
        "Auto_Publish_Enabled": True,
        "Publish_Status": "Failed",
        "FB_Publish_Status": "Retry Pending",
        "Publish_Retry_Eligible": False,
        "Publish_Next_Retry_At": "2099-01-01T00:00:00Z",
    }
    assert fb_action_due_now(fields, NOW) == 0
    fields["Publish_Next_Retry_At"] = None
    assert fb_action_due_now(fields, NOW) == 0
    fields["Publish_Retry_Eligible"] = "false"
    assert fb_action_due_now(fields, NOW) == 0
    fields.pop("Publish_Retry_Eligible")
    assert fb_action_due_now(fields, NOW) == 1  # Absent flag; other publisher guards still apply.
    fields["Publish_Next_Retry_At"] = "2099-01-01T00:00:00Z"
    assert fb_action_due_now(fields, NOW) == 0
    fields["Publish_Retry_Eligible"] = True
    fields["Publish_Next_Retry_At"] = "2026-11-12T17:00:00Z"
    assert fb_action_due_now(fields, NOW) == 1


def test_youtube_retry_prohibition_prevents_reupload_due_now():
    fields = {
        "Platform": "YouTube",
        "Auto_Publish_Enabled": True,
        "Publish_Status": "Failed",
        "YouTube_Stage": "YT1",
        "Publish_Retry_Eligible": False,
        "Publish_Next_Retry_At": None,
    }
    assert youtube_action_due_now(fields, NOW) == 0
    fields["Publish_Retry_Eligible"] = True
    assert youtube_action_due_now(fields, NOW) == 1
    fields["Publish_Next_Retry_At"] = "2099-01-01T00:00:00Z"
    assert youtube_action_due_now(fields, NOW) == 0


def test_fresh_facebook_first_dispatch_with_no_retry_allowed():
    fields = {
        "Platform": "Facebook", "Platform_Output_Type": "Facebook Reel",
        "FB_Resolved_Publish_Mode": "Slideshow Reel",
        "Publish_Status": "Ready to Schedule",
        "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False,
        "Publish_Retry_Eligible": False,
        "Publish_Attempt_Count": 0,
        "Studio_Publish_Dispatch_Count": 0,
        "Publish_Next_Retry_At": None,
    }
    assert fb_action_due_now(fields, NOW) == 1
    fields["Studio_Publish_Dispatch_Count"] = 1
    assert fb_action_due_now(fields, NOW) == 0
    fields["Studio_Publish_Dispatch_Count"] = 0
    fields["Last_Publish_Attempt_At"] = "2026-11-12T17:30:00Z"
    assert fb_action_due_now(fields, NOW) == 0
    fields.pop("Last_Publish_Attempt_At")
    fields["Publish_Next_Retry_At"] = "2099-01-01T00:00:00Z"
    assert fb_action_due_now(fields, NOW) == 0


def test_fresh_youtube_first_dispatch_with_no_retry_allowed():
    fields = {
        "Platform": "YouTube",
        "Auto_Publish_Enabled": True,
        "Publish_Status": "Ready to Publish",
        "YouTube_Stage": "YT1",
        "Publish_Retry_Eligible": False,
        "Publish_Attempt_Count": 0,
        "Studio_Publish_Dispatch_Count": 0,
    }
    assert youtube_action_due_now(fields, NOW) == 1
    fields["YouTube_Upload_Job_ID"] = "prior-uploader-job"
    assert youtube_action_due_now(fields, NOW) == 0



def test_fbs3_supabase_view_accepts_existing_public_mp4_fallback_issue2464():
    """The first FBS3 Ready branch must not omit the approved public MP4 fallback.

    Original overdue #2457/#2463/#2762/#4018 have a ready media CDN MP4 in
    Publish_Asset_URL and Video Ready, but no FB_Slideshow_Public_URL. The
    actual FBS3 publisher already supports Publish_Asset_URL, so the source
    selector must include those records without rewriting their media.
    """
    from airtable.constants import PLATFORM_OUTPUTS_TABLE
    from fbs3.eligibility import create_eligibility_reason
    from supabase_views import _VIEWS, view_to_postgrest_filter

    view = "FBS3 — Ready to Publish Slideshow Reel"
    root = _VIEWS[view]
    assert root["op"] == "or"
    ready = root["args"][0]
    public_url = next(node for node in ready["args"] if node.get("op") == "or")
    assert {node.get("field") for node in public_url["args"]} == {
        "FB_Slideshow_Public_URL", "Publish_Asset_URL"
    }
    translated = view_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, view, now=NOW)
    assert translated is not None
    assert "publish_asset_url" in translated
    assert "FB_Slideshow_Public_URL" not in translated or "publish_asset_url" in translated

    record = {
        "id": "recCarouselFbs31",
        "fields": {
            "FB_Slideshow_Status": "Video Ready",
            "Publish_Asset_URL": "https://media.chicagoshining.com/publishing/approved.mp4",
            "FB_Slideshow_Public_URL": "",
            "Publish_Error_Stage": "",
        },
    }
    assert create_eligibility_reason(record) is None



def test_fb0_supabase_snapshot_uses_real_automated_publish_method_and_excludes_scheduled():
    """Issue #2556: zero of 3333 FB rows had the retired Image_Publish_Mode key.

    FB0 must select due, approved native Facebook Photo Sets via actual typed
    Supabase columns, never omit all rows or pull future-scheduled approvals.
    """
    from airtable.constants import PLATFORM_OUTPUTS_TABLE
    from supabase_views import _VIEWS, view_to_postgrest_filter

    name = "FB0 — Ready for 4x5 Asset Preparation"
    tree = _VIEWS[name]
    assert tree["op"] == "and"
    gates = [node for node in tree["args"] if node.get("field")]
    assert not any(node["field"] == "Image_Publish_Mode" for node in gates)
    assert any(node["field"] == "Publish_Method" and node.get("value") == ["Automated"]
               for node in gates)
    assert any(node["field"] == "Publish_Status" and node.get("value") == ["Ready to Publish"]
               for node in gates)
    raw = view_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, name, now=NOW)
    assert raw is not None
    assert "publish_method.eq.Automated" in raw
    assert "publish_status.eq.Ready to Publish" in raw
    assert "Image_Publish_Mode" not in raw

    fields = {
        "Platform": "Facebook", "Platform_Output_Type": "Facebook Photo Set",
        "Studio_Output_Type": "Multi-Image Post",
        "Publish_Method": "Automated", "Publish_Status": "Ready to Publish",
        "FB_Publish_Status": "Ready for Assets", "Auto_Publish_Enabled": True,
        "Image_Output_Selected": True, "Image_Count": 4, "Assets_Ready_Count": 4,
        "Do_Not_Publish": False, "Publish_Retry_Eligible": True,
        "Publish_Next_Retry_At": "2026-11-12T17:00:00Z",
    }
    assert fb_action_due_now(fields, NOW) == 1
    fields["Publish_Next_Retry_At"] = "2026-11-12T19:00:00Z"
    assert fb_action_due_now(fields, NOW) == 0
