"""No automatic Facebook Reel re-create after Meta Graph rate-limit 368."""
from fbs3.eligibility import create_eligibility_reason


def _record(stage: str, status: str = "Retry Pending") -> dict:
    return {"id": "rec12345678901234", "fields": {
        "FB_Slideshow_Status": status,
        "FB_Slideshow_Public_URL": "https://media.example.org/reel.mp4",
        "Publish_Error_Stage": stage,
    }}


def test_rate_limit_stages_require_operator_review_even_when_retry_time_passed():
    for stage in ("FBS3_RATE_LIMIT", "FB_GRAPH_RATE_LIMIT", "FACEBOOK_STORY_RATE_LIMIT_368"):
        assert create_eligibility_reason(_record(stage)) == "rate_limit_requires_operator_review"


def test_non_rate_limit_fbs3_upload_retry_still_allowed():
    assert create_eligibility_reason(_record("FBS3_UPLOAD")) is None
