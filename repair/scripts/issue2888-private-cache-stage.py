"""Stage only the three owner-authorized #2618 review MP4s into private R2.
No database mutations, publication, approvals, public media URLs, or credential export.
Run on the existing protected Windows pipeline host, with an expiring exact-scope upload capability.
"""
from __future__ import annotations
import hashlib,json,os,sys
from pathlib import Path
import requests
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
SOURCES=[
    ("1aWyb-OkXhJ9GwWkg3VWruTaivdms6pTL","cde325819144408f3341c23287637f9ab19aed9cd62c69332d91e49dd8d04875",2194946,["recaV78on0RSfqb31","recgeicEbdlbmQiv5","recy1CzV4MJQycBMq"]),
    ("1KMygA91kqVv2InOcAQbCoy5IvQDjkfgH","a93676f4b1cfa53e22c7cf3b677ceb2136f1366acd74de7f7a80d890d0972d67",895259,["recfwDzGh6St6WB9f"]),
    ("1DlqSVCwMkzUVJ4bFLJDrvals8Bal3imj","f1e5986c31a6032334cd47a1ad6a4555085cdaa0fa3c79b614c915d1ce91af93",17892121,["rec1PDreUDoe2AcPV","rec1kjgusW1fX9BOp","recidhGcJSfOlxMsc"]),
]
class StageError(Exception): pass

def demand(ok,reason):
    if not ok: raise StageError(reason)

def preflight():
    expected={oid:(fid,sha) for fid,sha,size,ids in SOURCES for oid in ids}
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    response=requests.get(PROJECT+"/rest/v1/platform_outputs",params={
        "airtable_record_id":"in.("+",".join(expected)+")",
        "select":"airtable_record_id,output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,scheduled_post_date,studio_scheduled_at,youtube_scheduled_publish_at,published_at,platform_post_url,platform_publish_response,final_file_url,error_messages",
        "limit":"8",
    },headers={"apikey":key,"Authorization":"Bearer "+key},timeout=25)
    demand(response.status_code==200,"CANONICAL_READ_FAILED")
    rows=response.json()
    demand(len(rows)==7 and {x["airtable_record_id"] for x in rows}==set(expected),"EXACT_SEVEN_MISSING")
    for row in rows:
        fid,sha=expected[row["airtable_record_id"]]
        em=row.get("error_messages") or {}
        h=em.get("SM_2618_Factory_Review_Handoff") or {}
        p=em.get("SM_2618_Creative_Rework_Plan") or {}
        demand(row["output_status"]=="Ready for Review" and row["review_status"]=="Review Sent" and row["publish_status"]=="Not Ready"
            and row["do_not_publish"] is False and row["auto_publish_enabled"] is False
            and not any(row.get(k) for k in ("scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url","platform_publish_response"))
            and row["final_file_url"]=="https://drive.google.com/file/d/"+fid+"/view"
            and em.get("Final_File_ID")==fid and h.get("corrected_final_drive_id")==fid
            and h.get("candidate_sha256")==sha and h.get("human_factory_approval_pending") is True
            and h.get("publishing_authorized") is False and p.get("candidate_sha256")==sha
            and "SM_2618_Creative_QA_Hold" not in em,"CANONICAL_STATE_OR_SOURCE_CHANGED")

def main():
    base=Path.cwd()/"Services"/"pipeline-runner"/"service"
    demand((base/".env").is_file(),"RUNNER_ENV_MISSING")
    load_dotenv(base/".env",override=False)
    sys.path.insert(0,str(base))
    for n in ("GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"):
        demand(bool(os.getenv(n)),"RUNNER_BINDING_MISSING_"+n)
    demand(os.environ["SUPABASE_URL"].rstrip("/")==PROJECT,"WRONG_SUPABASE_PROJECT")
    health=requests.get("http://127.0.0.1:3350/health",timeout=20).json()
    demand(health.get("ok") is True and health.get("studio_write_source")=="supabase","RUNNER_AUTHORITY_CHANGED")
    endpoint=os.environ["ISSUE2888_STAGE_ENDPOINT"].rstrip("/")
    token=os.environ["ISSUE2888_STAGE_TOKEN"]
    from urllib.parse import urlparse
    u=urlparse(endpoint)
    demand(u.scheme=="https" and u.hostname.startswith("chicagoshining-2888-stage-") and u.hostname.endswith(".workers.dev") and not u.path and not u.query and len(token)>=40,"BAD_STAGE_CAPABILITY")
    preflight()
    from integrations.google_drive import GoogleDriveClient
    drive=GoogleDriveClient()
    verified=[]
    for fid,sha,size,ids in SOURCES:
        try: data,mime=drive.download_file(fid)
        except Exception: raise StageError("RUNNER_DRIVE_DOWNLOAD_FAILED") from None
        demand(len(data)==size and hashlib.sha256(data).hexdigest()==sha and data[4:8]==b"ftyp","ORIGINAL_HASH_SIZE_OR_MP4_MISMATCH")
        verified.append((fid,sha,data))
    print("ISSUE2888_ORIGINALS_VERIFIED=3",flush=True)
    preflight()
    for fid,sha,data in verified:
        resp=requests.put(endpoint+"/stage/"+fid,data=data,headers={
            "Authorization":"Bearer "+token,"Content-Type":"video/mp4",
        },timeout=(15,75),allow_redirects=False)
        demand(resp.status_code==200,"EXACT_CACHE_STAGE_HTTP_"+str(resp.status_code))
        receipt=resp.json()
        demand(receipt.get("ok") is True and receipt.get("sha256")==sha and receipt.get("bytes")==len(data),"CACHE_READBACK_UNVERIFIED")
        print("ISSUE2888_STAGE_RECEIPT="+json.dumps({"sha256":sha,"bytes":len(data),"verified":True,"existing":receipt.get("existing") is True}),flush=True)
    print("ISSUE2888_PRIVATE_CACHE_STAGE=PASS originals=3 outputs=7 database_writes=0 provider_writes=0",flush=True)

if __name__=="__main__":
    try: main()
    except StageError as exc:
        print("ISSUE2888_STAGE_BLOCKED="+str(exc),flush=True)
        sys.exit(1)
    except Exception:
        print("ISSUE2888_STAGE_BLOCKED=UNCLASSIFIED_RUNNER_ERROR",flush=True)
        sys.exit(1)
