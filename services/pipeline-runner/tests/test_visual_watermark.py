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
    assert "watermarkRequired && watermarkSource" in source
    assert 'width: "12%"' in source
