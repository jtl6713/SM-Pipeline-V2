import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

from ame_bridge.app import Bridge, create_app
from ame_bridge.watch import BridgeConfig, ensure_layout, reconcile_once, root_is_dedicated

PRESET = "social-standard-9x16"


def _config(root: Path, **overrides) -> BridgeConfig:
    ensure_layout(root)
    values = dict(
        root=root,
        stability_seconds=10,
        min_output_bytes=4,
        delete_watch_source=True,
        use_ffprobe=False,
    )
    values.update(overrides)
    return BridgeConfig(**values)


def _write(path: Path, payload: bytes, mtime: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    os.utime(path, (mtime, mtime))


def _run(config, observations, now, probe=None):
    return reconcile_once(config, observations, now, probe=probe)


def test_deletes_inbox_source_after_output_is_stable(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    library = tmp_path / "library" / "beach.mov"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)
    _write(library, b"original-master", 10_000)

    report, observations = _run(config, {}, 10_000)
    assert source.exists()
    assert report["completed"] == []

    report, _observations = _run(config, observations, 10_020)
    assert report["ok"] is True
    assert report["completed"][0]["source_deleted"] is True
    assert report["completed"][0]["source_bytes"] == len(b"source-bytes")
    assert not source.exists()
    assert output.read_bytes() == b"encoded-mp4"
    assert library.read_bytes() == b"original-master"


def test_deletes_source_copy_media_encoder_parked_under_source(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    parked = root / "inbox" / PRESET / "Source" / "2026-10-10_23-07-28" / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    library = tmp_path / "Pictures" / "beach.mov"
    _write(parked, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)
    _write(library, b"original-master", 9_000)

    report, observations = _run(config, {}, 10_000)
    assert parked.exists()
    assert report["completed"] == []

    report, _observations = _run(config, observations, 10_020)
    assert report["completed"][0]["source_deleted"] is True
    assert not parked.exists()
    assert not parked.parent.exists()
    assert output.read_bytes() == b"encoded-mp4"
    assert library.read_bytes() == b"original-master"


def test_waits_while_the_encode_is_still_growing(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"1234", 10_000)

    _report, observations = _run(config, {}, 10_000)
    _write(output, b"encoded-mp4-growing", 10_010)
    report, observations = _run(config, observations, 10_010)
    assert source.exists()
    assert report["pending"][0]["reason"] == "waiting_for_stable_file"

    report, _observations = _run(config, observations, 10_020)
    assert not source.exists()
    assert output.exists()


def test_old_output_does_not_delete_a_newer_source(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"old-output", 9_000)

    _report, observations = _run(config, {}, 10_000)
    report, _observations = _run(config, observations, 10_030)
    assert source.exists()
    assert output.exists()
    assert report["pending"][0]["reason"] == "output_predates_source"


def test_preserved_timestamp_waits_for_a_new_output(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 100)

    report, observations = _run(config, {}, 10_000)
    report, observations = _run(config, observations, 10_020)
    assert report["pending"][0]["reason"] == "waiting_for_output"
    assert source.exists()

    _write(output, b"encoded-mp4", 10_030)
    report, observations = _run(config, observations, 10_030)
    report, _observations = _run(config, observations, 10_050)
    assert not source.exists()
    assert output.exists()


def test_preserved_timestamp_does_not_trust_an_existing_output(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 100)
    _write(output, b"already-there", 9_000)

    _report, observations = _run(config, {}, 10_000)
    report, _observations = _run(config, observations, 10_030)
    assert source.exists()
    assert output.read_bytes() == b"already-there"
    assert report["pending"][0]["reason"] == "output_predates_source"


def test_ame_default_output_subfolder_is_accepted(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "inbox" / PRESET / "Output" / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)

    _report, observations = _run(config, {}, 10_000)
    report, _observations = _run(config, observations, 10_020)
    assert report["completed"][0]["source_deleted"] is True
    assert not source.exists()
    assert output.read_bytes() == b"encoded-mp4"


def test_duplicate_ame_name_matches_the_only_source(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach_1.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)

    _report, observations = _run(config, {}, 10_000)
    report, _observations = _run(config, observations, 10_020)
    assert report["completed"][0]["output_name"] == "beach_1.mp4"
    assert not source.exists()


def test_ambiguous_sources_and_outputs_are_kept(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    mov = root / "inbox" / PRESET / "beach.mov"
    mp4 = root / "inbox" / PRESET / "beach.mp4"
    output = root / "out" / PRESET / "beach.mp4"
    _write(mov, b"source-mov", 10_000)
    _write(mp4, b"source-mp4", 10_000)
    _write(output, b"encoded", 10_010)

    _report, observations = _run(config, {}, 10_000)
    report, _observations = _run(config, observations, 10_020)
    assert mov.exists() and mp4.exists() and output.exists()
    assert report["skipped"][0]["reason"] == "ambiguous_source"

    other = root / "out" / PRESET / "beach_1.mp4"
    _write(other, b"encoded-2", 10_010)
    mov.unlink()
    _report, observations = _run(config, {}, 10_100)
    report, _observations = _run(config, observations, 10_120)
    assert mp4.exists()
    assert report["skipped"][0]["reason"] == "ambiguous_output"


def test_probe_failure_keeps_the_source(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root, use_ffprobe=True)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)

    def reject(_path):
        return {"ok": False, "error": "invalid_media"}

    _report, observations = _run(config, {}, 10_000, probe=reject)
    report, _observations = _run(config, observations, 10_020, probe=reject)
    assert source.exists()
    assert report["pending"][0]["reason"] == "invalid_media"


def test_keep_marker_blocks_deletion(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)
    _write(source.with_name(source.name + ".keep"), b"keep", 10_000)

    _report, observations = _run(config, {}, 10_000)
    report, _observations = _run(config, observations, 10_020)
    assert source.exists()
    assert report["pending"][0]["reason"] == "keep_marker"


def test_dry_run_and_second_pass_do_not_touch_files(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root, delete_watch_source=False)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)
    _report, observations = _run(config, {}, 10_000)
    report, _observations = _run(config, observations, 10_020)
    assert report["completed"][0]["source_deleted"] is False
    assert report["completed"][0]["reason"] == "dry_run"
    assert source.exists()

    live = _config(root, delete_watch_source=True)
    report, observations = _run(live, {}, 10_100)
    report, observations = _run(live, observations, 10_120)
    assert not source.exists()
    report, _observations = _run(live, observations, 10_140)
    assert report["completed"] == []
    assert output.exists()


def test_nested_temp_and_sidecar_files_are_ignored(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    nested = root / "inbox" / PRESET / "nested" / "beach.mov"
    partial = root / "out" / PRESET / "beach.mp4.part"
    sidecar = root / "out" / PRESET / "beach.xmp"
    _write(nested, b"nested-source", 10_000)
    _write(partial, b"partial", 10_010)
    _write(sidecar, b"<xmp>", 10_010)

    report, _observations = _run(config, {}, 10_030)
    assert nested.exists() and partial.exists() and sidecar.exists()
    assert report["completed"] == []
    assert report["pending"] == []


def test_missing_marker_and_protected_roots_delete_nothing(tmp_path):
    root = tmp_path / "unmarked"
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)
    config = BridgeConfig(root=root, stability_seconds=0, min_output_bytes=4, use_ffprobe=False)
    report, _observations = _run(config, {}, 10_000)
    assert report["ok"] is False
    assert report["errors"][0]["error"] == "marker_missing"
    assert source.exists()

    downloads = Path.home() / "Downloads"
    assert root_is_dedicated(downloads) is False
    protected = BridgeConfig(root=downloads, stability_seconds=0, min_output_bytes=4, use_ffprobe=False)
    report, _observations = _run(protected, {}, 10_000)
    assert report["errors"][0]["error"] == "root_not_dedicated"


def test_delete_failure_is_retried(tmp_path, monkeypatch):
    root = tmp_path / "bridge"
    config = _config(root, stability_seconds=0)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)

    def explode(_source, _inbox):
        raise OSError("sharing violation")

    monkeypatch.setattr("ame_bridge.watch._unlink_watch_source", explode)
    report, observations = _run(config, {}, 10_000)
    assert source.exists()
    assert report["errors"][0]["error"] == "delete_failed"

    monkeypatch.undo()
    report, _observations = _run(config, observations, 10_000)
    assert not source.exists()


