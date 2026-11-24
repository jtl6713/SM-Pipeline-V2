#!/usr/bin/env python3
"""Stage exact owned Chicago gallery replacement candidates, #2890.
No DB or provider writes; immutable branded CDN derivatives for visual QA only.
"""
from __future__ import annotations
import hashlib, io, json, os, sys, time
from pathlib import Path
import requests
from PIL import Image, ImageOps
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
PROFILE="recT2rbKX3MF7cVFU"
WATERMARK_DRIVE_ID="1WQyd5W1__HkaEkWyC38IMErW8702Rd4u"
WATERMARK_ASSET_ID="recTnq3abS2rcsTzK"
WATERMARK_SHA256="2199893b2668e976e350631e5386e33aece14d0b96a77907538ab67bbf50b344"
WATERMARK_WIDTH_RATIO=0.12
WATERMARK_MARGIN=30
OUTPUTS={"11129":["recbzkRN1wyWoBjOn",2297,4],"11130":["recpycdsTXLBTD5s6",2297,4],"11131":["rec9hMlB2fBjbdHED",2298,7],"11132":["rec7ZBwpvup8CDp7x",2298,7],"11136":["recxl6v6xS9hJGuh3",2299,10],"11137":["recg1e2fiwy8wnPpG",2299,10]}
STORIES={"2297":["rec8UDjEJjh6lu5Nb","recWVBThDDGnKH2rF","rec2twK3DYhBN5CE8","rec9VI6eslgaHJEhU"],"2298":["recSo2P5iKAaZWjDa","recVRn46mUoNVxxOE","recKeilS6pI0z48HR","recCh8eVzN5OkUPga","recy8cdjwShrbvFsI"],"2299":["recJDVHO5Nvm3EG2j","recov9J6AMXjO6mir","recKkEpwkpoTZjili","recT3BWHLZEdO13x3","recOB7mznjJYwJZON","rec9B2fNwj4jmWxo7","recoP4hzoapMZyA6a","recJ9uGPBSaTAQxux","recp8fTdeKHVZGHYc","recc3aUmVsJ2azXSV"]}
LOCATIONS={"2297":"navy pier","2298":"andersonville","2299":"millennium park"}
BASE = Path.cwd() / "Services" / "pipeline-runner" / "service"
ENV = BASE / ".env"

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
                if im.format != "JPEG" or im.size != (1080,1350): raise RuntimeError("cdn_image_invalid_geometry")
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
        if im.size!=(1080,1350) or im.format!="JPEG":
            raise RuntimeError("original_4x5_geometry_or_mime_changed")
        base=im.convert("RGBA")
    width=max(1,round(1080*WATERMARK_WIDTH_RATIO))
    height=max(1,round(watermark.height*width/watermark.width))
    if width>200 or height>300: raise RuntimeError("watermark_not_corner_sized")
    mark=watermark.resize((width,height), Image.Resampling.LANCZOS)
    x=1080-WATERMARK_MARGIN-width
    y=1350-WATERMARK_MARGIN-height
    if x<0 or y<0: raise RuntimeError("watermark_corner_outside_safe_image")
    layer=Image.new("RGBA",base.size,(0,0,0,0))
    layer.paste(mark,(x,y)) # preserve original PNG alpha; do not multiply transparency twice
    composed=Image.alpha_composite(base,layer)
    # No source file overwrite; JPEG output for provider compatibility.
    out=io.BytesIO()
    composed.convert("RGB").save(out,format="JPEG",quality=95,optimize=True,subsampling=0)
    return out.getvalue(), (x,y,width,height)


