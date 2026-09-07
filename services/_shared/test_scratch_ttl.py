from pathlib import Path

from scratch_ttl import confined_path, is_safe_job_id, remove_job_dir, sweep_root


def test_rejects_path_traversal(tmp_path: Path):
    assert is_safe_job_id("recABC_deadbeef")
    assert not is_safe_job_id("../etc")
    assert not is_safe_job_id("a/b")
    assert confined_path(tmp_path, "..") is None
    assert confined_path(tmp_path, "ok-job") == (tmp_path / "ok-job").resolve()


def test_remove_is_idempotent_and_confined(tmp_path: Path):
    job = tmp_path / "job-one"
    job.mkdir()
    (job / "frame.jpg").write_bytes(b"x" * 10)
    first = remove_job_dir(tmp_path, "job-one")
    assert first["ok"] is True
    assert first["removed"] is True
    assert first["files"] == 1
    second = remove_job_dir(tmp_path, "job-one")
    assert second["ok"] is True
    assert second["removed"] is False
    assert second["duplicate_safe"] is True
    outside = remove_job_dir(tmp_path, "../secrets")
    assert outside["ok"] is False


def test_sweep_skips_active_and_fresh(tmp_path: Path, monkeypatch):
    stale = tmp_path / "stale-job"
    fresh = tmp_path / "fresh-job"
    active = tmp_path / "active-job"
    for folder in (stale, fresh, active):
        folder.mkdir()
        (folder / "a.bin").write_bytes(b"hello")
    stale_mtime = 1_700_000_000.0
    import os

    os.utime(stale, (stale_mtime, stale_mtime))
    report = sweep_root(tmp_path, ttl_hours=24, active_ids=["active-job"], dry_run=True)
    ids = {item["job_id"] for item in report["selected"]}
    assert "stale-job" in ids
    assert "fresh-job" not in ids
    assert "active-job" in report["skipped_active"]
    applied = sweep_root(tmp_path, ttl_hours=24, active_ids=["active-job"], dry_run=False)
    assert not (tmp_path / "stale-job").exists()
    assert (tmp_path / "fresh-job").exists()
    assert (tmp_path / "active-job").exists()
    assert applied["bytes"] >= 5


def test_vendored_copies_match_canonical():
    canonical = Path(__file__).resolve().parent / "scratch_ttl.py"
    root = Path(__file__).resolve().parents[2]
    copies = [
        root / "services" / "frame-extractor" / "scratch_ttl.py",
        root / "services" / "timing-engine" / "scratch_ttl.py",
        root / "services" / "video-compressor" / "scratch_ttl.py",
        root / "deploy" / "cloud-vm" / "scratch-ttl" / "scratch_ttl.py",
    ]
    expected = canonical.read_bytes()
    missing = [str(path) for path in copies if not path.is_file()]
    assert not missing, f"missing vendored scratch_ttl copies: {missing}"
    drifted = [str(path) for path in copies if path.read_bytes() != expected]
    assert not drifted, f"scratch_ttl copies drifted from services/_shared: {drifted}"
    canonical = Path(__file__).resolve().parent / "scratch_ttl.py"
    root = Path(__file__).resolve().parents[2]
    copies = [
        root / "services" / "frame-extractor" / "scratch_ttl.py",
        root / "services" / "timing-engine" / "scratch_ttl.py",
        root / "services" / "video-compressor" / "scratch_ttl.py",
        root / "deploy" / "cloud-vm" / "scratch-ttl" / "scratch_ttl.py",
    ]
    expected = canonical.read_bytes()
    missing = [str(path) for path in copies if not path.is_file()]
    assert not missing, f"missing vendored scratch_ttl copies: {missing}"
    drifted = [str(path) for path in copies if path.read_bytes() != expected]
    assert not drifted, f"scratch_ttl copies drifted from services/_shared: {drifted}"
