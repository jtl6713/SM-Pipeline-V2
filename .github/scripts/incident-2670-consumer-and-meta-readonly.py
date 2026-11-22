"""Incident 2670: read-only host/provider/consumer preflight, no mutations.

This runs only on the authorized Windows runner via the protected Ops shell.
Never log secrets, provider payloads, identifiers beyond known output numbers.
"""
from __future__ import annotations
import os
import sqlite3
import sys
from pathlib import Path
from urllib.parse import quote
import requests
from dotenv import load_dotenv

ROOT=Path(r"D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner")
load_dotenv(ROOT / "service" / ".env",override=True)
sys.path.insert(0,str(ROOT))
from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from item4.settings import PipelineSettings
from apc.graph import load_instagram_settings
from fbs3.graph import load_facebook_reel_settings
from supabase_reads import _supabase_table
from rendering_review.one_job import JOBS as REVIEW_JOBS
from rendering_review.native_gallery_claim_client import JOBS as NATIVE_JOBS

def on(key):
    return os.getenv(key,"").strip().lower() in ("1","true","yes")
def mark(key,value):
    print(f"recovery_preflight_{key}={value}",flush=True)
def meta_probe(kind,output_num,record_id,client,settings):
    try:
        output=client.get_record(PLATFORM_OUTPUTS_TABLE,record_id)
        fields=output.get("fields") or {}
        if int(fields.get("Output_ID") or 0)!=output_num:
            mark(f"meta_{kind}_{output_num}","OUTPUT_IDENTITY_MISMATCH")
            return
        if kind=="ig":
            config=load_instagram_settings(settings,output,client=client)
            entity=config["ig_user_id"]
        else:
            config=load_facebook_reel_settings(settings,output,client=client)
            entity=config["page_id"]
        token=config["token"]
        version=config["version"].strip("/")
        if not token or not entity or not version:
            mark(f"meta_{kind}_{output_num}","MISSING_DESTINATION_OR_TOKEN")
            return
        response=requests.get(
            f"https://graph.facebook.com/{quote(version,safe='')}/{quote(str(entity),safe='')}",
            headers={"Authorization":f"Bearer {token}"},
            params={"fields":"id"},timeout=18,
            allow_redirects=False,
        )
        payload=response.json() if response.status_code==200 else {}
        verified=(response.status_code==200 and isinstance(payload,dict) and
                  str(payload.get("id"))==str(entity))
        mark(f"meta_{kind}_{output_num}","PASS" if verified else f"HTTP_{response.status_code}")
    except Exception as exc:
        mark(f"meta_{kind}_{output_num}",f"CHECK_FAILED_{type(exc).__name__}")

def i1_spool_probe():
    location=os.environ.get("I1_JOB_DB_PATH","").strip()
    if not location or not Path(location).is_absolute():
        mark("i1_spool","ABSOLUTE_PATH_MISSING")
        return
    file=Path(location)
    if not file.parent.exists():
        mark("i1_spool","PERSISTENT_DIR_NOT_PROVISIONED")
        return
    if not file.exists():
        mark("i1_spool","PERSISTENT_DIR_READY_DATABASE_NOT_INITIALIZED")
        return
    try:
        conn=sqlite3.connect(file.as_uri()+"?mode=ro",uri=True,timeout=4)
        try:
            exists=conn.execute("select count(*) from sqlite_master where type='table' and name='jobs'").fetchone()[0]
            if not exists:
                mark("i1_spool","DATABASE_WITHOUT_JOBS_TABLE")
                return
            rows=conn.execute("select status,count(*) from jobs group by status").fetchall()
            for state,n in rows:
                if state in ("queued","running","failed","complete","paused"):
                    mark(f"i1_jobs_{state}",int(n))
            mark("i1_spool","SQLITE_READ_ONLY_PASS")
        finally:
            conn.close()
    except Exception as exc:
        mark("i1_spool",f"SQLITE_READ_FAILED_{type(exc).__name__}")

mark("runner_read_only",str(on("PIPELINE_RUNNER_RECOVERY_READ_ONLY")).lower())
mark("governor_enabled",str(on("STUDIO_WORKLOAD_GOVERNOR_ENABLED")).lower())
for key in ["NATIVE_GALLERY_AUTO_EXECUTE_ENABLED",
            "RENDERING_REVIEW_AUTO_DISPATCH_ENABLED","I1_DURABLE_ENABLED"]:
    mark(key.lower(),str(on(key)).lower())
mark("native_job_supabase_mapping","PRESENT" if _supabase_table(NATIVE_JOBS) else "ABSENT")
mark("render_review_job_supabase_mapping","PRESENT" if _supabase_table(REVIEW_JOBS) else "ABSENT")
i1_spool_probe()

try:
    client=AirtableClient()
    settings=PipelineSettings(client)
    meta_probe("ig",10631,"recfCbk0l9nAJglhc",client,settings)
    meta_probe("fb",8803,"recUXyrC57QnKp5F6",client,settings)
    meta_probe("fb",9777,"recmd8mSZlqbRBh8K",client,settings)
    meta_probe("fb",4589,"recItASdGZcNN1pSY",client,settings)
except Exception as exc:
    mark("settings",f"LOAD_FAILED_{type(exc).__name__}")
mark("audit_completed","PASS_NO_MUTATIONS")
