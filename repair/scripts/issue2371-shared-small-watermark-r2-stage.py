#!/usr/bin/env python3
"""Stage shared authorized small watermark bottom-right on NYC8 repaired 4:5 images.
Safe immutable R2 derivatives only: NO database writes, NO provider posts, NO approvals.
Upstream source image and owner attribution remain unchanged. Exact 24 source/40 slide preflight.
"""
from __future__ import annotations
import hashlib, io, json, os, sys, time
from pathlib import Path
import requests
from PIL import Image
from dotenv import load_dotenv

WATERMARK_DRIVE_ID="1WQyd5W1__HkaEkWyC38IMErW8702Rd4u"
WATERMARK_ASSET_ID="recTnq3abS2rcsTzK"
WATERMARK_SHA256="2199893b2668e976e350631e5386e33aece14d0b96a77907538ab67bbf50b344"
WATERMARK_POSITION="bottom-right"
WATERMARK_WIDTH_RATIO=0.12
WATERMARK_MARGIN=30
EXPECTED_ACTIVE_SLIDES=40
STORY_OUTPUT={10855:2221,10856:2221,10863:2223,10864:2223,10867:2222,10869:2230,10870:2230,10875:2226}

PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
NYC_PROFILE = "recgtK8Z7eNADNtVy"
OUTPUTS = {
    10855: ("recO494MDnQ1Tk51b", 4),
    10856: ("recWIWOrdflmqyxKW", 4),
    10863: ("recVoFLCOAGHNIkD3", 8),
    10864: ("rechOtaxHOwY18A8F", 8),
    10867: ("rec61JeXiA6Aai1Kk", 4),
    10869: ("recttY0sPY2RGkcaq", 4),
    10870: ("recUIDBjcY6RgSy0n", 4),
    10875: ("recWq5HIxBT8BCtme", 8),
}
# Exactly 5 logical content stories. Each row: legacy source asset, private Drive id,
# one unambiguous user-owned image, and raw-crop flag. Eight gallery outputs share
# these 24 distinct source JPEGs; no new images are fabricated.
STORIES = {
    2221: [
        ("recNysDZ8eTEItfhA", "1po1UDleSiRaf9Jxow7wWOz4dToJo7snT", "Staten Island Ferry 1", True),
        ("recwjoNLYRtjdmn4q", "18pB-cjG___DX4gMsuQqAFV23pnGu2mkJ", "Staten Island Ferry 4", True),
        ("rec7mAEWKnxpFOeq7", "1TpzJtmtjnjHwU44ODqZtHbGKAqEH0LK1", "Staten Island Ferry 5", True),
        ("recIw5xuV40gaUxds", "1L7EBh93Ydfjd-2ClufULz6-sU3gN5hmW", "Staten Island Ferry 9", True),
    ],
    2223: [
        ("recAt688oKcrtDX5f", "1yTfHSdZ-VMuDmhg2mNrw9kVDNvcoFyhT", "NYC-Highline-1__4x5__fill-crop-v2.jpg", False),
        ("rec1FjO82dE1F2Ll0", "1933S3AWFUiRNh0USoz0tok2tpgZP4g_w", "NYC-Highline-3__4x5__fill-crop-v2.jpg", False),
        ("rec8vLshwZ3W6jyTf", "1Y8TJSmJ9RcZb0Wz4XH7KpZrfdjcn142t", "NYC-Highline-4__4x5__fill-crop-v2.jpg", False),
        ("recw5kudnRzZqiNHr", "1goPtXaEbqAmldVTyUdcjZPI3gN93QseA", "NYC-Highline-5__4x5__fill-crop-v2.jpg", False),
        ("recCNCCJ5mpKRjAF4", "14DeJlfEiWXK7aKG_U-AKXnDGm7DSrDvX", "NYC-Highline-6__4x5__fill-crop-v2.jpg", False),
        ("recaSKIBkz4GRw5Kl", "1DfcB1nQgdXrTfaa-MoUeouAn4csTjYFY", "NYC-Highline-7__4x5__fill-crop-v2.jpg", False),
        ("reccVFmtkdvsD85kj", "1nA7H_3iWRKX2PqXSuNbUQLj4XeUdB1Rl", "NYC-Highline-8__4x5__fill-crop-v2.jpg", False),
        ("rec5xjETr71rs30PO", "1D2E-6-GlcHcj8wJ9hCvaSMe9_2u7U3uv", "NYC-Highline-9__4x5__fill-crop-v2.jpg", False),
    ],
    2222: [
        ("recd4FejkOYXZ6plx", "1lYNKCZaDHj1KFx8T23vWeCHy7ewkJbZ9", "Gantry-Plaza-State-Park-3__4x5__fill-crop-v2.jpg", False),
        ("recQy7nuwC7UDWFmY", "1CCxMRYtMOSXNADUWi0X04F-yMPy0offO", "Gantry-Plaza-State-Park-5__4x5__fill-crop-v2.jpg", False),
        ("recmabt6To1gFvaDi", "1wEXW0JCUxYTfrp7zGDFmCT3DFTL-6Mn1", "Gantry-Plaza-State-Park-7__4x5__fill-crop-v2.jpg", False),
        ("recQlXaMmQQTezpLh", "1jQvoIMEkS2kDCrQC0NAoU2bsYmLjNUu8", "Gantry-Plaza-State-Park-9__4x5__fill-crop-v2.jpg", False),
    ],
    2230: [
        ("recX9sxFvF74DvOWq", "1XoCOTbLiLsv_kJSS8Y0kKZz-gvMZV6tE", "Governors-island-7__4x5__fill-crop-v2.jpg", False),
        ("reciwLE1POzvKV8e8", "1ZUjiR94KPGdAlBuChpj_9IRk6lLnIM-9", "Governors-island-8__4x5__fill-crop-v2.jpg", False),
        ("recKok262GGActviE", "1fOM_6xMEcKrH7o9kOimUOcDzCsmJKg4Y", "Governors-Island-22__4x5__fill-crop-v2.jpg", False),
        ("rec5j1o3rSKxM6tPx", "1GLumUz8wd7CZAt1G-1uIMUUl6pcll1cR", "Governors-Island-23__4x5__fill-crop-v2.jpg", False),
    ],
    2226: [
        ("recGYENqQEAuw93yf", "1sf_xe5Ms17y7mo9ahPoQr0tZdifPxjbP", "Unisphere-2__4x5__fill-crop-v2.jpg", False),
        ("recLERZVmaGlR9CbF", "1h-CcZOXJFY7uISPVjnbYAasL3pbTtrK1", "Unisphere-3__4x5__fill-crop-v2.jpg", False),
        ("recNOK3Ns5jRdoNYU", "1CyAUYmCiyvZBFTTetQKGqTo6pFJ9P0Ew", "Unisphere-4__4x5__fill-crop-v2.jpg", False),
        ("recv8g3KYEOKoxHh7", "1hccpW_kkBgtZc4pdAUA96d-aWJ_TYo8z", "Unisphere-5__4x5__fill-crop-v2.jpg", False),
    ],
}

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



