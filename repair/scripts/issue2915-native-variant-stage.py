#!/usr/bin/env python3
"""Stage exact owned same-lineage 9:16 variants for a wrong-media native photo output.
Pilot #2915: C2223 / PO10865, from verified PO10863. No DB writes or provider calls.
Reusable matching uses transfer lineage, not filenames alone; no ambiguous substitution.
"""
from __future__ import annotations
import hashlib, io, json, os, sys, time
from pathlib import Path
import requests
from PIL import Image
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
NYC_PROFILE="recgtK8Z7eNADNtVy"
WATERMARK_DRIVE_ID="1WQyd5W1__HkaEkWyC38IMErW8702Rd4u"
WATERMARK_ASSET_ID="recTnq3abS2rcsTzK"
WATERMARK_SHA256="2199893b2668e976e350631e5386e33aece14d0b96a77907538ab67bbf50b344"
WATERMARK_WIDTH_RATIO=0.12
WATERMARK_MARGIN=30
BASE=Path.cwd() / "Services" / "pipeline-runner" / "service"
ENV=BASE / ".env"

def _setup():
    if not ENV.is_file(): raise RuntimeError("runner_env_missing")
    load_dotenv(ENV, override=False)
    if not os.getenv("PORT"): os.environ["PORT"] = "3350"
    sys.path.insert(0, str(BASE))
    for n in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
              "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
              "R2_UPLOAD_WORKER_URL", "R2_UPLOAD_WORKER_SECRET"):
        if not os.getenv(n): raise RuntimeError("missing_owner_credential_" + n)
    if os.environ["SUPABASE_URL"].rstrip("/") != PROJECT: raise RuntimeError("wrong_supabase_project")
    from integrations.google_drive import GoogleDriveClient
    from integrations.r2_upload import R2UploadClient
    return GoogleDriveClient(), R2UploadClient()

def _get(table, params):
    k = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    res = requests.get(PROJECT + "/rest/v1/" + table, params=params,
                       headers={"apikey": k, "Authorization": "Bearer " + k},
                       timeout=35)
    res.raise_for_status()
    return res.json()


def _confirm(url:str, sha:str):
    for attempt in range(5):
        try:
            res=requests.get(url,timeout=40,headers={"Cache-Control":"no-cache"})
            res.raise_for_status()
            if hashlib.sha256(res.content).hexdigest() != sha: raise RuntimeError("cdn_sha256_does_not_match")
            with Image.open(io.BytesIO(res.content)) as im:
                im.verify()
            with Image.open(io.BytesIO(res.content)) as im:
                if im.format != "JPEG" or im.size != (1080,1920): raise RuntimeError("cdn_image_invalid_geometry")
            return
        except (OSError, RuntimeError, requests.RequestException):
            if attempt == 4: raise
            time.sleep(3)




def _load_watermark(drive):
    content,mime=drive.download_file(WATERMARK_DRIVE_ID)
    if mime!="image/png" or len(content)!=2075758:
        raise RuntimeError("watermark_file_bytes_or_mime_changed")
    sha=hashlib.sha256(content).hexdigest()
    if sha!=WATERMARK_SHA256: raise RuntimeError("watermark_checksum_mismatch")
    with Image.open(io.BytesIO(content)) as im:
        im.load()
        if im.size!=(1024,1536) or im.mode!="RGBA":
            raise RuntimeError("watermark_geometry_or_alpha_format_changed")
        mark=im.convert("RGBA")
    alpha=mark.getchannel("A").getextrema()
    if alpha!=(0,255): raise RuntimeError("watermark_transparency_missing")
    return mark

def _brand_photo(base_bytes, watermark):
    with Image.open(io.BytesIO(base_bytes)) as im:
        im.load()
        if im.size!=(1080,1920) or im.format!="JPEG":
            raise RuntimeError("original_9x16_geometry_or_mime_changed")
        base=im.convert("RGBA")
    width=max(1,round(1080*WATERMARK_WIDTH_RATIO))
    height=max(1,round(watermark.height*width/watermark.width))
    if width>200 or height>300: raise RuntimeError("watermark_not_corner_sized")
    mark=watermark.resize((width,height), Image.Resampling.LANCZOS)
    x=1080-WATERMARK_MARGIN-width
    y=1920-WATERMARK_MARGIN-height
    if x<0 or y<0: raise RuntimeError("watermark_corner_outside_safe_image")
    layer=Image.new("RGBA",base.size,(0,0,0,0))
    layer.paste(mark,(x,y)) # preserve original PNG alpha; do not multiply transparency twice
    composed=Image.alpha_composite(base,layer)
    # No source file overwrite; JPEG output for provider compatibility.
    out=io.BytesIO()
    composed.convert("RGB").save(out,format="JPEG",quality=95,optimize=True,subsampling=0)
    return out.getvalue(), (x,y,width,height)


