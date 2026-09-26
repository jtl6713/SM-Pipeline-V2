import inspect

from datetime import datetime, timedelta, timezone

from stages.registry import STAGE_NAMES, is_implemented
from ttd import ttd1 as ttd1_module
from ttd.assets import draft_type_for_photos, is_photo_route, is_video_route, photo_manifest, video_manifest
from ttd.eligibility import (
    ttd0_eligibility_reason,
    ttd1_eligibility_reason,
    ttd2_eligibility_reason,
    ttd3_eligibility_reason,
    ttd4_form_eligibility_reason,
)
from ttd.package import (
    completion_url,
    cover_block,
    handoff_email_html,
    handoff_email_subject,
    hash_completion_token,
    is_az_finished_video,
    ordered_asset_links_html,
    photo_description,
    profile_display_name,
    photo_title,
    sibling_status_line,
)


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def test_tiktok_stages_are_registered():
    for name in ("ttd0", "ttd1", "ttd2", "ttd3", "ttd4"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_ttd0_gates():
    ready = _record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Status="Ready for Assets")
    assert ttd0_eligibility_reason(ready) is None
    waiting = _record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Status="Waiting for Schedule")
    assert ttd0_eligibility_reason(waiting) == "tiktok_draft_waiting_for_schedule"
    far_future = _record(
        Platform="TikTok",
        Auto_Publish_Enabled=True,
        TikTok_Draft_Status="Ready for Assets",
        Scheduled_Post_Date=(datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    )
    assert ttd0_eligibility_reason(far_future) == "tiktok_draft_before_inbox_lead_window"
    soon = _record(
        Platform="TikTok",
        Auto_Publish_Enabled=True,
        TikTok_Draft_Status="Ready for Assets",
        Scheduled_Post_Date=(datetime.now(timezone.utc) + timedelta(minutes=10)).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    )
    assert ttd0_eligibility_reason(soon) is None
    assert ttd0_eligibility_reason(_record(Platform="Instagram", Auto_Publish_Enabled=True, TikTok_Draft_Status="Ready for Assets")) == "not_tiktok"
    assert ttd0_eligibility_reason(_record(Platform="TikTok", Auto_Publish_Enabled=False, TikTok_Draft_Status="Ready for Assets")) == "auto_publish_disabled"
    assert ttd0_eligibility_reason(_record(Platform="TikTok", Auto_Publish_Enabled=True, Do_Not_Publish=True, TikTok_Draft_Status="Ready for Assets")) == "do_not_publish"
    assert ttd0_eligibility_reason(_record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Publish_ID="p")) == "already_has_draft_publish_id"
    assert ttd0_eligibility_reason(
        _record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Status="Retry Pending", Publish_Error_Stage="TTD0_ASSETS")
    ) is None
    assert ttd0_eligibility_reason(_record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Status="Processing")) == (
        "tiktok_draft_not_ready_for_assets"
    )


def test_ttd1_and_poll_gates():
    ready = _record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Status="Ready for Delivery")
    assert ttd1_eligibility_reason(ready) is None
    assert ttd1_eligibility_reason(ready, replace_transaction_id="txn") == "replace_address_mismatch"
    assert ttd1_eligibility_reason(_record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Publish_ID="p")) == (
        "already_has_draft_publish_id"
    )
    assert ttd1_eligibility_reason(
        _record(Platform="TikTok", Auto_Publish_Enabled=True, TikTok_Draft_Status="Retry Pending", Publish_Error_Stage="TTD_CAPACITY")
    ) is None

    processing = _record(Platform="TikTok", TikTok_Draft_Publish_ID="pub-1", TikTok_Draft_Status="Processing")
    assert ttd2_eligibility_reason(processing) is None
    assert ttd2_eligibility_reason(_record(Platform="TikTok", TikTok_Draft_Status="Processing")) == "missing_draft_publish_id"

    delivered = _record(
        Platform="TikTok",
        TikTok_Draft_Status="Draft Delivered — Manual Action Required",
        TikTok_Draft_Delivered_At="2026-08-24T12:00:00Z",
        TikTok_Manual_Completion_URL="https://example.com/form",
        Manual_Completion_Status="Required",
    )
    assert ttd3_eligibility_reason(delivered) is None
    assert ttd3_eligibility_reason({**delivered, "fields": {**delivered["fields"], "TikTok_Draft_Email_Sent_At": "2026-08-24T12:01:00Z"}}) == (
        "email_already_sent"
    )


def test_ttd4_form_gates():
    waiting = _record(Manual_Completion_Status="Required", TikTok_Manual_Completion_Token="abc")
    assert ttd4_form_eligibility_reason(waiting, token="abc") is None
    assert ttd4_form_eligibility_reason(waiting, token="nope") == "token_mismatch"
    assert ttd4_form_eligibility_reason(_record(Manual_Completion_Status="Required", TikTok_Manual_Completion_Token="abc", Publish_Status="Published"), token="abc") == (
        "already_published"
    )


def test_asset_helpers():
    photo = _record(
        Image_Output_Selected=True,
        Image_Publish_Mode="TikTok Draft",
        Asset_Aspect_Family="9:16",
        Image_Output_Type="Photo Carousel",
    )
    legacy = _record(
        Image_Output_Selected=True,
        Image_Publish_Mode="TikTok Draft",
        Asset_Aspect_Family="9:16",
        TikTok_Draft_Type="Single Photo",
    )
    video = _record(TikTok_Draft_Type="Video", Publish_Asset_URL="https://media.chicagoshining.com/clip.mp4")
    assert is_photo_route(photo) is True
    assert is_photo_route(legacy) is True
    assert is_video_route(photo) is False
    assert is_video_route(video) is True
    assert draft_type_for_photos(1) == "Single Photo"
    assert draft_type_for_photos(3) == "Photo Carousel"
    assert photo_manifest(["https://a", "https://b"]) == '["https://a","https://b"]'
    assert video_manifest("https://media.chicagoshining.com/clip.mp4") == '{"source_url":"https://media.chicagoshining.com/clip.mp4"}'