def _preflight():
    wm_rows=_get("media_assets", {
        "airtable_record_id": "eq."+WATERMARK_ASSET_ID,
        "select":"airtable_record_id,asset_name,asset_role,asset_status,active,do_not_use,google_drive_file_id,file_size_bytes,metadata",
        "limit":2})
    if len(wm_rows)!=1: raise RuntimeError("shared_watermark_asset_missing")
    a=wm_rows[0]
    if not (a["asset_name"]=="ChicagoShining_Watermark_Small.png"
            and a["asset_role"]=="Watermark" and a["asset_status"]=="Available"
            and a["active"] is True and a["do_not_use"] is False
            and a["google_drive_file_id"]==WATERMARK_DRIVE_ID
            and int(a["file_size_bytes"])==2075758
            and a["metadata"].get("rights_status")=="Owned"):
        raise RuntimeError("shared_small_watermark_identity_changed")
    p=_get("content_profiles",{"airtable_record_id":"eq."+NYC_PROFILE,
                  "select":"id,airtable_record_id,market_name","limit":2})
    if len(p)!=1 or p[0]["market_name"]!="New York City": raise RuntimeError("not_nyc_profile")
    profile=p[0]["id"]
    rows=_get("platform_outputs",{
        "output_number":"in.("+",".join(map(str,sorted(OUTPUTS)))+")",
        "select":"output_number,airtable_record_id,content_number,content_profile_id,"
                 "output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,"
                 "selected_clip_count,image_count,scheduled_post_date,published_at,platform_post_url,"
                 "render_clip_list,selected_assets,error_messages",
        "limit":10})
    if len(rows)!=8: raise RuntimeError("expected_exactly_eight_outputs")
    source_by_story={}
    slide_refs={}
    for r in rows:
        n=r["output_number"]; content=STORY_OUTPUT.get(n)
        story=STORIES.get(content) if content else None
        expected=OUTPUTS.get(n)
        bag=r.get("error_messages") or {}
        if (not story or not expected or r["airtable_record_id"]!=expected[0]
           or r["content_number"]!=content or r["content_profile_id"]!=profile
           or r["output_status"]!="In Production" or r["review_status"] is not None
           or r["publish_status"]!="Not Ready" or r["do_not_publish"] is not True
           or r["auto_publish_enabled"] is not False or r["selected_clip_count"]!=len(story)
           or r["image_count"]!=len(story) or r["scheduled_post_date"] is not None
           or r["published_at"] is not None or r["platform_post_url"] is not None
           or not bag.get("SM_NYC_Public_Media_Repair_20261122")):
            raise RuntimeError("gallery_held_state_changed_"+str(n))
        clips=r.get("render_clip_list")
        selected=(r.get("selected_assets") or {}).get("selected_clips")
        if not (isinstance(clips,list) and isinstance(selected,list) and
                len(clips)==len(story) and len(selected)==len(story)):
            raise RuntimeError("gallery_selected_media_shape_changed_"+str(n))
        for j,((asset_id,drive_id,name,raw),clip,sel) in enumerate(zip(story,clips,selected),1):
            url=clip.get("src")
            expected_prefix=f"https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-{content}/slide-{j:02d}-"
            # #10867 retained preexisting lettered parent clips (0.jpg..3.jpg)
            # while its four native Factory slides already carry the verified owned
            # corrected original 4:5 assets. Treat only that exact known mismatch
            # as stale parent metadata; use the authoritative native slide URLs.
            legacy_lettered=(n==10867 and
                url==f"https://media.chicagoshining.com/studio/previews/lettered/rec61JeXiA6Aai1Kk/{j-1}.jpg"
                and clip.get("watermarked") is True)
            normal=(isinstance(url,str) and url.startswith(expected_prefix)
                    and url.endswith(".jpg") and clip.get("watermarked") is False)
            if (clip.get("mediaAssetRecordId")!=asset_id or clip.get("googleDriveFileId")!=drive_id
               or clip.get("assetName")!=name or clip.get("url")!=url
               or not (normal or legacy_lettered)
               or sel.get("src")!=url or sel.get("url")!=url):
                raise RuntimeError(f"base_image_reference_changed_{n}_{j}")
            key=(content,j)
            base_url=None if legacy_lettered else url
            if key in source_by_story and source_by_story[key]!=base_url:
                raise RuntimeError("crosspost_gallery_source_mismatch_"+str(key))
            source_by_story[key]=base_url
            slide_refs[(n,j)]=base_url
    if len(source_by_story)!=24 or len(slide_refs)!=40:
        raise RuntimeError("unexpected_original_gallery_image_counts")
    slides=_get("carousel_slides",{
        "select":"id,airtable_record_id,current_order,deleted_from_carousel,fields",
        "fields->>Asset_4x5_Public_URL":"like.*issue2371*",
        "limit":120})
    if len(slides)!=EXPECTED_ACTIVE_SLIDES:
        raise RuntimeError("forty_native_slide_preflight_count_"+str(len(slides)))
    seen=set()
    for row in slides:
        fields=row["fields"] or {}
        target=fields.get("PO_Output_ID") or []
        if len(target)!=1: raise RuntimeError("slide_parent_shape_invalid")
        n=int(target[0]); j=row["current_order"]; key=(n,j)
        if n==10867 and key in slide_refs and slide_refs[key] is None:
            canonical=fields.get("Asset_4x5_Public_URL")
            prefix=f"https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-2222/slide-{j:02d}-"
            if (not isinstance(canonical,str) or not canonical.startswith(prefix)
                or not canonical.endswith(".jpg") or
                fields.get("Current Image URL")!=canonical or
                fields.get("Final Image URL")!=canonical):
                raise RuntimeError(f"gantry_original_factory_slide_missing_{n}_{j}")
            slide_refs[key]=canonical
            source_by_story[(2222,j)]=canonical
        if (key in seen or key not in slide_refs or
            row["deleted_from_carousel"] is not False or
            fields.get("Platform Output")!=[OUTPUTS[n][0]] or
            fields.get("Current Image URL")!=slide_refs[key] or
            fields.get("Final Image URL")!=slide_refs[key] or
            fields.get("Asset_4x5_Public_URL")!=slide_refs[key] or
            fields.get("Review Status")!="Changes Requested" or
            fields.get("Approved For Final") is not False or
            fields.get("Shared_Asset_Approved") is not False):
            raise RuntimeError(f"slide_held_state_changed_{n}_{j}")
        seen.add(key)
    if len(seen)!=40: raise RuntimeError("native_slide_key_coverage_gap")
    return source_by_story

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

