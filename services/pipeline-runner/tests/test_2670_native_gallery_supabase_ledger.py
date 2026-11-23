"""Native gallery C5/C6 job records never fall back to the retired archive."""
import supabase_reads
import supabase_pipeline
from supabase_formula import formula_to_postgrest_filter

TABLE = "tbl5sq9xBrF6bgPph"
SETTINGS = {"supabase_url":"https://example.supabase.co","supabase_service_role_key":"test"}

def test_c5_c6_ledger_read_authority_and_exact_job_filter(monkeypatch):
    assert TABLE in supabase_reads.FALLBACK_STOPPED_TABLES
    assert supabase_reads.runner_table_read_source(SETTINGS, TABLE) == "supabase"
    assert supabase_reads._supabase_table(TABLE) == "native_gallery_jobs"
    assert supabase_pipeline.side_table_kind(TABLE) == "review_records"
    assert "fields->>Job_ID.eq.ngjob_" in formula_to_postgrest_filter(
        TABLE, '{Job_ID}="ngjob_'+'a'*48+'"'
    )
    called=[]
    def rest(settings,path,method,*args,**kwargs):
        called.append((path,method))
        return []
    monkeypatch.setattr(supabase_reads,"_rest",rest)
    assert supabase_reads.try_list_supabase_records(
        SETTINGS,TABLE,formula='{Job_State}="held_queued"',max_records=3
    ) == []
    assert len(called)==1
    assert "native_gallery_jobs?" in called[0][0]
    assert "fields->>Job_State" in called[0][0]
    assert "limit=3" in called[0][0]
    assert "extras->>" not in called[0][0]

def test_exact_native_gallery_update_targets_supabase(monkeypatch):
    calls=[]
    def rest(settings,path,method,body=None,*,prefer=None):
        calls.append((path,method,body,prefer))
        if method=="GET":
            return [{"fields":{"Job_ID":"ngjob_"+"a"*48,"Job_State":"held_queued"}}]
        return []
    monkeypatch.setattr(supabase_pipeline,"_rest",rest)
    result=supabase_pipeline.mirror_airtable_records(
        SETTINGS,TABLE,[{"id":"rec12345678901234","fields":{"Row_Version":2}}],partial=True
    )
    assert result == {"ok":True,"kind":"review_records","count":1}
    posted=next(x for x in calls if x[1]=="POST")
    assert posted[0].startswith("native_gallery_jobs?")
    assert posted[2][0]["fields"]["Job_ID"]=="ngjob_"+"a"*48
    assert posted[2][0]["fields"]["Row_Version"]==2
