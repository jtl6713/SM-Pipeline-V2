"""All six Rendering Review record tables read/write from Supabase only."""
import supabase_reads
import supabase_pipeline
from supabase_formula import formula_to_postgrest_filter

TABLES = {
    "tblHX3UdoNszkoquG": "rendering_review_sessions",
    "tblUkZB6SMtf9Ib6I": "rendering_review_jobs",
    "tbl7wPOAE26o2coMU": "rendering_review_attempts",
    "tblalFXUJyYg5PBrz": "rendering_review_plans",
    "tbl8tuxw838DQiGKo": "rendering_review_messages",
    "tblbnKA0Cb2Mnlg5r": "rendering_review_requirements",
}
SETTINGS={"supabase_url":"https://example.supabase.co","supabase_service_role_key":"test"}

def test_exact_review_ledger_mappings_and_no_archive_fallback(monkeypatch):
    seen=[]
    def rest(settings,path,method,*a,**kw):
        seen.append(path)
        return []
    monkeypatch.setattr(supabase_reads,"_rest",rest)
    for ledger,table in TABLES.items():
        assert ledger in supabase_reads.FALLBACK_STOPPED_TABLES
        assert supabase_reads.runner_table_read_source(SETTINGS,ledger)=="supabase"
        assert supabase_reads._supabase_table(ledger)==table
        assert supabase_pipeline.side_table_kind(ledger)=="review_records"
        assert "fields->>Output_Record_ID.eq.rec12345678901234" in formula_to_postgrest_filter(
            ledger,'{Output_Record_ID}="rec12345678901234"'
        )
        assert supabase_reads.try_list_supabase_records(
            SETTINGS,ledger,formula='{Output_Record_ID}="rec12345678901234"',max_records=10
        )==[]
    assert len(seen)==len(TABLES)
    assert all("rendering_review_" in path for path in seen)