def main():
    drive,r2=_setup()
    health=requests.get("http://127.0.0.1:3350/health",timeout=25).json()
    if not (health.get("ok") is True and health.get("studio_write_source")=="supabase"
            and health.get("studio_runner_output_read_source")=="supabase"):
        raise RuntimeError("supabase_only_runner_health_preflight_failed")
    mapping=_preflight()
    wm=_load_watermark(drive)
    receipts=[]
    for content, story in STORIES.items():
        for index, (asset_id,drive_id,name,_raw) in enumerate(story,1):
            base_url=mapping[(content,index)]
            blob=requests.get(base_url,timeout=55,headers={"Cache-Control":"no-cache"})
            blob.raise_for_status()
            base_bytes=blob.content
            slug=base_url.rsplit("/",1)[1]
            expected=slug.replace(".jpg","").rsplit("-",1)[-1]
            if len(expected)!=16 or hashlib.sha256(base_bytes).hexdigest()[:16]!=expected:
                raise RuntimeError(f"original_sha256_prefix_mismatch_{content}_{index}")
            branded,rect=_brand_photo(base_bytes,wm)
            sha=hashlib.sha256(branded).hexdigest()
            key=(f"studio/previews/repairs/issue2371/nyc-{content}/"
                 f"shared-small-bottom-right/slide-{index:02d}-{sha[:16]}.jpg")
            url="https://media.chicagoshining.com/"+key
            r2.put_object(key,branded,"image/jpeg")
            _confirm(url,sha)
            receipt={"content":content,"index":index,"media_asset_id":asset_id,
                     "drive_id":drive_id,"base_url":base_url,"url":url,
                     "sha256":sha,"bytes":len(branded),"geometry":"1080x1350",
                     "watermark_position":"bottom-right",
                     "watermark_pixel_box":list(rect),"cdn_verified":True}
            receipts.append(receipt)
            print("NYC_SHARED_WM_SLIDE="+json.dumps(receipt,separators=(",",":")),flush=True)
    if len(receipts)!=24 or len({r["url"] for r in receipts})!=24:
        raise RuntimeError("staged_24_unique_branded_images_incomplete")
    print("NYC_GALLERY_SHARED_WM_STAGE="+json.dumps({
        "verified":True,"unique_assets":24,"active_slide_references_pending":40,
        "watermark_drive_id":WATERMARK_DRIVE_ID,
        "watermark_sha256":WATERMARK_SHA256,
        "position":"bottom-right","scale":WATERMARK_WIDTH_RATIO,"margin":WATERMARK_MARGIN,
        "assets":receipts,"source_writes":0,"provider_writes":0,"database_writes":0,
        "airtable_reads":0,"factory_approvals":0,
        "note":"R2 staging complete; production Supabase slide/output references remain unchanged pending transaction verification"},
        separators=(",",":")),flush=True)

if __name__=="__main__":
    main()