def require_owned(a, profile):
    m=a.get("metadata") or {}
    return (a.get("media_class")=="Image" and a.get("active") is True
        and a.get("do_not_use") is False and a.get("asset_status")=="Available"
        and m.get("rights_status")=="Owned" and m.get("content_profile_airtable_id")==profile
        and isinstance(a.get("google_drive_file_id"),str) and bool(a["google_drive_file_id"]))

def exact_variant(source, candidates, profile):
    transfer=(source.get("metadata") or {}).get("studio_transfer_id","")
    if not require_owned(source,profile) or not transfer.endswith("-4x5"):
        raise RuntimeError("source_lineage_not_verified")
    expected=transfer.removesuffix("-4x5")+"-9x16"
    matches=[a for a in candidates if (a.get("metadata") or {}).get("studio_transfer_id")==expected
        and require_owned(a,profile) and a.get("asset_name")==source["asset_name"].replace("__4x5__","__9x16__")]
    if len(matches)!=1: raise RuntimeError("unique_owned_variant_missing")
    return matches[0]

def _preflight():
    rows=_get("platform_outputs",{
        "output_number":"in.(10863,10865)",
        "select":"output_number,airtable_record_id,content_number,content_item_id,content_profile_id,platform,format,output_title,output_caption,output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,selected_clip_count,scheduled_post_date,studio_scheduled_at,published_at,platform_post_url,platform_publish_response,updated_at,render_clip_list,error_messages",
        "limit":3})
    if len(rows)!=2: raise RuntimeError("exact_output_pair_missing")
    by={r["output_number"]:r for r in rows}; source,target=by[10863],by[10865]
    p=_get("content_profiles",{"airtable_record_id":"eq."+NYC_PROFILE,"select":"id,market_name","limit":2})
    if len(p)!=1 or p[0]["market_name"]!="New York City": raise RuntimeError("profile_changed")
    profile=p[0]["id"]
    for r in (source,target):
        if r["content_number"]!=2223 or r["content_profile_id"]!=profile or r["selected_clip_count"]!=8:
            raise RuntimeError("output_scope_changed")
    if (source["airtable_record_id"]!="recVoFLCOAGHNIkD3" or target["airtable_record_id"]!="recFHzU0h4f4mjgrj"
        or source["content_item_id"]!=target["content_item_id"]
        or source["output_title"]!=target["output_title"] or source["output_caption"]!=target["output_caption"]
        or source["platform"]!="Instagram" or target["platform"]!="TikTok" or target["format"]!="Photo Set"
        or target["output_status"]!="Ready for Review" or target["review_status"]!="Review Sent"
        or target["publish_status"]!="Not Ready" or target["do_not_publish"] is not False
        or target["auto_publish_enabled"] is not False
        or any(target.get(k) for k in ("scheduled_post_date","studio_scheduled_at","published_at","platform_post_url","platform_publish_response"))):
        raise RuntimeError("target_revision_or_provider_state_changed")
    bag=target.get("error_messages") or {}
    if any(bag.get(k) for k in ("Platform_Post_ID","Platform_Media_ID","Studio_Publish_Dispatch_Count","Publish_Attempt_Count","Publish_Locked_At","Publish_Started_At","TikTok_Publish_ID")):
        raise RuntimeError("provider_history_requires_reconciliation")
    clips=source.get("render_clip_list"); old=target.get("render_clip_list")
    if not isinstance(clips,list) or len(clips)!=8 or not isinstance(old,list) or len(old)!=8 or old[0].get("caption")!="High Line Art Hits":
        raise RuntimeError("expected_stale_revision_changed")
    source_ids=[c.get("mediaAssetRecordId") for c in clips]
    if len(set(source_ids))!=8 or any(not isinstance(x,str) or not x.startswith("rec") for x in source_ids):
        raise RuntimeError("source_manifest_invalid")
    slides=_get("carousel_slides",{"fields->PO_Output_ID":"cs.[10863]","deleted_from_carousel":"eq.false","select":"current_order,fields","order":"current_order.asc","limit":9})
    if len(slides)!=8: raise RuntimeError("source_slide_count")
    for i,(c,s) in enumerate(zip(clips,slides),1):
        f=s["fields"];q=f.get("SM_NYC_AI_Creative_QA_20261122") or f.get("SM_Quality_Gallery_Media_QA_v1") or {}
        g=f.get("SM_NYC_Shared_Small_Watermark_20261122") or f.get("SM_Quality_Gallery_Geometry_v1") or {}
        if (s["current_order"]!=i or f.get("Platform Output")!=[source["airtable_record_id"]]
            or f.get("Asset_Family_Key")!=c["mediaAssetRecordId"] or f.get("Google Drive File ID")!=c["googleDriveFileId"]
            or f.get("Final Image URL")!=c["url"] or q.get("brand_verified") is not True
            or q.get("source_owner_rights_verified") is not True or g.get("cdn_sha256_verified") is not True):
            raise RuntimeError("source_visual_proof_changed")
    select="airtable_record_id,asset_name,google_drive_file_id,media_class,active,do_not_use,asset_status,metadata"
    originals=_get("media_assets",{"airtable_record_id":"in.("+",".join(source_ids)+")","select":select,"limit":9})
    if len(originals)!=8: raise RuntimeError("source_asset_inventory_incomplete")
    byid={a["airtable_record_id"]:a for a in originals}; chosen=[]
    for c in clips:
        a=byid[c["mediaAssetRecordId"]]
        if a["google_drive_file_id"]!=c["googleDriveFileId"]:raise RuntimeError("source_drive_changed")
        transfer=(a.get("metadata") or {}).get("studio_transfer_id","")
        if not transfer.endswith("-4x5"):raise RuntimeError("source_variant_invalid")
        candidates=_get("media_assets",{"metadata->>studio_transfer_id":"eq."+transfer.removesuffix("-4x5")+"-9x16","select":select,"limit":3})
        chosen.append(exact_variant(a,candidates,NYC_PROFILE))
    if len({a["airtable_record_id"] for a in chosen})!=8: raise RuntimeError("variant_duplication")
    marks=_get("media_assets",{"airtable_record_id":"eq."+WATERMARK_ASSET_ID,"select":"asset_name,asset_role,asset_status,active,do_not_use,google_drive_file_id,metadata","limit":2})
    if len(marks)!=1 or marks[0]["asset_name"]!="ChicagoShining_Watermark_Small.png" or marks[0]["asset_role"]!="Watermark" or marks[0]["asset_status"]!="Available" or marks[0]["active"] is not True or marks[0]["do_not_use"] is not False or marks[0]["google_drive_file_id"]!=WATERMARK_DRIVE_ID or marks[0]["metadata"].get("rights_status")!="Owned":
        raise RuntimeError("watermark_identity_changed")
    return source,target,chosen