def test_package_helpers():
    record = _record(Output_Title="A very long title " * 10, Output_Caption="Caption", Output_Hashtags="#Chicago")
    assert len(photo_title(record)) == 90
    assert photo_description(record) == "Caption\n\n#Chicago"
    token = hash_completion_token("TTD2:recX:pub:stamp")
    assert len(token) == 64
    assert completion_url("https://pipeline.chicagoshining.com/hooks/ttd4", "recABCDEFGHIJKLMN", token).endswith(
        f"token={token}&action=form"
    )


def test_handoff_email_shows_profile_in_subject_and_top():
    record = _record(
        Output_ID="595",
        Output_Title="NYC at night",
        TikTok_Draft_Type="Photo Carousel",
        TikTok_Draft_Assets_JSON='["https://media.chicagoshining.com/a.jpg"]',
    )
    profile = _record(Profile_Name="New York Shining")
    subject = handoff_email_subject(record, profile=profile)
    html = handoff_email_html(record, profile=profile)

    assert "TikTok Draft #595 — New York Shining — Ready in Inbox" in subject
    assert profile_display_name(record, profile) == "New York Shining"
    assert "<b>Profile:</b> New York Shining" in html
    assert "TikTok inbox for <b>New York Shining</b>" in html
    assert "@chicago.shining" not in html


def test_handoff_email_renders_named_asset_links_in_manifest_order():
    first = "https://media.chicagoshining.com/studio/previews/lettered/recExample/0.jpg"
    second = "https://media.chicagoshining.com/studio/previews/lettered/recExample/1.jpg"
    record = _record(
        Output_ID="595",
        Output_Title="Architecture",
        TikTok_Draft_Type="Photo Carousel",
        TikTok_Draft_Assets_JSON=f'["{second}","{first}"]',
    )
    slides = [
        _record(**{"Slide Name": "Tribune Tower", "Slide Number": 1, "Asset_9x16_Public_URL": first}),
        _record(**{"Slide Name": "Willis Tower", "Slide Number": 2, "Asset_9x16_Public_URL": second}),
    ]

    assets_html = ordered_asset_links_html(record, slides=slides)
    email_html = handoff_email_html(record, asset_slides=slides)

    assert assets_html.index("Willis Tower") < assets_html.index("Tribune Tower")
    assert f'href="{second}"' in assets_html
    assert f'href="{first}"' in assets_html
    assert "Ordered draft assets" in email_html
    assert '["https://' not in email_html


def test_handoff_email_includes_public_cover():
    cover = "https://media.chicagoshining.com/publish/platform-output-322/cover.png"
    record = _record(
        Output_ID="322",
        Output_Title="Chicago Theatre After Dark",
        TikTok_Draft_Type="Video",
        Output_Caption="Caption",
        Output_Hashtags="#Chicago",
        Thumbnail_URL=cover,
        TikTok_Draft_Publish_ID="pub-1",
        TikTok_Manual_Completion_URL="https://pipeline.chicagoshining.com/hooks/ttd4?action=form",
    )
    html = handoff_email_html(record)
    assert 'alt="TikTok 3D grid cover"' in html
    assert cover in html
    assert "Download cover image" in html
    assert "set it as the draft cover in TikTok" in html
    assert "Not set on this output" not in cover_block(record)


def test_handoff_email_notes_missing_cover():
    html = handoff_email_html(_record(Output_ID="323", Output_Title="No cover"))
    assert "Not set on this output" in html
    assert "TikTok 3D grid cover" not in html


def test_az_publish_package_email():
    record = _record(
        Output_ID="410",
        Output_Title="Riverwalk sunset",
        Output_Notes="origin=az-finished-video; ez-input=finished-video",
        Output_Caption="Sunset on the river",
        Output_Hashtags="#Chicago",
        Thumbnail_URL="https://media.chicagoshining.com/publish/platform-output-410/cover.jpg",
        TikTok_Manual_Completion_URL="https://pipeline.chicagoshining.com/hooks/ttd4?action=form",
        TikTok_Draft_Publish_ID="pub-az",
    )
    assert is_az_finished_video(record) is True
    assert handoff_email_subject(record) == "ChicagoShining publish package — Riverwalk sunset"
    ig = _record(
        Platform="Instagram",
        Studio_Output_Type="Reel",
        Publish_Status="Scheduled",
        Scheduled_Post_Date="2026-09-08T16:30:00.000Z",
    )
    yt = _record(
        Platform="YouTube",
        Studio_Output_Type="Short",
        Publish_Status="Published",
        Platform_Post_URL="https://www.youtube.com/watch?v=abc123",
    )
    html = handoff_email_html(record, siblings=[ig, yt])
    assert "ChicagoShining publish package" in html
    assert "Sunset on the river" in html
    assert "#Chicago" in html
    assert "Mark as Published" in html
    assert "TikTok Story" in html
    assert "Instagram Reel" in html
    assert "youtube.com/watch?v=abc123" in html
    assert sibling_status_line(yt).startswith("<li><b>YouTube Short:</b> live")



def test_ttd1_has_no_internal_pending_draft_guard():
    source = inspect.getsource(ttd1_module.process_request)
    assert "TIKTOK_DRAFT_SAFE_PENDING_LIMIT" not in source
    assert "pending_manual_share_count" not in source
    assert "pending-share safety limit reached" not in source
