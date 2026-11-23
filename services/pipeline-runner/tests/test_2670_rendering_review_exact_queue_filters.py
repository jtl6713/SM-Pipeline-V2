"""Incident 2670: never drop Rendering Review queue predicates at Supabase."""
from supabase_formula import formula_to_postgrest_filter
from supabase_reads import try_list_supabase_records
import supabase_reads


REVIEW_JOBS = "tblUkZB6SMtf9Ib6I"
SETTINGS = {"supabase_url": "https://example.supabase.co", "supabase_service_role_key": "test"}
QUEUED = (
    'AND({Job_State}="queued",{Progress_Stage}="awaiting_isolated_renderer",'
    'OR({Retry_Count}=0,{Retry_Count}=BLANK()),'
    'OR({Lease_Fence}=0,{Lease_Fence}=BLANK()),'
    '{Lease_Owner}="",{Event_History_JSON}="[]")'
)


def test_exact_workflow_formula_keeps_retry_and_lease_fences():
    result = formula_to_postgrest_filter(REVIEW_JOBS, QUEUED)
    assert result is not None
    for term in (
        "fields->>Job_State.eq.queued",
        "fields->>Progress_Stage.eq.awaiting_isolated_renderer",
        "fields->>Retry_Count.eq.0",
        "fields->>Lease_Fence.eq.0",
        "fields->>Lease_Owner",
        "fields->>Event_History_JSON.eq.[]",
    ):
        assert term in result
    assert "extras->>" not in result


def test_filtered_scan_is_applied_before_limit_and_empty_is_authoritative(monkeypatch):
    called = []

    def rest(settings, path, method, *args, **kwargs):
        called.append((path, method))
        return []

    monkeypatch.setattr(supabase_reads, "_rest", rest)
    rows = try_list_supabase_records(
        SETTINGS, REVIEW_JOBS, formula=QUEUED, max_records=10,
    )
    assert rows == []
    assert len(called) == 1
    path, method = called[0]
    assert method == "GET"
    assert "fields->>Job_State" in path and "Retry_Count" in path
    assert "Lease_Fence" in path and "limit=10" in path
    assert "extras->>" not in path


def test_unsupported_review_formula_refuses_unfiltered_scan(monkeypatch):
    monkeypatch.setattr(supabase_reads, "_rest", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no REST")))
    assert try_list_supabase_records(
        SETTINGS, REVIEW_JOBS,
        formula='SEARCH("danger",{Job_ID})>0', max_records=10,
    ) is None
