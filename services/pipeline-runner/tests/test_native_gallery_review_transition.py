import unittest
from rendering_review.gallery_review_transition import (
    transition_gallery_creative_review, GalleryReviewDenied,
)

OUTPUT="rec00000000000001"
PROFILE="rec00000000000002"
ATTEMPT="attempt_123456789"
SHA="a"*64


class Ops:
    def __init__(self):
        self.attempt={"output_id":OUTPUT,"profile_id":PROFILE,
            "attempt_id":ATTEMPT,"manifest_sha256":SHA,
            "state":"ready_for_review","drive_readback_verified":True,
            "rights_verified":True,"hold_active":True,
            "factory_approved":False,"published":False,"version":3}
        self.review=None
        self.cas_calls=0
    def read_attempt(self, attempt):
        return self.attempt
    def read_review(self, attempt):
        return self.review
    def cas_review(self, attempt, version, value):
        self.cas_calls+=1
        if version!=self.attempt["version"] or self.review:
            return False
        self.review=value
        return True


def decide(ops, **overrides):
    args=dict(output_id=OUTPUT,profile_id=PROFILE,attempt_id=ATTEMPT,
        manifest_sha256=SHA,decision="accept",actor_id="reviewer-1",operations=ops)
    args.update(overrides)
    return transition_gallery_creative_review(**args)


class CreativeReviewTests(unittest.TestCase):
    def test_exact_manifest_creative_accept_does_not_approve_factory(self):
        ops=Ops()
        result=decide(ops)
        self.assertTrue(result["ok"])
        self.assertFalse(result["factory_approved"])
        self.assertFalse(result["publication_authorized"])
        self.assertTrue(decide(ops)["replay"])
        self.assertEqual(ops.cas_calls,1)

    def test_rejection_and_conflicting_replay(self):
        ops=Ops()
        self.assertEqual(decide(ops,decision="reject")["decision"],"reject")
        with self.assertRaisesRegex(GalleryReviewDenied,"conflict"):
            decide(ops)

    def test_stale_revision_never_accepted(self):
        ops=Ops()
        with self.assertRaises(GalleryReviewDenied):
            decide(ops,manifest_sha256="b"*64)
        self.assertEqual(ops.cas_calls,0)

    def test_missing_drive_evidence_and_hold_block_creative_approval(self):
        for key in ("drive_readback_verified","rights_verified","hold_active"):
            ops=Ops()
            ops.attempt[key]=False
            with self.subTest(key=key):
                with self.assertRaises(GalleryReviewDenied):
                    decide(ops)
            self.assertEqual(ops.cas_calls,0)

    def test_ambiguous_cas_never_claims_success(self):
        ops=Ops()
        ops.cas_review=lambda *args:False
        with self.assertRaisesRegex(GalleryReviewDenied,"cas_unverified"):
            decide(ops)


if __name__=="__main__":
    unittest.main()
