"""Exact Zoo Factory continuation, using existing Runner service credential."""
import json
import os
import re
from pathlib import Path
import sys
import requests
from dotenv import load_dotenv

BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"
PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
URL=os.environ.get("ZOO_FACTORY_BRIDGE_URL","")
EXACT_ROUTE="/api/internal/factory/zoo3093-resume"
GROUP="e3aff4f8-a9c4-4333-876d-e0523144f293"
ACTOR="recaKAksAFrEv21RO"

def require(ok,reason):
    if not ok:raise RuntimeError(reason)

def main():
    require(re.fullmatch(r"https://studio-zoo-factory-[0-9]+-[0-9]+\.[a-z0-9-]+\.workers\.dev/[A-Za-z0-9_-]{43}",URL),"bridge_url_scope")
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    secret=os.environ["PIPELINE_RUNNER_SHARED_SECRET"]
    require(len(secret)>=24,"service_secret_missing")
    sb={"apikey":key,"Authorization":"Bearer "+key}
    def read():
        r=requests.get(PROJECT+"/rest/v1/platform_outputs",headers=sb,params={"content_number":"eq.2340","select":"output_number,review_status,output_status,render_status,do_not_publish,auto_publish_enabled,scheduled_post_date,studio_scheduled_at,published_at,platform_post_url,error_messages","order":"output_number.asc","limit":7},timeout=20)
        r.raise_for_status(); rows=r.json()
        require([row["output_number"] for row in rows]==list(range(11366,11372)),"scope")
        approved=[]
        for row in rows:
            require(row["render_status"]=="Rendered" and row["do_not_publish"] is False and not row["published_at"] and not row["platform_post_url"],"canonical_fence")
            if row["review_status"]=="Approved":
                receipt=(row.get("error_messages") or {}).get("SM_Factory_Supabase_Approval_Receipt")
                if isinstance(receipt,str):receipt=json.loads(receipt)
                require(receipt and receipt["request_id"]==GROUP and receipt["approval_actor_record_id"]==ACTOR and receipt["actor_provenance"]=="authenticated_factory_submission" and receipt["published"] is False and row["auto_publish_enabled"] is True and row["scheduled_post_date"] and row["studio_scheduled_at"],"receipt_mismatch")
                approved.append(row["output_number"])
            else:
                require(row["review_status"]=="Review Sent" and row["output_status"]=="Ready for Review" and row["auto_publish_enabled"] is False and not row["scheduled_post_date"] and not row["studio_scheduled_at"],"pending_drift")
        return approved
    approved=read()
    require(11368 in approved,"original_anchor_missing")
    if len(approved)<6:
        response=requests.post(URL,headers={"X-Pipeline-Secret":secret,"Accept":"application/json"},data=b"",timeout=150,allow_redirects=False)
        print("ZOO_FACTORY_HTTP="+str(response.status_code),flush=True)
        if response.status_code!=200:
            try:
                detail=response.json().get("error")
                if isinstance(detail,str) and re.fullmatch(r"[A-Za-z _]{1,100}",detail):print("ZOO_FACTORY_ERROR="+detail,flush=True)
            except ValueError:pass
        require(response.status_code==200,"resume_not_confirmed")
        data=response.json()
        require(data.get("ok") is True and data.get("request_id")==GROUP and data.get("publication_authorized") is False,"response_scope")
    approved=read()
    print("ZOO_FACTORY_RESULT="+json.dumps({"approved":approved,"request_id":GROUP,"publication_authorized":False,"complete":len(approved)==6}),flush=True)
    require(len(approved)==6,"original_batch_not_complete")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("ZOO_FACTORY_ERROR="+(str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__),flush=True)
        sys.exit(1)