def preflight():
    health=requests.get("http://127.0.0.1:3350/health",timeout=25).json()
    if not (health.get("ok") is True and health.get("studio_write_source")=="supabase"
            and health.get("studio_runner_output_read_source")=="supabase"):
        raise RuntimeError("supabase_only_runner_health_preflight_failed")
    profile=_get("content_profiles",{"airtable_record_id":"eq."+PROFILE,"select":"id,airtable_record_id,market_name","limit":2})
    if len(profile)!=1: raise RuntimeError("profile_missing")
    rows=_get("platform_outputs",{"output_number":"in.("+",".join(OUTPUTS)+")","select":"output_number,airtable_record_id,content_number,content_profile_id,output_status,review_status,publish_status,render_status,do_not_publish,auto_publish_enabled,selected_clip_count,scheduled_post_date,studio_scheduled_at,published_at,platform_post_url,error_messages","limit":7})
    if len(rows)!=6: raise RuntimeError("exact_output_cohort_missing")
    for r in rows:
        n=str(r["output_number"]); rid,content,count=OUTPUTS[n]; bag=r.get("error_messages") or {}
        if (r["airtable_record_id"]!=rid or r["content_number"]!=content or r["content_profile_id"]!=profile[0]["id"]
            or r["output_status"]!="Ready for Review" or r["review_status"] is not None
            or r["publish_status"]!="Not Ready" or r["render_status"]!="Native Photo Route"
            or r["do_not_publish"] is not False or r["auto_publish_enabled"] is not False
            or r["selected_clip_count"]!=count or r["scheduled_post_date"] or r["studio_scheduled_at"]
            or r["published_at"] or r["platform_post_url"] or bag.get("Platform_Post_ID")
            or bag.get("Studio_Publish_Dispatch_Count") or bag.get("Publish_Attempt_Count")):
            raise RuntimeError("output_state_changed_"+n)
        slides=_get("carousel_slides",{"fields->PO_Output_ID":"cs."+json.dumps([int(n)]),"deleted_from_carousel":"eq.false","select":"airtable_record_id","limit":1})
        if slides: raise RuntimeError("existing_gallery_inventory_"+n)
    ids=[i for story in STORIES.values() for i in story]+[WATERMARK_ASSET_ID]
    if len(ids)!=20 or len(set(ids))!=20: raise RuntimeError("source_manifest_count")
    assets=_get("media_assets",{"airtable_record_id":"in.("+",".join(ids)+")","select":"airtable_record_id,asset_name,asset_role,google_drive_file_id,media_class,active,do_not_use,asset_status,metadata","limit":21})
    byid={a["airtable_record_id"]:a for a in assets}
    if set(byid)!=set(ids): raise RuntimeError("source_missing")
    for story, asset_ids in STORIES.items():
        for rid in asset_ids:
            a=byid[rid]; m=a.get("metadata") or {}
            if (a["active"] is not True or a["do_not_use"] is not False or a["asset_status"]!="Available"
                or a["media_class"]!="Image" or m.get("rights_status")!="Owned"
                or m.get("content_profile_airtable_id")!=PROFILE or not a["google_drive_file_id"]
                or LOCATIONS[story] not in str(m.get("location","")).lower()):
                raise RuntimeError("candidate_source_authority_changed_"+rid)
    mark=byid[WATERMARK_ASSET_ID]
    if (mark["asset_name"]!="ChicagoShining_Watermark_Small.png" or mark["asset_role"]!="Watermark"
        or mark["google_drive_file_id"]!=WATERMARK_DRIVE_ID or mark["active"] is not True
        or mark["do_not_use"] is not False or mark["asset_status"]!="Available"
        or mark["metadata"].get("rights_status")!="Owned"):
        raise RuntimeError("watermark_authority_changed")
    return byid

def main():
    drive,r2=_setup()
    byid=preflight()
    watermark=_load_watermark(drive)
    receipts=[]
    seen=set()
    for story,ids in STORIES.items():
        for index,rid in enumerate(ids,1):
            a=byid[rid]
            source,mime=drive.download_file(a["google_drive_file_id"])
            if not 5000<len(source)<16000000 or not mime.startswith("image/"):
                raise RuntimeError("bad_source_bytes_"+rid)
            with Image.open(io.BytesIO(source)) as raw:
                raw.load()
                image=ImageOps.exif_transpose(raw).convert("RGB")
            if image.size!=(1080,1350):
                image=ImageOps.fit(image,(1080,1350),method=Image.Resampling.LANCZOS)
            jpeg=io.BytesIO()
            image.save(jpeg,format="JPEG",quality=92,optimize=True,subsampling=0)
            branded,_rect=_brand_photo(jpeg.getvalue(),watermark)
            sha=hashlib.sha256(branded).hexdigest()
            if sha in seen: raise RuntimeError("duplicate_candidate_image")
            seen.add(sha)
            key=f"studio/previews/repairs/issue2890/chicago-{story}/slide-{index:02d}-{sha[:16]}.jpg"
            url="https://media.chicagoshining.com/"+key
            r2.put_object(key,branded,"image/jpeg")
            _confirm(url,sha)
            receipts.append({"content":int(story),"index":index,"media_asset_id":rid,"drive_id":a["google_drive_file_id"],"asset_name":a["asset_name"],"url":url,"sha256":sha,"geometry":"1080x1350","cdn_verified":True,"rights_status":"Owned","watermark_sha256":WATERMARK_SHA256,"visual_qa_pending":True})
    if len(receipts)!=19: raise RuntimeError("stage_count_not_19")
    preflight()
    print("CHICAGO_GALLERY_STAGE="+json.dumps({"verified":True,"assets":receipts,"unique_assets":19,"source_writes":0,"provider_writes":0,"airtable_reads":0,"factory_approvals":0,"visual_qa_pending":True},separators=(",",":")),flush=True)

if __name__=="__main__":
    main()