def main():
    drive,r2=_setup()
    from studio_produce.workload_governor import enabled as governor_enabled, resource_slot, recovery_read_only_active, circuit_open
    if not governor_enabled() or recovery_read_only_active() or circuit_open(): raise RuntimeError("governed_workload_unavailable")
    health=requests.get("http://127.0.0.1:3350/health",timeout=20).json()
    if not(health.get("ok") is True and health.get("studio_write_source")=="supabase" and health.get("studio_runner_output_read_source")=="supabase"):
        raise RuntimeError("supabase_authority_unavailable")
    with resource_slot("issue_2915_native_variant_stage",limit=1):
        source,target,assets=_preflight(); wm=_load_watermark(drive)
        prepared=[]
        for index,a in enumerate(assets,1):
            data,mime=drive.download_file(a["google_drive_file_id"])
            if mime!="image/jpeg" or not 5000<len(data)<16000000:raise RuntimeError("invalid_source_bytes")
            branded,rect=_brand_photo(data,wm); sha=hashlib.sha256(branded).hexdigest()
            key=f"studio/previews/repairs/issue2915/nyc-2223/tiktok-9x16/slide-{index:02d}-{sha[:16]}.jpg"
            prepared.append((index,a,branded,sha,key,rect))
        receipts=[]
        for index,a,branded,sha,key,rect in prepared:
            r2.put_object(key,branded,"image/jpeg")
            url="https://media.chicagoshining.com/"+key; _confirm(url,sha)
            receipts.append({"index":index,"media_asset_id":a["airtable_record_id"],"drive_id":a["google_drive_file_id"],"asset_name":a["asset_name"],"transfer_id":a["metadata"]["studio_transfer_id"],"url":url,"sha256":sha,"geometry":"1080x1920","watermark_pixel_box":list(rect),"cdn_verified":True})
        if len(receipts)!=8:raise RuntimeError("incomplete_stage")
        print("ISSUE2915_VARIANT_STAGE="+json.dumps({"verified":True,"output":10865,"source_output":10863,"source_updated_at":source["updated_at"],"target_updated_at":target["updated_at"],"assets":receipts,"source_writes":0,"provider_writes":0,"factory_approvals":0},separators=(",",":")),flush=True)

if __name__=="__main__":
    main()
