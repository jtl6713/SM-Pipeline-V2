from studio_produce.constants import HEAL_MAX_RESUMES, TERMINAL_STEPS
from studio_produce.job import job_is_terminal, new_job, with_step
from studio_produce.ops_alert import build_escalation_email


def test_escalated_is_terminal():
    assert "escalated" in TERMINAL_STEPS
    job = with_step(new_job(route="ai:photo_sequence"), "escalated", error="retries exhausted")
    assert job_is_terminal(job)
    assert job["detail"] == "Escalated — needs investigation"


def test_heal_max_resumes_default():
    assert HEAL_MAX_RESUMES == 5


def test_build_escalation_email_includes_request_and_error():
    job = {
        "route": "uploaded:photo_sequence",
        "error": "Studio production job crashed",
        "heal": {"resume_count": 5, "max_resumes": 5, "last_step": "render"},
    }
    subject, body = build_escalation_email(request_id="recTEST123", job=job, outputs=[])
    assert "recTEST123" in subject
    assert "Studio production job crashed" in body
    assert "resume_count" in body.lower() or "Resume count" in body
    assert "Open Studio" in body
