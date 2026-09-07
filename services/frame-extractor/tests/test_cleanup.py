import app as frame_app


def test_cleanup_rejects_unsafe_job_id():
    client = frame_app.app.test_client()
    response = client.post("/cleanup/..")
    assert response.status_code == 400
    assert response.get_json()["ok"] is False


def test_cleanup_is_idempotent_and_confined(tmp_path, monkeypatch):
    frames = tmp_path / "frames"
    work = tmp_path / "work"
    job = frames / "recABC_deadbeef"
    job.mkdir(parents=True)
    (job / "frame_01.jpg").write_bytes(b"jpeg")
    monkeypatch.setattr(frame_app, "FRAME_DIR", frames)
    monkeypatch.setattr(frame_app, "WORK_DIR", work)
    client = frame_app.app.test_client()
    first = client.post("/cleanup/recABC_deadbeef")
    assert first.status_code == 200
    payload = first.get_json()
    assert payload["ok"] is True
    assert payload["frames"]["removed"] is True
    assert not job.exists()
    second = client.post("/cleanup/recABC_deadbeef")
    assert second.status_code == 200
    assert second.get_json()["frames"]["removed"] is False
    assert second.get_json()["duplicate_safe"] is True


def test_cleanup_report_skips_active(tmp_path, monkeypatch):
    frames = tmp_path / "frames"
    work = tmp_path / "work"
    frames.mkdir()
    work.mkdir()
    stale = frames / "stale_job"
    stale.mkdir()
    (stale / "frame.jpg").write_bytes(b"x")
    import os

    os.utime(stale, (1_700_000_000, 1_700_000_000))
    monkeypatch.setattr(frame_app, "FRAME_DIR", frames)
    monkeypatch.setattr(frame_app, "WORK_DIR", work)
    monkeypatch.setattr(frame_app, "_active_jobs", {"stale_job"})
    client = frame_app.app.test_client()
    report = client.get("/cleanup/report").get_json()
    assert "stale_job" in report["frames"]["skipped_active"]
    assert stale.exists()
