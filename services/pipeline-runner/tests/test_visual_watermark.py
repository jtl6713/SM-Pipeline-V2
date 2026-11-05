from pathlib import Path
from types import SimpleNamespace
import inspect

from branding import watermark as watermark_module
from branding.watermark import profile_requires_watermark, watermark_video_bytes
from item4.processor import _process_master_pending


def test_profile_watermark_rule_is_chicagoshining_only():
    assert profile_requires_watermark("ChicagoShining")
    assert profile_requires_watermark("ChicagoShining - Chicago")
    assert not profile_requires_watermark("New York Shining")
    assert not profile_requires_watermark("Miami Shining")
    assert not profile_requires_watermark("LA Shining")


def test_brand_watermark_url_prefers_drive_file_id_over_studio_public_url():
    class _Client:
        def list_records(self, _table, view=None, max_records=None):
            return [
                {
                    "id": "recTnq3abS2rcsTzK",
                    "fields": {
                        "Google Drive File ID": "1WQyd5W1__HkaEkWyC38IMErW8702Rd4u",
                        "Google Drive URL": (
                            "https://studio.chicagoshining.com/api/public/branding/watermark.png"
                        ),
                    },
                }
            ]

    url = watermark_module.brand_watermark_url(_Client())
    assert url == (
        "https://drive.google.com/uc?export=download&id=1WQyd5W1__HkaEkWyC38IMErW8702Rd4u"
    )
    assert "studio.chicagoshining.com" not in url


def test_video_watermark_burns_overlay_and_keeps_optional_audio(monkeypatch):
    command = []

    def fake_run(args, **_kwargs):
        command.extend(args)
        Path(args[-1]).write_bytes(b"x" * 200)
        return SimpleNamespace(returncode=0, stderr=b"")

    monkeypatch.setattr(watermark_module.subprocess, "run", fake_run)
    result = watermark_video_bytes(
        b"raw-video",
        b"watermark-png",
        filename="lakefront.mov",
    )

    assert len(result) == 200
    assert "-filter_complex" in command
    filter_graph = command[command.index("-filter_complex") + 1]
    assert "scale2ref" in filter_graph
    assert "overlay=" in filter_graph
    assert "0:a?" in command
    assert "libx264" in command
    assert "yuv420p" in command



def test_mov_with_undecodable_audio_retries_watermarked_video_only(monkeypatch):
    calls = []

    def fake_run(args, **_kwargs):
        calls.append(list(args))
        if len(calls) == 1:
            return SimpleNamespace(
                returncode=1,
                stderr=b"Decoding requested, but no decoder found for: none",
            )
        Path(args[-1]).write_bytes(b"branded-video" * 20)
        return SimpleNamespace(returncode=0, stderr=b"")

    monkeypatch.setattr(watermark_module.subprocess, "run", fake_run)
    result = watermark_video_bytes(b"iPhone MOV", b"official-watermark", filename="IMG_7901.mov")
    assert len(result) > 100
    assert len(calls) == 2
    assert "0:a?" in calls[0]
    assert "-an" in calls[1] and "0:a?" not in calls[1]
    assert "overlay=" in calls[1][calls[1].index("-filter_complex") + 1]
    assert "libx264" in calls[1]

def test_item4_master_handoff_watermarks_chicagoshining_before_drive_authority():
    source = inspect.getsource(_process_master_pending)

    assert "_production_profile(client, fields)" in source
    assert "profile_requires_watermark(profile_name)" in source
    assert "brand_watermark_bytes(client)" in source
    assert "watermark_media_bytes(" in source
    assert "Source_Drive_File_ID" in source
    assert "ensure_media_asset(" in source
    assert "watermarked" in source


def test_platform_variants_are_watermarked_after_crop_and_use_preserved_raw_source():
    from studio_produce import queue as produce_queue

    item4_source = inspect.getsource(_process_master_pending)
    complete_source = inspect.getsource(__import__("item4.processor", fromlist=["_complete_variant_upload"])._complete_variant_upload)
    queue_source = inspect.getsource(produce_queue.upsert_variant_queue)
    reconcile_source = inspect.getsource(produce_queue.reconcile_master_authority)

    assert "Source_Drive_File_ID" in item4_source
    assert "watermark_photo_bytes(" in complete_source
    assert "source_google_drive_file_id" in queue_source
    assert "source_google_drive_file_id" in reconcile_source


def test_remotion_sequence_has_persistent_required_watermark_overlay():
    root = Path(__file__).resolve().parents[2]
    source = (root / "remotion-renderer" / "src" / "ChicagoShiningPhotoSequence.tsx").read_text(encoding="utf-8")

    assert "watermarkUrl?: string;" in source
    assert "watermarkRequired?: boolean;" in source
    assert "watermarkRequired && !watermarkSource" in source
    assert "watermarkSource ?" in source
    assert 'data-brand-watermark="logo"' in source
    assert 'width: "12%"' in source
    assert "top: 30" in source
    assert "left: 30" in source


def test_video_watermark_scales_to_video_width_and_preserves_logo_shape(tmp_path):
    """Exercise FFmpeg pixels: main_w incorrectly scales against the logo itself."""
    import shutil
    import subprocess
    from io import BytesIO
    import pytest
    from PIL import Image
    if not shutil.which("ffmpeg"):
        pytest.skip("FFmpeg is required for pixel verification")
    source = tmp_path / "source.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=black:s=400x600:r=2:d=1", "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", str(source)], check=True, timeout=30)
    logo = BytesIO()
    Image.new("RGB", (100, 50), "white").save(logo, format="PNG")
    result = watermark_video_bytes(source.read_bytes(), logo.getvalue(), scale=0.25, margin=20)
    output = tmp_path / "branded.mp4"
    output.write_bytes(result)
    frame = subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1",
                            "-f", "image2pipe", "-vcodec", "png", "-"],
                           capture_output=True, check=True, timeout=30).stdout
    pixels = Image.open(BytesIO(frame)).convert("L")
    bounds = pixels.point(lambda x: 255 if x > 200 else 0).getbbox()
    assert bounds is not None
    left, top, right, bottom = bounds
    assert abs(left - 20) <= 1 and abs(top - 20) <= 1
    assert abs((right - left) - 100) <= 2
    assert abs((bottom - top) - 50) <= 2
