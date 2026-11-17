"""Regression: live Supabase production requests must read what the runner wrote.

The readback bug hid production_job and the typed JSONB production plan,
causing the same Chicago requests to receive new spj-* IDs indefinitely.
No network, Airtable, or Supabase access is used by these tests.
"""

import json

import pytest

from airtable.constants import PRODUCTION_REQUESTS_TABLE
from studio_produce.context import read_job, load_parent, master_assets, variant_manifest
from supabase_pipeline import _request_row
from supabase_reads import _list_select, _record_from_row


def test_production_request_readback_preserves_job_and_plan():
    row = {
        "airtable_record_id": "recProduction",
        "production_request_id": "PR-test",
        "request_status": "Promoted",
        "master_asset_status": "Ready",
        "output_plan_status": "Ready",
        "variant_status": "Ready",
        "master_assets": [{"id": "master-1", "source": "studio_ai"}],
        "output_plan": {"source_asset_count": 1},
        "variant_manifest": {"plan_complete": True},
        "production_job": {
            "job_id": "spj-original",
            "step": "audio",
            "percent": 20,
            "route": "ai:photo_sequence",
        },
        "publish_status": {"Promoted_Content_Item": ["recParent"]},
    }
    shaped = _record_from_row(row, PRODUCTION_REQUESTS_TABLE)
    assert read_job(shaped)["job_id"] == "spj-original"
    assert read_job(shaped)["step"] == "audio"
    assert len(master_assets(shaped)) == 1
    assert shaped["fields"]["Studio_Output_Plan_JSON"] == {"source_asset_count": 1}
    assert variant_manifest(shaped)["plan_complete"] is True
    assert shaped["fields"]["Studio_Master_Asset_Status"] == "Ready"
    assert shaped["fields"]["Promoted_Content_Item"] == ["recParent"]

    class FakeClient:
        def get_record(self, table_id, record_id):
            assert record_id == "recParent"
            return {"id": "recParent", "fields": {"Content_Title": "Chicago"}}

    assert load_parent(FakeClient(), shaped)["id"] == "recParent"


def test_production_request_list_select_has_all_typed_jsonb_once():
    projection = _list_select(PRODUCTION_REQUESTS_TABLE).split(",")
    for column in (
        "master_assets",
        "output_plan",
        "variant_manifest",
        "production_job",
        "master_asset_status",
        "publish_status",
    ):
        assert projection.count(column) == 1


def test_production_request_persists_partial_plan_without_clearing_job():
    fields = {
        "Studio_Master_Assets_JSON": json.dumps([{"id": "master-1"}]),
        "Studio_Output_Plan_JSON": json.dumps({"source_asset_count": 1}),
        "Studio_Variant_Manifest_JSON": {"plan_complete": True},
        "Studio_Master_Asset_Status": "Ready",
    }
    patch = _request_row({"id": "recProduction", "fields": fields})
    assert patch == {
        "master_assets": [{"id": "master-1"}],
        "output_plan": {"source_asset_count": 1},
        "variant_manifest": {"plan_complete": True},
        "master_asset_status": "Ready",
    }
    assert "production_job" not in patch


def test_bad_json_production_patch_fails_closed():
    with pytest.raises(ValueError, match="Invalid JSON"):
        _request_row({"fields": {"Studio_Master_Assets_JSON": "not-json"}})
