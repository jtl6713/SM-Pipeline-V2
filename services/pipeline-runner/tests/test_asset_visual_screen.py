"""Regression checks for the provenance gate: ambiguous/error = fail closed."""

import io

import pytest
from PIL import Image

from a2.processor import _intake_fields
from asset.visual_screen import normalize_screen_result, screen_asset, screening_note
from studio_library.processor import ingest_studio_library_asset


def _jpeg():
    output = io.BytesIO()
    Image.new("RGB", (24, 20), "white").save(output, format="JPEG")
    return output.getvalue()


def test_clean_photo_uses_actual_pixels_and_allows_first_party_mark(monkeypatch):
    seen = []

    def model(prompt, *, image_urls, max_output_tokens):
        seen.append((prompt, image_urls, max_output_tokens))
        return {"parsed": {"decision": "clean", "indicators": [],
                           "evidence": "No embedded third-party overlays visible"}}

    monkeypatch.setattr("asset.visual_screen.classify_asset", model)
    result = screen_asset(content=_jpeg(), filename="river.jpg",
                          mime_type="image/jpeg", profile_name="ChicagoShining")
    assert result["decision"] == "clean"
    assert result["frames_checked"] == 1
    assert seen[0][1][0].startswith("data:image/jpeg;base64,")
    assert "ChicagoShining" in seen[0][0]


def test_third_party_overlay_is_held(monkeypatch):
    monkeypatch.setattr("asset.visual_screen.classify_asset", lambda *args, **kwargs: {
        "parsed": {
            "decision": "blocked", "indicators": ["watermark", "source_url"],
            "evidence": "Stock source watermark on center and footer",
        }
    })
    result = screen_asset(content=_jpeg(), filename="stock.jpg", mime_type="image/jpeg")
    assert result["decision"] == "blocked"
    assert "watermark" in screening_note(result)


def test_uncertain_overlay_requires_review(monkeypatch):
    monkeypatch.setattr("asset.visual_screen.classify_asset", lambda *args, **kwargs: {
        "parsed": {
            "decision": "review", "indicators": ["logo"],
            "evidence": "Partially obscured lower-right logo",
        }
    })
    assert screen_asset(content=_jpeg(), filename="scene.jpg")["decision"] == "review"


def test_malformed_model_results_cannot_approve():
    for raw in (
        {"decision": "clean", "indicators": ["watermark"], "evidence": "logo"},
        {"decision": "clean", "indicators": [], "evidence": ""},
        {"decision": "allow", "indicators": [], "evidence": "yes"},
        {"decision": "blocked", "indicators": [], "evidence": ""},
        {"decision": "clean", "indicators": "none", "evidence": "none"},
        None,
    ):
        assert normalize_screen_result(raw, frames_checked=1)["decision"] == "review"


def test_model_outage_requires_review(monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("temporary model outage")
    monkeypatch.setattr("asset.visual_screen.classify_asset", broken)
    assert screen_asset(content=_jpeg(), filename="upload.jpg")["decision"] == "review"


def test_video_sampling_is_checked(monkeypatch):
    monkeypatch.setattr("asset.visual_screen._video_jpegs",
                        lambda content, filename: [_jpeg(), _jpeg(), _jpeg()])
    seen = []
    def model(prompt, *, image_urls, max_output_tokens):
        seen.append(len(image_urls))
        return {"parsed": {"decision": "review", "indicators": ["social_handle"],
                           "evidence": "Visible social handle on frame three"}}
    monkeypatch.setattr("asset.visual_screen.classify_asset", model)
    result = screen_asset(content=b"fake-video", filename="clip.mp4")
    assert result["decision"] == "review"
    assert result["frames_checked"] == 3
    assert seen == [3]


def test_studio_refuses_suspicious_upload_before_any_drive_write(monkeypatch):
    monkeypatch.setattr("studio_library.processor.screen_asset", lambda **kwargs: {
        "decision": "blocked", "indicators": ["copyright_credit"],
        "evidence": "Third-party photographer credit", "frames_checked": 1,
    })
    monkeypatch.setattr(
        "studio_library.processor.GoogleDriveClient",
        lambda: (_ for _ in ()).throw(AssertionError("Drive must not be called")),
    )
    with pytest.raises(ValueError, match="No asset was uploaded"):
        ingest_studio_library_asset(
            content=_jpeg(), filename="bad.jpg", mime_type="image/jpeg",
            profile_name="New York Shining",
        )


def test_drive_intake_starts_visual_assets_locked():
    for name, mime in (("photo.jpg", "image/jpeg"),
                       ("clip.mp4", "video/mp4"), ("ChicagoShining Logo.png", "image/png")):
        item = {"id": "drive1", "name": name, "mimeType": mime, "size": "100"}
        assert _intake_fields(item, share_url="https://drive", batch_id="test")["Do_Not_Use"] is True
    item = {"id": "audio1", "name": "voice.mp3", "mimeType": "audio/mpeg", "size": "100"}
    assert _intake_fields(item, share_url="https://drive", batch_id="test")["Do_Not_Use"] is False


@pytest.mark.parametrize("decision,expected_hold", [
    ("clean", False), ("review", True), ("blocked", True),
])
def test_drive_intake_preserves_audited_use_hold(monkeypatch, decision, expected_hold):
    from unittest.mock import MagicMock
    from a2.processor import _intake_pass
    from asset.constants import GDRIVE_INGESTION_FOLDER
    from a2 import processor as intake

    drive = MagicMock()
    drive.list_files.return_value = [{
        "id": "driveA", "name": "River.png", "mimeType": "image/png",
        "size": "120", "parents": [GDRIVE_INGESTION_FOLDER],
    }]
    drive.share_anyone_reader.return_value = {"webViewLink": "https://drive.example/river"}
    drive.move_file.return_value = {"id": "driveA"}
    drive.download_file.return_value = (_jpeg(), "image/png")
    client = MagicMock()
    client.create_records.return_value = [{"id": "recRiver"}]

    monkeypatch.setattr(intake, "GoogleDriveClient", lambda: drive)
    monkeypatch.setattr(intake, "AirtableClient", lambda: client)
    monkeypatch.setattr(intake, "existing_intake_match", lambda *a, **kw: None)
    monkeypatch.setattr(intake, "screen_asset", lambda **kw: {
        "decision": decision,
        "indicators": ["watermark"] if decision == "blocked" else [],
        "evidence": "Visible third-party watermark" if decision == "blocked" else "Reviewed frames",
        "frames_checked": 1,
    })
    result = _intake_pass(trigger_a2b=False)
    assert result["intaken_count"] == 1
    initial_fields = client.create_records.call_args.args[1][0]
    assert initial_fields["Do_Not_Use"] is True  # no pre-scan release window
    update_fields = client.update_record.call_args.args[2]
    assert update_fields["Do_Not_Use"] is expected_hold
    assert "QA-ASSET-THIRD-PARTY-OVERLAY" in update_fields["Potential_Match_Notes"]
    if expected_hold:
        assert update_fields["Raw_Source_Eligibility"] in {"Needs Review", "Ineligible"}
