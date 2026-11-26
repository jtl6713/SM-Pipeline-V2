"""Exact #10430 source audit. No canonical, R2, or provider writes."""
import hashlib
import io
import json
import os
import sys
from pathlib import Path
import requests
from PIL import Image, ImageOps
from dotenv import load_dotenv

PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
RID = "recehG1fslmTeJWAa"
PROFILE = "63c2e81b-0cd1-423d-a033-11366e69bdee"
SOURCES = {
    4: ("recOHHbANepDUk0rj", "1Aj0QFe-Z9MKPmoVE72PhMieI1Ca4U829", "recyAIUzGpu2lyp2r"),
    5: ("recLxkNrnUBuIfiqr", "1xaoIVYvjzAFMoqRV50Pq6-2DLYF8gK09", "recRgjdC8rv54qoeI"),
}
BASE = Path.cwd() / "Services" / "pipeline-runner" / "service"

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def get(table, params):
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    response = requests.get(PROJECT + "/rest/v1/" + table, params=params,
        headers={"apikey":key, "Authorization":"Bearer "+key}, timeout=20)
    require(response.ok, "canonical_read_failed_" + table)
    rows = response.json()
    require(isinstance(rows,list), "canonical_response_invalid")
    return rows

def probe(data):
    require(isinstance(data,bytes) and 0 < len(data) <= 16*1024*1024, "byte_budget")
    with Image.open(io.BytesIO(data)) as raw:
        fmt=raw.format
        require(raw.width * raw.height <= 25000000, "pixel_budget")
        im=ImageOps.exif_transpose(raw).convert("RGB")
        im.load()
    return {"format":fmt,"width":im.width,"height":im.height,
        "sha256":hashlib.sha256(data).hexdigest(),"pixel_sha256":hashlib.sha256(im.tobytes()).hexdigest(),
        "bytes":len(data)}

def main():
    require((BASE/".env").is_file(), "runner_env_missing")
    load_dotenv(BASE/".env", override=False)
    if not os.getenv("PORT"): os.environ["PORT"]="3350"
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    sys.path.insert(0,str(BASE))
    from integrations.google_drive import GoogleDriveClient
    from studio_produce import workload_governor as g
    require(g.enabled() and not g.recovery_read_only_active() and not g.circuit_open(), "governor_unavailable")
    health=requests.get("http://127.0.0.1:3350/health",timeout=15).json()
    require(health.get("ok") is True and health.get("studio_write_source")=="supabase"
        and health.get("studio_runner_output_read_source")=="supabase", "wrong_authority")
    rows=get("platform_outputs",{"airtable_record_id":"eq."+RID,"select":"output_number,content_profile_id,review_status,output_status,publish_status,selected_assets,render_clip_list,scheduled_post_date,published_at,platform_post_url,error_messages","limit":2})
    require(len(rows)==1,"output_missing")
    r=rows[0]; bag=r["error_messages"]
    require(r["output_number"]==10430 and r["content_profile_id"]==PROFILE
        and r["review_status"]=="Approved" and r["output_status"]=="Approved for Publishing"
        and r["publish_status"]=="Ready to Schedule" and not r["published_at"] and not r["platform_post_url"]
        and bag.get("Review_Decision_At")=="2026-11-12T05:13:42.569Z"
        and bag.get("Studio_Publish_Dispatch_At")=="2026-11-12T05:13:49.391Z","output_revision_changed")
    drive=GoogleDriveClient()
    results=[]
    for pos,(family,file_id,slide_id) in SOURCES.items():
        url=f"https://media.chicagoshining.com/studio/previews/lettered/{RID}/{pos-1}.jpg"
        selected=[x for x in r["selected_assets"]["selected_clips"] if x.get("order")==pos]
        rendered=[x for x in r["render_clip_list"] if x.get("order")==pos]
        require(len(selected)==len(rendered)==1 and selected[0]["media_asset_record_id"]==family
            and selected[0]["google_drive_file_id"]==file_id and selected[0]["url"]==url
            and rendered[0]["mediaAssetRecordId"]==family and rendered[0]["googleDriveFileId"]==file_id
            and rendered[0]["url"]==url,"manifest_changed")
        assets=get("media_assets",{"airtable_record_id":"eq."+family,"select":"google_drive_file_id,active,do_not_use,asset_status,metadata","limit":2})
        require(len(assets)==1 and assets[0]["google_drive_file_id"]==file_id and assets[0]["active"] is True
            and assets[0]["do_not_use"] is False and assets[0]["asset_status"]=="Available"
            and assets[0]["metadata"].get("rights_status")=="Owned"
            and assets[0]["metadata"].get("content_profile_airtable_id")=="recgtK8Z7eNADNtVy","source_identity_changed")
        slides=get("carousel_slides",{"airtable_record_id":"eq."+slide_id,"select":"fields,deleted_from_carousel","limit":2})
        require(len(slides)==1 and slides[0]["deleted_from_carousel"] is not True,"slide_missing")
        f=slides[0]["fields"]
        require(f["Platform Output"]==[RID] and f["Review Status"]=="Final Approved" and f["Shared_Asset_Approved"] is True
            and f["Asset_4x5_Public_URL"]==url and "/d/"+file_id+"/" in f["Asset_4x5_File_URL"],"slide_revision_changed")
        with g.resource_slot("transfer",key=f"issue3096-10430-source-{pos}",limit=1):
            data,mime=drive.download_file(file_id,timeout=30)
            require(mime in ("image/jpeg","image/png"),"source_mime")
            source=probe(data)
            with requests.get(url,timeout=20,stream=True,allow_redirects=False) as response:
                require(response.status_code==200,"cdn_read_failed")
                body=b""
                for chunk in response.iter_content(65536):
                    body+=chunk
                    require(len(body)<=16*1024*1024,"cdn_byte_budget")
            cdn=probe(body)
        results.append({"position":pos,"source":source,"cdn":cdn})
    result={"output":10430,"sources_distinct":results[0]["source"]["pixel_sha256"]!=results[1]["source"]["pixel_sha256"],
        "cdn_pixels_distinct":results[0]["cdn"]["pixel_sha256"]!=results[1]["cdn"]["pixel_sha256"],
        "rows":results,"output_writes":0,"provider_writes":0,"r2_writes":0}
    print("ISSUE3096_SOURCE_AUDIT="+json.dumps(result,separators=(",",":")),flush=True)

if __name__=="__main__":
    main()
