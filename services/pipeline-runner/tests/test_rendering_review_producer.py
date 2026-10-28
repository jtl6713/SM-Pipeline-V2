import copy
import json
import unittest
from rendering_review.producer import CHICAGO_PROFILE_ID, propose_revision, ProducerModelHTTPError, validate_candidate

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
        self.assertIn("Return exactly one JSON object", calls[0][0]["input"])
        self.assertIn("JSON", calls[0][0]["input"])
        self.assertNotIn("reasoning", calls[0][0], "Producer request must work with Azure deployments")
        self.assertFalse(calls[0][0]["store"])
        self.assertTrue(result["candidate_only"])
        self.assertFalse(result["visual_inspection_performed"])
        self.assertTrue(result["requires_fact_validation"])
        self.assertEqual(len(result["unresolved_claims"]), 1)
        self.assertEqual(len(result["candidate_hash"]), 64)

    def test_producer_receives_exact_morning_scene_and_existing_sunrise_alternative(self):
        e = {**EVIDENCE, "assets": [
            {"id": "night-reel-asset", "name": "Chicago Riverwalk 10",
             "time_of_day": "Night", "description": "Night view of river"},
            {"id": "morning-reel-asset", "name": "Chicago Riverwalk 8",
             "time_of_day": "Morning", "description": "Sunny morning Riverwalk"}],
             "original_timeline": [
                {"asset_id": "night-reel-asset", "start_seconds": 0,
                 "end_seconds": 3, "time_of_day": "Night"},
                {"asset_id": "morning-reel-asset", "start_seconds": 3,
                 "end_seconds": 6, "time_of_day": "Morning"}],
             "library_candidates": [
                {"media_asset_record_id": "rec00000000000002",
                 "name": "Chicago River Bridge 8", "time_of_day": "Sunrise"}]}
        proposal = copy.deepcopy(PROPOSAL)
        proposal["timeline"] = [
            {"start_seconds": 0, "end_seconds": 3,
             "direction": "Use the already linked morning still",
             "asset_ids": ["morning-reel-asset"]},
            {"start_seconds": 3, "end_seconds": 6,
             "direction": "Keep the original morning still",
             "asset_ids": ["morning-reel-asset"]}]
        proposal["reuse_asset_ids"] = ["morning-reel-asset"]
        requests = []
        class Resp:
            ok = True
            def json(self):
                return {"id": "model-fixture", "output_text": json.dumps(proposal)}
        def transport(settings, payload, **opts):
            requests.append(payload)
            return Resp()
        result = propose_revision(e, "Replace nighttime view with sunrise or daytime", {}, transport=transport)
        self.assertEqual(result["candidate"]["timeline"][0]["asset_ids"], ["morning-reel-asset"])
        self.assertIn("Chicago River Bridge 8", requests[0]["input"])
        self.assertIn("Chicago Riverwalk 8", requests[0]["input"])
        self.assertIn("Morning", requests[0]["input"])
        self.assertTrue(result["candidate_only"])
        self.assertFalse(result["visual_inspection_performed"])

    def test_explicit_two_night_stills_creates_verified_source_only_candidate_not_v2(self):
        owned = [
            {"id": "night-one", "name": "Gibsons Italia 5",
             "time_of_day": "Night", "metadata_verified": True,
             "frames_inspected": False},
            {"id": "day-two", "name": "Chicago Riverwalk 8",
             "time_of_day": "Morning", "metadata_verified": True,
             "frames_inspected": False},
            {"id": "night-three", "name": "Chicago Riverwalk 10",
             "time_of_day": "Night", "metadata_verified": True,
             "frames_inspected": False}]
        evidence = {**EVIDENCE,"assets":owned,
            "narration":"The Chicago river at sunrise.",
            "original_timeline":[
                {"start_seconds":0.0,"end_seconds":3.567,"asset_id":"night-one"},
                {"start_seconds":3.567,"end_seconds":6.767,"asset_id":"day-two"},
                {"start_seconds":6.767,"end_seconds":10.0,"asset_id":"night-three"}]}
        class Response:
            ok = True
            def json(self):
                return {"id":"model-fixture","output_text":json.dumps(PROPOSAL)}
        result=propose_revision(evidence,
            "Please replace BOTH nighttime scenes using already owned Riverwalk images. "
            "Preserve narration, music and scene timing. Do not render V2 yet.",
            {},transport=lambda *args, **kwargs: Response())
        c=result["candidate"]
        self.assertEqual([x["asset_ids"][0] for x in c["timeline"]],
                         ["day-two","day-two","day-two"])
        self.assertEqual([x["end_seconds"] for x in c["timeline"]],
                         [3.567,6.767,10.0])
        self.assertEqual(c["narration"],evidence["narration"])
        self.assertEqual(c["requirements"],[])
        self.assertEqual(c["claims"],[])
        self.assertEqual(len(c["changes"]),2)
        self.assertIn("haven\'t made the revised video",c["explanation"])
        self.assertTrue(result["candidate_only"])
        self.assertFalse(result["visual_inspection_performed"])
        self.assertTrue(result["requires_fact_validation"])

    def test_exact_8447_reviewer_action_bypasses_slow_model_without_rendering(self):
        # Ten original, independently described stills with the two recorded
        # Night scenes in positions 1 and 5. The actual Studio action requests
        # an executable candidate only; the endpoint still re-reads authority
        # and the Worker must independently validate crops/rights/hold.
        day = {"id": "day", "name": "Chicago Riverwalk 8", "time_of_day": "Morning",
               "metadata_verified": True, "frames_inspected": False}
        night1 = {"id": "night1", "name": "Gibsons Italia 5", "time_of_day": "Night",
                  "metadata_verified": True, "frames_inspected": False}
        night5 = {"id": "night5", "name": "Chicago Riverwalk 10", "time_of_day": "Night",
                  "metadata_verified": True, "frames_inspected": False}
        bounds = [0, 3.567, 6.767, 10.3, 13.9, 17.133, 20.7,
                  24.233, 27.433, 30.967, 34.467]
        orig = []
        for i in range(10):
            asset = night1 if i == 0 else night5 if i == 4 else day
            orig.append({"start_seconds": bounds[i], "end_seconds": bounds[i + 1],
                         "asset_id": asset["id"], "time_of_day": asset["time_of_day"]})
        evidence = {**EVIDENCE, "output_id": "rec0uVrVeiUM6shp9",
                    "assets": [night1, day, night5],
                    "narration": "Preserve original soundtrack narration.",
                    "original_timeline": orig}
        direction = ("Please replace BOTH nighttime scenes, including frame 1 "
                     "(0.000–3.567s) and frame 5 (13.900–17.133s), using already "
                     "owned, approved 9:16 Morning/Daytime Chicago River stills "
                     "such as Chicago Riverwalk 8. Keep every other scene, "
                     "narration, music, watermark and exact scene timing unchanged. "
                     "Do not request an upload when a verified existing still is "
                     "available. Do not claim the video was modified; first produce "
                     "a complete render-ready plan with zero unresolved requirements "
                     "and no invented factual claims. I will separately authorize "
                     "V2 rendering after reviewing the plan.")
        def forbidden_model(*args, **kwargs):
            raise AssertionError("Exact source-owned edit should not call model")
        result = propose_revision(evidence, direction, {}, transport=forbidden_model)
        candidate = result["candidate"]
        self.assertEqual(len(candidate["timeline"]), 10)
        self.assertEqual([x["asset_ids"][0] for x in candidate["timeline"]],
                         ["day"] * 10)
        self.assertEqual([x["start_seconds"] for x in candidate["timeline"]], bounds[:-1])
        self.assertEqual([x["end_seconds"] for x in candidate["timeline"]], bounds[1:])
        self.assertEqual(candidate["narration"], evidence["narration"])
        self.assertEqual(candidate["requirements"], [])
        self.assertEqual(candidate["claims"], [])
        self.assertEqual(len(candidate["changes"]), 2)
        self.assertTrue(result["candidate_only"])
        self.assertTrue(result["requires_fact_validation"])
        self.assertFalse(result["visual_inspection_performed"])
        self.assertIsNone(result["model_response_id"])
        self.assertEqual(result["model"], "bounded-source-evidence-only")

    def test_8447_plain_language_photo_acceptance_preserves_actual_reply(self):
        day = {"id": "day-morning", "name": "Chicago Riverwalk 8",
               "time_of_day": "Morning", "metadata_verified": True,
               "frames_inspected": False}
        n1 = {"id": "night-one", "name": "Gibsons Italia 5",
              "time_of_day": "Night", "metadata_verified": True,
              "frames_inspected": False}
        n5 = {"id": "night-five", "name": "Chicago Riverwalk 10",
              "time_of_day": "Night", "metadata_verified": True,
              "frames_inspected": False}
        bounds = [0, 3.567, 6.767, 10.3, 13.9, 17.133, 20.7,
                  24.233, 27.433, 30.967, 34.467]
        original = [{"start_seconds": bounds[i], "end_seconds": bounds[i+1],
                     "asset_id": (n1 if i == 0 else n5 if i == 4 else day)["id"]}
                    for i in range(10)]
        evidence = {**EVIDENCE, "output_id": "rec0uVrVeiUM6shp9",
                    "session_version": 3, "assets": [n1, day, n5],
                    "narration": "The original narration", "original_timeline": original,
                    "messages": [{"role": "producer", "content": "I found a morning Riverwalk photo."}]}
        def no_model(*args, **kwargs):
            raise AssertionError("Accepting exact source-backed images must not call model")
        for direction in ("Yes", "Yes, those look good.", "Looks good", "Use these"):
            result = propose_revision(evidence, direction, {}, transport=no_model)
            candidate = result["candidate"]
            self.assertEqual([scene["asset_ids"][0] for scene in candidate["timeline"]],
                             ["day-morning"] * 10)
            self.assertEqual(len(candidate["changes"]), 2)
            self.assertEqual(candidate["requirements"], [])
            self.assertEqual(candidate["narration"], evidence["narration"])
            self.assertTrue(result["candidate_only"])
            self.assertFalse(result["visual_inspection_performed"])
            self.assertEqual(result["model"], "bounded-confirmed-photo-suggestion")

        # Qualified or negative responses stay genuinely conversational.
        class Response:
            ok = True
            def json(self):
                return {"id": "normal-model", "output_text": json.dumps(PROPOSAL)}
        seen = []
        def model(settings, data, **options):
            seen.append(data)
            return Response()
        propose_revision(evidence, "Yes, but use a different image for the opener",
                         {}, transport=model)
        self.assertEqual(len(seen), 1)

    def test_8447_other_creative_requests_keep_model_conversation(self):
        evidence = {**EVIDENCE, "output_id": "rec0uVrVeiUM6shp9"}
        result, calls = self.invoke(evidence=evidence)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["model_response_id"], "model-fixture")

    def test_two_night_stills_never_invents_a_source_if_daypart_not_verified(self):
        evidence={**EVIDENCE,"narration":"Morning river",
            "assets":[{"id":"night-one","time_of_day":"Night","metadata_verified":True},
                      {"id":"day-two","time_of_day":"Morning","metadata_verified":False},
                      {"id":"night-three","time_of_day":"Night","metadata_verified":True}],
            "original_timeline":[{"start_seconds":0,"end_seconds":3,"asset_id":"night-one"},
                                 {"start_seconds":3,"end_seconds":6,"asset_id":"day-two"},
                                 {"start_seconds":6,"end_seconds":9,"asset_id":"night-three"}]}
        result, _ = self.invoke(evidence=evidence)
        self.assertEqual(result["candidate"]["narration"],PROPOSAL["narration"])

    def test_missing_assets_and_fabricated_sources_rejected(self):
        for key, value in (("reuse_asset_ids", ["invented"]), ("claims", [{"claim": "Invented route", "source_ids": ["invented-source"]}])):
            p = copy.deepcopy(PROPOSAL)
            p[key] = value
            with self.assertRaises(ValueError):
                validate_candidate(p, EVIDENCE)
            result, _ = self.invoke(p)
            self.assertTrue(result["candidate_only"])
            self.assertEqual(result["candidate"]["timeline"], [] if value == ["invented"] else PROPOSAL["timeline"])
            self.assertEqual(result["candidate"]["claims"][0]["source_ids"], [])

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
        result, _ = self.invoke(p)
        self.assertEqual(result["candidate"]["timeline"], [])
        self.assertTrue(result["candidate"]["requirements"])

    def test_timeline_gap_is_rejected_before_unrenderable_plan_reaches_studio(self):
        p = copy.deepcopy(PROPOSAL)
        p["timeline"].append({
            "start_seconds": 16, "end_seconds": 20,
            "direction": "Second owned image", "asset_ids": ["asset-1"],
        })
        result, _ = self.invoke(p)
        self.assertEqual(result["candidate"]["timeline"], [])
        self.assertTrue(result["candidate"]["requirements"])

    def test_multiple_assets_in_one_scene_are_rejected_before_render(self):
        p = copy.deepcopy(PROPOSAL)
        p["timeline"][0]["asset_ids"] = ["asset-1", "asset-1"]
        result, _ = self.invoke(p)
        self.assertEqual(result["candidate"]["timeline"], [])
        self.assertTrue(result["candidate"]["requirements"])

    def test_contiguous_owned_image_scenes_stay_executable(self):
        p = copy.deepcopy(PROPOSAL)
        p["preserve"] = []
        p["timeline"].append({
            "start_seconds": 15, "end_seconds": 20,
            "direction": "Finish with the same owned image", "asset_ids": ["asset-1"],
        })
        result, _ = self.invoke(p)
        self.assertEqual(len(result["candidate"]["timeline"]), 2)

    def test_real_riverwalk_still_replacement_is_a_conversation_not_an_unauthorized_render(self):
        user_direction = ("There is a still embedded of nighttime view of the river. "
                          "Please replace that with a daytime view or even better "
                          "a sunrise view if we have one.")
        model_proposal = copy.deepcopy(PROPOSAL)
        model_proposal["explanation"] = (
            "I can replace the nighttime still, prioritizing sunrise if an owned image "
            "can be verified. The source filenames do not establish lighting.")
        model_proposal["changes"] = ["Replace the nighttime river still with a verified daytime or sunrise view"]
        model_proposal["timeline"] = [
            {"start_seconds": 0, "end_seconds": 8, "direction": "Existing opener",
             "asset_ids": ["asset-1"]},
            {"start_seconds": 8, "end_seconds": 15, "direction": "Desired sunrise still",
             "asset_ids": ["not-owned-sunrise-photo"]},
        ]
        result = propose_revision(
            {**EVIDENCE, "narration": "Preserve original spoken narration."},
            user_direction, {}, transport=lambda *args, **kwargs:
            type("Response", (), {"ok": True, "json": lambda _:
            {"output_text": json.dumps(model_proposal)}})())
        candidate = result["candidate"]
        self.assertTrue(result["candidate_only"])
        self.assertFalse(result["visual_inspection_performed"])
        self.assertEqual(candidate["timeline"], [])
        self.assertNotIn("not-owned-sunrise-photo", candidate["reuse_asset_ids"])
        self.assertTrue(any(x["kind"] == "asset" for x in candidate["requirements"]))
        self.assertIn("sunrise", candidate["explanation"])

    def test_missing_timeline_may_be_discussed_without_inventing_asset(self):
        candidate = copy.deepcopy(PROPOSAL)
        candidate["timeline"] = []
        candidate["requirements"] = [{"kind": "asset",
            "description": "Locate a verified daytime still", "alternatives": ["Upload one"]}]
        result, _ = self.invoke(candidate)
        self.assertEqual(result["candidate"]["timeline"], [])
        self.assertTrue(result["requires_fact_validation"])

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

if __name__ == '__main__': unittest.main()
