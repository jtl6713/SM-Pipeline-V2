"""Supabase-only pipeline CRUD: never acknowledge uncommitted mutations."""

import pytest

from airtable.client import AirtableClient
from airtable.constants import (
    CONTENT_ITEMS_TABLE, MEDIA_ASSETS_TABLE, MEDIA_TRANSFER_QUEUE_TABLE,
    PIPELINE_SETTINGS_TABLE, PLATFORM_OUTPUTS_TABLE, PRODUCTION_REQUESTS_TABLE,
    SOURCE_CANDIDATES_TABLE,
)


@pytest.fixture
def client():
    return AirtableClient({
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "test-only-key",
        "studio_write_source": "supabase",
        "studio_phase6_write_source": "supabase",
    })


@pytest.mark.parametrize("receipt,accepted", [
    ({"ok": True, "count": 1}, True),
    ({"ok": True, "count": 0}, False),
    ({"ok": False, "count": 1}, False),
    ({"count": 1}, False),
    (None, False),
])
def test_confirmed_runner_mirror_receipt_is_returned_not_lost(
    client, monkeypatch, receipt, accepted,
):
    import supabase_pipeline

    recorded = []
    def fake_mirror(settings, table, records, *, partial=False):
        recorded.append((table, len(records), partial))
        return receipt

    monkeypatch.setattr(supabase_pipeline, "mirror_airtable_records", fake_mirror)
    request = [{"id": "rec00000000000001", "fields": {"Publish_Status": "Scheduled"}}]
    if accepted:
        result = client._mirror(PLATFORM_OUTPUTS_TABLE, request, partial=True)
        assert result == receipt
    else:
        with pytest.raises(RuntimeError, match="Supabase mutation not confirmed"):
            client._mirror(PLATFORM_OUTPUTS_TABLE, request, partial=True)
    assert recorded == [(PLATFORM_OUTPUTS_TABLE, 1, True)]


@pytest.mark.parametrize("operation", ["create", "update", "batch_update", "list"])
def test_unmapped_crud_never_simulates_success(client, operation):
    table = "UNMAPPED_TABLE"
    with pytest.raises(RuntimeError, match="Supabase"):
        if operation == "create":
            client.create_records(table, [{"Setting_Name": "x"}])
        elif operation == "update":
            client.update_record(table, "rec00000000000001", {"Active": False})
        elif operation == "batch_update":
            client.update_records(table, [{"id": "rec00000000000001", "fields": {"Active": False}}])
        else:
            client.list_records(table)


@pytest.mark.parametrize("table,dbtable,source", [
    (PIPELINE_SETTINGS_TABLE, "engagement_settings", "pipeline"),
    (MEDIA_ASSETS_TABLE, "media_assets", ""),
    (SOURCE_CANDIDATES_TABLE, "idea_candidates", ""),
])
def test_delete_requires_exactly_one_supabase_row(client, monkeypatch, table, dbtable, source):
    import supabase_pipeline

    rec = "rec00000000000001"
    seen = []

    def fake_rest(settings, path, method, body=None, *, prefer=None):
        seen.append((path, method, prefer))
        return [{"airtable_record_id": rec}]

    monkeypatch.setattr(supabase_pipeline, "_rest", fake_rest)
    assert client.delete_record(table, rec) == {"id": rec, "deleted": True}
    assert seen[0][0].startswith(dbtable + "?airtable_record_id=eq." + rec)
    if source:
        assert "&payload->>source=eq." + source in seen[0][0]
    assert seen[0][1:] == ("DELETE", "return=representation")


@pytest.mark.parametrize("reply", [[], None, [{"airtable_record_id": "recOther"}], [
    {"airtable_record_id": "rec00000000000001"},
    {"airtable_record_id": "rec00000000000001"},
]])
def test_delete_must_not_confirm_missing_or_ambiguous_rows(client, monkeypatch, reply):
    import supabase_pipeline

    monkeypatch.setattr(supabase_pipeline, "_rest", lambda *args, **kwargs: reply)
    with pytest.raises(RuntimeError, match="delete not confirmed"):
        client.delete_record(MEDIA_ASSETS_TABLE, "rec00000000000001")


def test_delete_unmapped_table_is_rejected(client):
    with pytest.raises(RuntimeError, match="No Supabase delete mapping"):
        client.delete_record("UNMAPPED_TABLE", "rec00000000000001")


def test_no_airtable_pat_needed_when_supabase_configured(client):
    assert client._archive_closed() is True
    assert not hasattr(client, "_api_root")


def test_missing_supabase_configuration_is_error():
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        AirtableClient({"airtable_pat": "retired"})


@pytest.mark.parametrize("table", [
    PLATFORM_OUTPUTS_TABLE, CONTENT_ITEMS_TABLE, PRODUCTION_REQUESTS_TABLE,
    MEDIA_ASSETS_TABLE, MEDIA_TRANSFER_QUEUE_TABLE,
])
def test_obsolete_airtable_source_flags_cannot_disable_supabase_runner(table):
    from supabase_pipeline import studio_phase6_write_source, studio_write_source
    from supabase_reads import runner_table_read_source

    settings = {
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "test-only-key",
        "studio_write_source": "airtable",
        "studio_phase6_write_source": "airtable",
        "studio_runner_output_read_source": "airtable",
        "studio_runner_content_read_source": "airtable",
    }
    assert studio_write_source(settings) == "supabase"
    assert studio_phase6_write_source(settings) == "supabase"
    assert runner_table_read_source(settings, table) == "supabase"
