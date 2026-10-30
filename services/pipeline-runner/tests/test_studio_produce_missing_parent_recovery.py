"""Regression tests for missing production parent and stale queued Remotion job."""

from studio_produce.context import load_outputs, load_parent
from studio_produce.steps import waiting_on_existing_render_job


class FakeClient:
    def __init__(self):
        self.by_id = {
            "recParent": {
                "id": "recParent",
                "fields": {
                    "Content_ID": 1857,
                    "Platform Outputs": ["recInstagram"],
                },
            },
            "recInstagram": {
                "id": "recInstagram",
                "fields": {
                    "Output_ID": 9370,
                    "Remotion_Job_ID": "job-existing",
                    "Remotion_Status_URL": "https://render.example/status/job-existing",
                    "Render_Status": "Waiting in Render Queue",
                },
            },
        }

    def get_record(self, table, record_id):
        return self.by_id[record_id]

    def list_records(self, *args, **kwargs):
        raise AssertionError("Must use the exact parent-linked output instead of a broad formula query")


def test_missing_promoted_parent_falls_back_to_single_inverse_link():
    request = {
        "id": "recRequest",
        "fields": {"Content Items": ["recParent"]},
    }
    client = FakeClient()
    parent = load_parent(client, request)
    assert parent["id"] == "recParent"
    outputs = load_outputs(client, "recRequest", parent)
    assert [row["id"] for row in outputs] == ["recInstagram"]


def test_missing_promoted_parent_does_not_guess_when_multiple_content_items_linked():
    request = {
        "id": "recRequest",
        "fields": {"Content Items": ["recParent", "recOtherParent"]},
    }
    assert load_parent(FakeClient(), request) is None


def test_canonical_promoted_parent_takes_precedence_over_inverse_link():
    request = {
        "id": "recRequest",
        "fields": {
            "Promoted_Content_Item": ["recParent"],
            "Content Items": ["recOtherParent"],
        },
    }
    assert load_parent(FakeClient(), request)["id"] == "recParent"


def test_waiting_queue_with_remotion_job_requires_existing_job_reconciliation():
    queued = {
        "fields": {
            "Render_Status": "Waiting in Render Queue",
            "Remotion_Job_ID": "job-existing",
            "Remotion_Status_URL": "https://render.example/status/job-existing",
        }
    }
    assert waiting_on_existing_render_job(queued)
    assert not waiting_on_existing_render_job(
        {"fields": {**queued["fields"], "Remotion_Job_ID": ""}}
    )
    assert not waiting_on_existing_render_job(
        {"fields": {**queued["fields"], "Remotion_Status_URL": ""}}
    )
    assert not waiting_on_existing_render_job(
        {"fields": {**queued["fields"], "Render_Status": "Ready for Render"}}
    )
