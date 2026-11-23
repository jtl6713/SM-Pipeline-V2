from rendering_review.one_job import ATTEMPTS, JOBS, PLANS, SESSIONS
import supabase_pipeline
import supabase_reads


SETTINGS = {"supabase_url": "https://example.supabase.co", "supabase_service_role_key": "secret"}


def test_review_tables_are_supabase_only_and_airtable_shaped(monkeypatch):
    seen = []

    def rest(settings, path, method, *args, **kwargs):
        seen.append((path, method))
        return [{
            "airtable_record_id": "rec12345678901234",
            "fields": {"Job_ID": "rrjob_exact123456", "Job_State": "queued"},
            "created_at": "2026-11-23T00:00:00+00:00",
        }]

    monkeypatch.setattr(supabase_reads, "_rest", rest)
    for table_id in (SESSIONS, JOBS, ATTEMPTS, PLANS):
        assert table_id in supabase_reads.FALLBACK_STOPPED_TABLES
        assert supabase_reads.runner_table_read_source(SETTINGS, table_id) == "supabase"
        row = supabase_reads.try_get_supabase_record(SETTINGS, table_id, "rec12345678901234")
        assert row["id"] == "rec12345678901234"
        assert row["fields"]["Job_State"] == "queued"
        assert row["createdTime"] == "2026-11-23T00:00:00+00:00"
    assert all("rendering_review_" in path for path, _ in seen)


def test_partial_review_update_merges_existing_fields(monkeypatch):
    calls = []

    def rest(settings, path, method, body=None, *, prefer=None):
        calls.append((path, method, body, prefer))
        if method == "GET":
            return [{"fields": {"Job_ID": "rrjob_exact123456", "Retry_Count": 0}}]
        return []

    monkeypatch.setattr(supabase_pipeline, "_rest", rest)
    result = supabase_pipeline.mirror_airtable_records(
        SETTINGS, JOBS,
        [{"id": "rec12345678901234", "fields": {"Retry_Count": 1}}],
        partial=True,
    )
    assert result == {"ok": True, "kind": "review_records", "count": 1}
    post = next(call for call in calls if call[1] == "POST")
    assert post[2][0]["fields"] == {"Job_ID": "rrjob_exact123456", "Retry_Count": 1}
    assert post[3] == "resolution=merge-duplicates,return=minimal"
