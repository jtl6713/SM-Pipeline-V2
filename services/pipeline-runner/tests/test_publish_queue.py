"""Publish-queue formulas from stored columns. No live calls."""

from datetime import datetime, timezone

from publish_queue import (
    apply_publish_queue_fields,
    fb_resolved_publish_mode,
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
