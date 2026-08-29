from a4.formulas import unpublished_outputs_using_asset_formula
from asset.routing import (
    a2_route_fields,
    a2b_capture_source,
    a2b_route,
    a3_mime_route,
    a4_is_healthy,
    a4_is_missing,
    audio_role_fallback,
    branding_asset_role,
    classify_intake_file,
)
from stages.registry import STAGE_NAMES, is_implemented


def test_asset_stages_are_registered():
    for name in ("a2", "a2b", "a3", "a4", "a1p", "a1s", "a1m"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_a2_mime_routing_order():
    assert classify_intake_file("clip.mp4", "video/mp4") == "video"
    assert classify_intake_file("logo.png", "image/png") == "branding"
    assert classify_intake_file("watermark.mov", "video/quicktime") == "video"
    assert classify_intake_file("ChicagoShining", "application/pdf") == "branding"
    assert classify_intake_file("skyline.jpg", "image/jpeg") == "image"
    assert classify_intake_file("bed.mp3", "audio/mpeg") == "audio"
    assert classify_intake_file("notes.txt", "text/plain") == "other"
    assert branding_asset_role("final-watermark.png") == "Watermark"
    assert branding_asset_role("logo-lockup.png") == "Logo"
    assert branding_asset_role("brand-kit.pdf") == "Other"
    video = a2_route_fields("video", "clip.mp4", "abc123")
    assert video["Media_Class"] == "Video"
    assert video["Asset_Role"] == "Raw Footage"
    assert "abc123" in video["Google Drive URL"]


def test_a2b_skip_and_backfill_rules():
    existing = {"drive-known"}
    assert (
        a2b_route({"id": "x", "mimeType": "video/mp4", "size": "150000000", "name": "raw.mp4"}, existing)
        == "oversize"
    )
    assert (
        a2b_route(
            {"id": "x", "mimeType": "video/mp4", "size": "150000000", "name": "platform-output.mp4"},
            existing,
        )
        == "ignore"
    )
    assert (
        a2b_route({"id": "drive-known", "mimeType": "video/mp4", "size": "1000", "name": "raw.mp4"}, existing)
        == "skip_existing"
    )
    assert (
        a2b_route({"id": "new", "mimeType": "video/mp4", "size": "1000", "name": "River 2.MOV"}, existing)
        == "ignore"
    )
    assert a2b_route({"id": "new", "mimeType": "video/mp4", "size": "1000", "name": "dji-clip.mp4"}, existing) == "backfill"
    assert a2b_route({"id": "new", "mimeType": "image/jpeg", "size": "1000", "name": "photo.jpg"}, existing) == "ignore"
    assert a2b_capture_source("DJI_001.mp4") == "Drone"
    assert a2b_capture_source("riverwalk.mp4") == "Self Filmed"


def test_a3_mime_and_audio_fallback():
    assert a3_mime_route("audio/mpeg") == "audio"
    assert a3_mime_route("video/mp4") == "video"
    assert a3_mime_route("image/png") == "image"
    assert a3_mime_route("application/pdf") == "unsupported"
    assert audio_role_fallback("", "ElevenLabs_Kate - English Female Voice With Soft Accent_pvc.mp3") == "Voiceover"
    assert audio_role_fallback("", "recABC_voice_normalized.mp3") == "Voiceover"
    assert audio_role_fallback("", "background-loop.mp3") == "Music"
    assert audio_role_fallback("Voiceover", "track.mp3") == "Voiceover"
    assert audio_role_fallback("", "untitled.wav") == "Other"


def test_a4_formula_and_health_checks():
    formula = unpublished_outputs_using_asset_formula("recASSET", "drive-file")
    assert "{Test_Run_ID}=BLANK()" in formula
    assert "NOT({Do_Not_Publish})" in formula
    assert "{Published_At}=BLANK()" in formula
    assert "{Selected_Clip_1_Media_Asset_ID}='recASSET'" in formula
    assert "FIND('drive-file', {Selected_Assets_JSON} & '') > 0" in formula
    assert a4_is_missing(trash_ids={"drive-file"}, drive_file_id="drive-file", head_status=200)
    assert a4_is_missing(trash_ids=set(), drive_file_id="drive-file", head_status=404)
    assert not a4_is_missing(trash_ids=set(), drive_file_id="drive-file", head_status=200)
    assert a4_is_healthy(trash_ids=set(), drive_file_id="drive-file", head_status=302)
    assert not a4_is_healthy(trash_ids={"drive-file"}, drive_file_id="drive-file", head_status=200)
    assert not a4_is_healthy(trash_ids=set(), drive_file_id="", head_status=200)
