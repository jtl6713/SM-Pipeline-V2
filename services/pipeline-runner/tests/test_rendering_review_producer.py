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

    def test_all_creative_requests_use_model_even_for_existing_8447(self):
        # The old exception used to match the output number, frames 1 and 5,
        # and exact "both nighttime" phrases instead of consulting the model.
        owned = [{"id": "night-1", "name": "Night opener"},
                 {"id": "morning", "name": "Riverwalk morning"},
                 {"id": "night-5", "name": "Night river"}]
        original = [
            {"asset_id": "night-1", "start_seconds": 0, "end_seconds": 4},
            {"asset_id": "morning", "start_seconds": 4, "end_seconds": 8},
            {"asset_id": "night-5", "start_seconds": 8, "end_seconds": 12}]
        evidence = {**EVIDENCE, "output_id": "rec0uVrVeiUM6shp9",
                    "session_version": 4, "assets": owned,
                    "original_timeline": original,
                    "narration": "Early light on the river."}
        candidate = copy.deepcopy(PROPOSAL)
        candidate["narration"] = evidence["narration"]
        candidate["preserve"] = []
        candidate["requirements"] = []
        candidate["claims"] = []
        candidate["reuse_asset_ids"] = ["morning"]
        candidate["changes"] = ["Replace both night views"]
        candidate["timeline"] = [
            {"start_seconds": row["start_seconds"], "end_seconds": row["end_seconds"],
             "direction": "Use a daytime image", "asset_ids": ["morning"]}
            for row in original]
        observed = []
        class Response:
            ok = True
            def json(self):
                return {"id": "general-model", "model": "fixture",
                        "output_text": json.dumps(candidate)}
        def model(settings, payload, **options):
            observed.append(payload)
            return Response()
        for direction in ("Replace both nighttime shots with daytime photos",
                          "That first still is too dark. Fix the whole morning story.",
                          "Yes, those replacements look good. Rerender please."):
            result = propose_revision(evidence, direction, {}, transport=model)
            self.assertEqual(result["model"], "fixture")
            self.assertEqual(result["model_response_id"], "general-model")
            self.assertEqual(len(result["candidate"]["timeline"]), 3)
            self.assertEqual(result["candidate"]["narration"], evidence["narration"])
            self.assertFalse(result["visual_inspection_performed"])
            self.assertTrue(result["candidate_only"])
        self.assertEqual(len(observed), 3)
        self.assertIn("entire cut", observed[0]["instructions"])
        self.assertIn("prior messages", observed[0]["instructions"])
        for payload, direction in zip(observed, (
                "Replace both nighttime shots with daytime photos",
                "That first still is too dark. Fix the whole morning story.",
                "Yes, those replacements look good. Rerender please.")):
            self.assertIn(direction, payload["input"])
            self.assertNotIn("authorization", payload["input"].split("creative_direction")[-1].lower())

    def test_approved_end_tail_preserves_original_scenes(self):
        evidence={**EVIDENCE, "narration":"Approved narration",
                  "assets":[{"id":"a"},{"id":"b"}],
                  "original_timeline":[
                      {"start_seconds":0,"end_seconds":6,"asset_id":"a"},
                      {"start_seconds":6,"end_seconds":12,"asset_id":"b"}],
                  "messages":[{"role":"user","content":"More space after the voiceover at the end"},
                              {"role":"user","content":"Please proceed with the new render"}]}
        candidate=copy.deepcopy(PROPOSAL)
        candidate["explanation"]="Hold the final clip about 2.5 seconds after narration; also change imagery"
        candidate["changes"]=["2.5 seconds of silent tail", "Unrequested image crop"]
        candidate["requirements"]=[{"kind":"clarification","description":"Crop an image","alternatives":[]}]
        class Response:
            ok=True
            def json(self):
                return {"output_text":json.dumps(candidate)}
        result=propose_revision(evidence,"Please proceed with the new render",{},
            transport=lambda *a,**k:Response())["candidate"]
        self.assertEqual(result["narration"],evidence["narration"])
        self.assertEqual([x["asset_ids"] for x in result["timeline"]],[["a"],["b"]])
        self.assertEqual(result["timeline"][-1]["end_seconds"],14.5)
        self.assertEqual(result["requirements"],[])
        self.assertEqual(result["claims"],[])

    def test_timing_only_direction_preserves_source_and_does_not_create_new_research(self):
        evidence = {**EVIDENCE, "output_id": "recVFaT3VnhCD3dcb",
                    "narration": "The river multiplies the glow.",
                    "original_timeline": [
                        {"start_seconds": 0, "end_seconds": 8, "asset_id": "asset-1"}
                    ],
                    "messages": [
                        {"role": "user", "content": "Leave more video after the voiceover ends."},
                        {"role": "user", "content": "Please proceed with the revised render."}
                    ]}
        requested = []
        class Response:
            ok = True
            def json(self):
                model = copy.deepcopy(PROPOSAL)
                model.update(narration=evidence["narration"], preserve=[],
                             requirements=[], claims=[],
                             changes=["Extend the final existing shot after the voiceover"],
                             timeline=[{"start_seconds": 0, "end_seconds": 10.5,
                                        "direction": "Hold the same owned asset",
                                        "asset_ids": ["asset-1"]}])
                return {"id": "min-edit", "model": "fixture",
                        "output_text": json.dumps(model)}
        def model(settings, body, **opts):
            requested.append(body)
            return Response()
        result = propose_revision(evidence, "Please proceed with the revised render",
                                  {}, transport=model)
        self.assertEqual(len(requested), 1)
        instructions = requested[0]["instructions"]
        self.assertIn("timing-only request", instructions)
        self.assertIn("original_timeline", instructions)
        self.assertIn("claims=[]", instructions)
        self.assertIn("previous user direction", instructions)
        self.assertEqual(result["candidate"]["narration"], evidence["narration"])
        self.assertEqual(result["candidate"]["requirements"], [])
        self.assertEqual(result["candidate"]["claims"], [])
        self.assertEqual(result["candidate"]["timeline"][-1]["end_seconds"], 10.5)

    def test_general_edit_intents_are_not_rewritten_to_photo_replacement(self):
        intents = [
            "Trim the introduction and increase the pace.",
            "The narration is too formal; make it warmer and more concise.",
            "Move the strongest visual to the opening and remove repetition.",
            "The subtitles cover the subject; improve readability.",
            "The story feels disconnected; improve transitions and flow.",
        ]
        for direction in intents:
            sent = []
            class Response:
                ok = True
                def json(self):
                    return {"id": "general-model", "model": "fixture",
                            "output_text": json.dumps(PROPOSAL)}
            def model(settings, body, **opts):
                sent.append(body["input"])
                return Response()
            result = propose_revision(EVIDENCE, direction, {}, transport=model)
            self.assertEqual(len(sent), 1)
            self.assertIn(direction, sent[0])
            self.assertEqual(result["candidate"]["changes"], PROPOSAL["changes"])
            self.assertEqual(result["model"], "fixture")
            self.assertFalse(result["render_queued"] if "render_queued" in result else False)

    def test_incomplete_visual_plan_still_gives_helpful_nonexecuting_reply(self):
        draft = copy.deepcopy(PROPOSAL)
        draft["explanation"] = "The opening needs a stronger sense of place; the owned library has no matching detail still."
        draft["timeline"] = []
        draft["requirements"] = [{"kind": "asset",
            "description": "Confirm an existing compatible detail still",
            "alternatives": ["Search owned inventory"]}]
        class Response:
            ok = True
            def json(self):
                return {"id": "fixture", "output_text": json.dumps(draft)}
        result = propose_revision(EVIDENCE, "Make the first shot more cinematic",
                                  {}, transport=lambda *a, **k: Response())
        self.assertEqual(result["candidate"]["timeline"], [])
        self.assertIn("stronger sense of place", result["candidate"]["explanation"])
        self.assertTrue(result["candidate_only"])
        self.assertFalse(result["visual_inspection_performed"])

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


    def test_global_verified_profile_can_receive_candidate_without_render_authority(self):
        profile = "recNYC12345678901"
        evidence = {**EVIDENCE, "profile_id": profile, "platform": "TikTok",
                    "output_type": "TikTok Video", "output_id": "recA1B2C3D4E5F6G7",
                    "scope_verified": True}
        result, calls = self.invoke(evidence=evidence)
        self.assertTrue(result["candidate_only"])
        self.assertFalse(result["visual_inspection_performed"])
        self.assertEqual(len(calls), 1)
        evidence["scope_verified"] = False
        with self.assertRaisesRegex(ValueError, "authoritative"):
            self.invoke(evidence=evidence)

if __name__ == '__main__': unittest.main()
