"""No platform can start provider work while an exact Rendering Review hold exists."""
import unittest

from fb.eligibility import (fb0_eligibility_reason, fb1_eligibility_reason,
    fb2_eligibility_reason, fb2r_eligibility_reason, fb3_eligibility_reason)
from yt.eligibility import (yt0_eligibility_reason, ytp1_eligibility_reason,
    yts1_eligibility_reason, yts2_eligibility_reason, yts3_eligibility_reason)
from ttd.eligibility import (ttd0_eligibility_reason, ttd1_eligibility_reason,
    ttd2_eligibility_reason, ttd3_eligibility_reason)
from ap1_igs.eligibility import (create_eligibility_reason, poll_eligibility_reason)

MARKERS = (
    "Studio_Render_Review_Hold_Active", "Studio_Render_Review_Hold_ID",
    "Studio_Render_Review_Hold_Owner", "Studio_Render_Review_Session_ID",
    "Studio_Review_Hold_ID",
)
BLOCK = "rendering_review_requires_exact_approval"
RECORD = "recA1B2C3D4E5F6G7"

def record(platform, marker):
    return {"id": RECORD, "fields": {
        "Platform": platform, "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False, "Review_Status": "Approved",
        "Output_Status": "Ready for Review", "Publish_Status": "Not Published",
        "FB_Publish_Status": "Ready for Assets",
        "TikTok_Draft_Status": "Ready for Assets",
        "YouTube_Stage": "YT1", "IG_Story_Status": "Ready",
        "Publish_Method": "Automated", marker: True,
    }}

class ReviewCrossPlatformHoldTests(unittest.TestCase):
    def test_facebook_stages_deny_every_review_marker(self):
        for marker in MARKERS:
            with self.subTest(marker=marker):
                r=record("Facebook",marker)
                for fn in (fb0_eligibility_reason, fb1_eligibility_reason,
                           fb2_eligibility_reason, fb2r_eligibility_reason):
                    self.assertEqual(fn(r), BLOCK, fn.__name__)
                post=record("Facebook",marker)
                post["fields"]["Platform_Post_ID"]="already-issued"
                self.assertEqual(fb3_eligibility_reason(post), BLOCK)

    def test_youtube_stages_deny_every_review_marker(self):
        for marker in MARKERS:
            with self.subTest(marker=marker):
                r=record("YouTube",marker)
                for fn in (yt0_eligibility_reason, ytp1_eligibility_reason,
                           yts1_eligibility_reason, yts2_eligibility_reason,
                           yts3_eligibility_reason):
                    self.assertEqual(fn(r), BLOCK, fn.__name__)

    def test_tiktok_stages_deny_every_review_marker(self):
        for marker in MARKERS:
            with self.subTest(marker=marker):
                r=record("TikTok",marker)
                for fn in (ttd0_eligibility_reason, ttd1_eligibility_reason,
                           ttd3_eligibility_reason):
                    self.assertEqual(fn(r), BLOCK, fn.__name__)
                r["fields"]["TikTok_Draft_Publish_ID"]="existing-draft"
                self.assertEqual(ttd2_eligibility_reason(r), BLOCK)

    def test_instagram_story_create_and_poll_hold(self):
        for marker in MARKERS:
            with self.subTest(marker=marker):
                r=record("Instagram",marker)
                r["fields"]["Platform_Output_Type"]="Instagram Story"
                r["fields"]["Output_Status"]="Approved for Publishing"
                self.assertEqual(create_eligibility_reason(r), BLOCK)
                self.assertEqual(poll_eligibility_reason(r), BLOCK)

if __name__ == "__main__":
    unittest.main()
