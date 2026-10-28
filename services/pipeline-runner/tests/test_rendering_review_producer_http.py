import json
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.http import create_rendering_review_producer_blueprint
from rendering_review.producer import ProducerModelHTTPError

OUTPUT = "recA1B2C3D4E5F6G7"
SESSION = "rrsession_0123456789abcdef"
REQUEST = {"output_id": OUTPUT, "session_id": SESSION,
           "expected_version": 2,
           "direction": "Explain how to choose a train and keep the opening clip."}
PROPOSAL = {"candidate_only": True, "requires_fact_validation": True,
            "visual_inspection_performed": False,
            "candidate_hash": "example-fixture",
            "candidate": {"narration": "A revised instructional narration."}}


class ProposalRouteTests(unittest.TestCase):
    def fixture(self, *, secret="test-runner-secret-123", fail_evidence=None,
                fail_model=None, result=PROPOSAL, drift_after_model=False, lost_hold_after_model=False):
        calls = {"evidence": 0, "model": 0, "client": 0}
        def factory():
            calls["client"] += 1
            return object()
        def evidence(_client, output, session, version):
            calls["evidence"] += 1
            self.assertEqual((output, session, version), (OUTPUT, SESSION, 2))
            if fail_evidence:
                raise fail_evidence
            if calls["model"] and lost_hold_after_model:
                raise ValueError("session hold lost")
            return {"profile_id": "recT2rbKX3MF7cVFU",
                    "output_type": "Instagram Reel", "version": 2,
                    "content_revision": "changed" if calls["model"] and drift_after_model else "original"}
        def producer(content, direction, settings):
            calls["model"] += 1
            self.assertEqual(content["version"], 2)
            self.assertEqual(direction, REQUEST["direction"])
            self.assertEqual(settings["pipeline_runner_shared_secret"], secret)
            if fail_model:
                raise fail_model
            return result
        app = Flask("review_proposal_test")
        app.register_blueprint(create_rendering_review_producer_blueprint(
            {"pipeline_runner_shared_secret": secret}, client_factory=factory,
            evidence_loader=evidence, producer=producer,
        ))
        return app.test_client(), calls

    def send(self, client, data=REQUEST, secret="test-runner-secret-123"):
        return client.post("/jobs/rendering-review/propose",
                           data=json.dumps(data),
                           content_type="application/json",
                           headers={"X-Pipeline-Secret": secret})

    def test_default_off_without_any_client_model_or_airtable_side_effect(self):
        client, calls = self.fixture()
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": ""}):
            response = self.send(client)
        self.assertEqual(response.status_code, 405)
        self.assertEqual(calls, {"evidence": 0, "model": 0, "client": 0})

    def test_requires_configured_server_secret_and_matching_token(self):
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            client, calls = self.fixture(secret="")
            self.assertEqual(self.send(client).status_code, 503)
            client, calls = self.fixture()
            self.assertEqual(self.send(client, secret="wrong").status_code, 401)
            self.assertEqual(calls["client"], 0)

    def test_valid_request_reads_authoritative_evidence_once_and_calls_model_once(self):
        client, calls = self.fixture()
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            result = self.send(client)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json["proposal"], PROPOSAL)
        self.assertEqual(result.json["authorization"], "none")
        self.assertFalse(result.json["render_queued"])
        self.assertFalse(result.json["publication_changed"])
        self.assertEqual(result.headers["Cache-Control"], "no-store")
        self.assertEqual(calls, {"evidence": 2, "model": 1, "client": 2})

    def test_stale_model_candidate_discarded_if_evidence_changed_during_reasoning(self):
        client, calls = self.fixture(drift_after_model=True)
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            result = self.send(client)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(result.json["error"], "review_changed_during_proposal")
        self.assertEqual(calls, {"evidence": 2, "model": 1, "client": 2})

    def test_model_candidate_discarded_if_review_hold_lost_during_reasoning(self):
        client, calls = self.fixture(lost_hold_after_model=True)
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            result = self.send(client)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(result.json["error"], "review_changed_during_proposal")
        self.assertEqual(calls, {"evidence": 2, "model": 1, "client": 2})

    def test_input_allowlist_prevents_caller_supplied_approval_context_or_evidence(self):
        client, calls = self.fixture()
        bad = [
            {**REQUEST, "evidence": {"assets": ["fabricated"]}},
            {**REQUEST, "publish": True},
            {**REQUEST, "role": "producer"},
            {**REQUEST, "commit_plan": True},
            {**REQUEST, "expected_version": True},
            {**REQUEST, "expected_version": "2"},
            {**REQUEST, "direction": "x" * 3001},
            {**REQUEST, "output_id": "not-an-airtable-record"},
            {**REQUEST, "session_id": ""},
            {**REQUEST, "direction": ""},
            [REQUEST],
            {},
        ]
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            for item in bad:
                with self.subTest(item=item):
                    self.assertEqual(self.send(client, item).status_code, 400)
        self.assertEqual(calls["model"], 0)
        self.assertEqual(calls["evidence"], 0)

    def test_stale_evidence_is_denied_without_model_or_producer_mutation(self):
        client, calls = self.fixture(fail_evidence=ValueError("stale"))
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            result = self.send(client)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(result.json["error"], "stale_or_unavailable_review_evidence")
        self.assertEqual(calls["model"], 0)

    def test_transient_source_and_model_failure_does_not_claim_success(self):
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            client, calls = self.fixture(fail_evidence=RuntimeError("Airtable unavailable"))
            self.assertEqual(self.send(client).status_code, 503)
            self.assertEqual(calls["model"], 0)
            client, calls = self.fixture(fail_model=RuntimeError("model unavailable"))
            self.assertEqual(self.send(client).status_code, 502)
            client, calls = self.fixture(result={"candidate_only": True,
                "requires_fact_validation": False,
                "visual_inspection_performed": False})
            self.assertEqual(self.send(client).status_code, 502)



    def test_safe_provider_http_code_does_not_expose_provider_response_body(self):
        client, _ = self.fixture(fail_model=ProducerModelHTTPError(400, "unsupported_parameter", "text.format"))
        with patch.dict("os.environ", {"RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED": "true"}):
            result = self.send(client)
        self.assertEqual(result.status_code, 502)
        self.assertEqual(result.json["error"], "producer_model_http_400")
        self.assertEqual(result.json["provider_error_code"], "unsupported_parameter")
        self.assertEqual(result.json["provider_error_param"], "text.format")
        self.assertFalse(result.json["ok"])

if __name__ == "__main__":
    unittest.main()
