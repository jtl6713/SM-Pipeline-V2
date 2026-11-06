"""Protected I1 shortfall recovery endpoint does not create another batch."""
from unittest.mock import patch

from app import app, settings

SECRET = "run-i1-verified-shortfall-secret-1234"
BODY = {
    "batch_record_id": "rec" + "B" * 14,
    "profile_record_id": "rec" + "P" * 14,
    "requested_count": 10,
    "quality": "Highest Quality",
    "confirm_verified_only": True,
}
URL = "/jobs/i1-durable/resume-verified-shortfall"


def test_exact_authorized_request_only(monkeypatch):
    monkeypatch.setitem(settings, "pipeline_runner_shared_secret", SECRET)
    called = []
    with patch("app.i1_durable_enabled", return_value=True), patch(
        "app.resume_verified_i1_shortfall",
        side_effect=lambda *args: called.append(args) or {
            "accepted": True, "status": "queued",
            "batch_record_id": BODY["batch_record_id"],
            "existing_verified": 9, "missing": 1, "requeued_only": True,
        }):
        client = app.test_client()
        assert client.post(URL, json=BODY).status_code == 401
        assert client.post(URL + "?force=true", json=BODY,
                           headers={"X-Pipeline-Secret": SECRET}).status_code == 400
        assert client.post(URL, json={**BODY, "confirm_verified_only": False},
                           headers={"X-Pipeline-Secret": SECRET}).status_code == 400
        assert client.post(URL, json={**BODY, "extra": "unsafe"},
                           headers={"X-Pipeline-Secret": SECRET}).status_code == 400
        assert called == []
        result = client.post(URL, json=BODY, headers={"X-Pipeline-Secret": SECRET})
        assert result.status_code == 202
        assert result.json["missing"] == 1
        assert result.json["requeued_only"] is True
        assert result.headers["Cache-Control"] == "no-store"
        assert called == [(
            BODY["batch_record_id"], BODY["profile_record_id"], 10, "Highest Quality")]


def test_ineligible_or_uncertain_batch_does_not_requeue(monkeypatch):
    from i1.durable_jobs import TerminalBatchMismatch
    monkeypatch.setitem(settings, "pipeline_runner_shared_secret", SECRET)
    with patch("app.i1_durable_enabled", return_value=True), patch(
        "app.resume_verified_i1_shortfall",
        side_effect=TerminalBatchMismatch("wrong batch")):
        reply = app.test_client().post(
            URL, json=BODY, headers={"X-Pipeline-Secret": SECRET})
        assert reply.status_code == 409
        assert "wrong batch" not in reply.get_data(as_text=True)