def test_bridge_remembers_stability_across_restart(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    _write(source, b"source-bytes", 10_000)
    _write(output, b"encoded-mp4", 10_010)

    first = Bridge(config)
    first.reconcile(now=10_000)
    assert source.exists()

    restarted = Bridge(config)
    report = restarted.reconcile(now=10_005)
    assert source.exists()
    assert report["pending"][0]["reason"] == "waiting_for_stable_file"

    report = restarted.reconcile(now=10_020)
    assert not source.exists()
    ledger = (root / "state" / "completions.jsonl").read_text(encoding="utf-8")
    assert "beach.mov" in ledger
    assert json.loads(ledger)["source_deleted"] is True


def test_http_reconcile_removes_the_source_copy(tmp_path):
    root = tmp_path / "bridge"
    config = _config(root, stability_seconds=0)
    source = root / "inbox" / PRESET / "beach.mov"
    output = root / "out" / PRESET / "beach.mp4"
    now = time.time()
    _write(source, b"source-bytes", now)
    _write(output, b"encoded-mp4", now + 1)
    bridge = Bridge(config)
    client = create_app(bridge).test_client()

    health = client.get("/health").get_json()
    assert health["service"] == "chicagoshining-ame-bridge"
    assert PRESET in health["presets"]
    assert health["delete_watch_source"] is True

    held = client.post("/reconcile", json={"dry_run": True}).get_json()
    assert held["completed"][0]["source_deleted"] is False
    assert source.exists()

    done = client.post("/reconcile").get_json()
    assert done["completed"][0]["source_deleted"] is True
    assert not source.exists()
    status = client.get("/status").get_json()
    assert status["recent_completions"][0]["source_name"] == "beach.mov"


def test_ffprobe_accepts_a_real_clip_before_deletion(tmp_path):
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        pytest.skip("ffmpeg/ffprobe not installed")
    root = tmp_path / "bridge"
    config = _config(root, stability_seconds=0, min_output_bytes=128, use_ffprobe=True)
    source = root / "inbox" / PRESET / "color.mov"
    output = root / "out" / PRESET / "color.mp4"
    source.parent.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x180:d=1",
            "-pix_fmt",
            "yuv420p",
            str(output),
        ],
        check=True,
        capture_output=True,
    )
    _write(source, b"working-copy", output.stat().st_mtime)
    report, _observations = _run(config, {}, output.stat().st_mtime + 1)
    assert report["completed"][0]["validation"] == "ffprobe"
    assert report["completed"][0]["source_deleted"] is True
    assert not source.exists()
    assert output.exists()
