import copy
import json
import unittest
from rendering_review.producer import CHICAGO_PROFILE_ID, propose_revision, ProducerModelHTTPError

EVIDENCE = {"profile_id": CHICAGO_PROFILE_ID, "output_type": "Instagram Reel",
            "assets": [{"id": "asset-1", "name": "Opening station shot"}], "sources": []}
PROPOSAL = {"explanation": "Add a decision sequence and worked journey example; retain the station opening.",
    "narration": "Start with your destination. Compare the available routes and choose a direction before boarding.",
    "preserve": ["Opening station shot"], "changes": ["Add worked journey example"],
    "reuse_asset_ids": ["asset-1"],
    "timeline": [{"start_seconds": 0, "end_seconds": 15, "direction": "Retain opening and introduce decision steps", "asset_ids": ["asset-1"]}],
    "requirements": [{"description": "Verify the worked route against an official current transit source", "kind": "research", "alternatives": ["Choose a verified example supplied by the reviewer"]}],
    "claims": [{"claim": "The worked journey must use a verified route", "source_ids": []}],
    "acceptance_checks": ["Narration includes a destination, route decision and direction"]}


class ProducerTests(unittest.TestCase):
    def invoke(self, proposal=None, evidence=None):
        calls = []
        class Response:
            ok = True
            def json(self):
                return {"id": "model-fixture", "model": "fixture", "output_text": json.dumps(proposal or PROPOSAL)}
        def transport(settings, body, **options):
            calls.append((body, options))
            return Response()
        result = propose_revision(evidence or EVIDENCE, "Make this more instructional and add a worked example", {}, transport=transport)
        return result, calls

    def test_calls_model_with_evidence_and_returns_candidate_without_execution(self):
        result, calls = self.invoke()
        self.assertEqual(len(calls), 1)
        self.assertIn("creative_direction", calls[0][0]["input"])
        self.assertNotIn("reasoning", calls[0][0], "Producer request must work with Azure deployments")
        self.assertFalse(calls[0][0]["store"])
        self.assertTrue(result["candidate_only"])
        self.assertFalse(result["visual_inspection_performed"])
        self.assertTrue(result["requires_fact_validation"])
        self.assertEqual(len(result["unresolved_claims"]), 1)
        self.assertEqual(len(result["candidate_hash"]), 64)

    def test_missing_assets_and_fabricated_sources_rejected(self):
        for key, value in (("reuse_asset_ids", ["invented"]), ("claims", [{"claim": "Invented route", "source_ids": ["invented-source"]}])):
            p = copy.deepcopy(PROPOSAL)
            p[key] = value
            with self.assertRaises(ValueError): self.invoke(p)

    def test_model_cannot_assert_commit_or_validation_authority(self):
        p = copy.deepcopy(PROPOSAL)
        p["authorized"] = True
        with self.assertRaises(ValueError): self.invoke(p)

    def test_outside_scope_never_calls_model(self):
        for change in ({"profile_id": "another-city"}, {"output_type": "Instagram Story"}):
            with self.assertRaises(ValueError): self.invoke(evidence={**EVIDENCE, **change})

    def test_unordered_timeline_rejected(self):
        p = copy.deepcopy(PROPOSAL)
        p["timeline"][0]["end_seconds"] = -1
        with self.assertRaises(ValueError): self.invoke(p)

    def test_timeline_gap_is_rejected_before_unrenderable_plan_reaches_studio(self):
        p = copy.deepcopy(PROPOSAL)
        p["timeline"].append({
            "start_seconds": 16, "end_seconds": 20,
            "direction": "Second owned image", "asset_ids": ["asset-1"],
        })
        with self.assertRaisesRegex(ValueError, "timeline"):
            self.invoke(p)

    def test_multiple_assets_in_one_scene_are_rejected_before_render(self):
        p = copy.deepcopy(PROPOSAL)
        p["timeline"][0]["asset_ids"] = ["asset-1", "asset-1"]
        with self.assertRaisesRegex(ValueError, "exactly one owned asset"):
            self.invoke(p)

    def test_contiguous_owned_image_scenes_stay_executable(self):
        p = copy.deepcopy(PROPOSAL)
        p["preserve"] = []
        p["timeline"].append({
            "start_seconds": 15, "end_seconds": 20,
            "direction": "Finish with the same owned image", "asset_ids": ["asset-1"],
        })
        result, _ = self.invoke(p)
        self.assertEqual(len(result["candidate"]["timeline"]), 2)

    def test_existing_source_associations_retained_without_claiming_verified(self):
        p = copy.deepcopy(PROPOSAL)
        p["claims"][0]["source_ids"] = ["source-1"]
        source = {"id": "source-1", "url": "https://www.transitchicago.com/", "excerpt": "fixture source excerpt"}
        result, _ = self.invoke(p, {**EVIDENCE, "sources": [source]})
        self.assertEqual(result["source_associations"][0]["sources"], [source])
        self.assertTrue(result["requires_fact_validation"])


    def test_model_http_error_has_bounded_status_without_provider_body(self):
        class FailedResponse:
            ok = False
            status_code = 400
            text = "provider_internal_secret_must_not_escape"
        with self.assertRaises(ProducerModelHTTPError) as raised:
            propose_revision(EVIDENCE, "Use more Riverwalk stills", {},
                             transport=lambda *args, **kwargs: FailedResponse())
        self.assertEqual(raised.exception.status_code, 400)
        self.assertNotIn("provider_internal_secret", str(raised.exception))
        self.assertEqual(raised.exception.provider_code, "unknown")
        self.assertEqual(raised.exception.provider_param, "unknown")

    def test_model_400_returns_machine_readable_provider_details_only(self):
        class Response:
            ok = False
            status_code = 400
            def json(self):
                return {"error": {"code": "unsupported_parameter", "param": "text.format",
                                  "message": "SECRET user text must not escape"}}
        with self.assertRaises(ProducerModelHTTPError) as raised:
            propose_revision(EVIDENCE, "Add more Riverwalk still photos", {},
                             transport=lambda *args, **kwargs: Response())
        self.assertEqual(raised.exception.provider_code, "unsupported_parameter")
        self.assertEqual(raised.exception.provider_param, "text.format")
        self.assertNotIn("SECRET", str(raised.exception))

if __name__ == '__main__': unittest.main()
