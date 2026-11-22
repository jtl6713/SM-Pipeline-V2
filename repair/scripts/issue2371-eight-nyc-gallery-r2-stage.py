#!/usr/bin/env python3
"""Stage owned, visually curated NYC 4:5 repair JPEGs to existing R2.
Exact eight DNP-held outputs; source-only reads and immutable new public keys.
No user/provider publishing, Airtable calls, DB/Factory approvals or modifications.
"""
from __future__ import annotations
import hashlib, io, json, os, sys, time
from pathlib import Path
import requests
from PIL import Image, ImageOps
from dotenv import load_dotenv

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
FOCUS = ((0.50, 0.52), (0.53, 0.48), (0.48, 0.48), (0.48, 0.50))
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

def _preflight():
    health = requests.get("http://127.0.0.1:3350/health", timeout=20).json()
    if not (health.get("ok") is True and health.get("studio_write_source") == "supabase"
            and health.get("studio_runner_output_read_source") == "supabase"):
        raise RuntimeError("studio_write_authority_changed")
    rows = _get("platform_outputs", {
        "output_number": "in.(" + ",".join(map(str, sorted(OUTPUTS))) + ")",
        "select": "output_number,airtable_record_id,content_number,content_profile_id,platform_output_type,"
                  "output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,"
                  "selected_clip_count,scheduled_post_date,published_at,platform_post_url,error_messages",
        "limit": 10})
    if len(rows) != 8: raise RuntimeError("gallery_cohort_incomplete")
    profiles = _get("content_profiles", {"select":"id,market_name,airtable_record_id", "limit":20})
    pbyid = {x["id"]:x for x in profiles}
    story_for_number = {10855:2221,10856:2221,10863:2223,10864:2223,
                        10867:2222,10869:2230,10870:2230,10875:2226}
    for r in rows:
        n = r["output_number"]; rid, count = OUTPUTS[n]
        bag = r.get("error_messages") or {}
        if (r["airtable_record_id"] != rid or r["content_number"] != story_for_number[n]
            or pbyid.get(r["content_profile_id"],{}).get("market_name") != "New York City"
            or pbyid[r["content_profile_id"]].get("airtable_record_id") != NYC_PROFILE
            or r["output_status"] != "In Production" or r["review_status"] is not None
            or r["publish_status"] != "Not Ready" or r["do_not_publish"] is not True
            or r["auto_publish_enabled"] is not False or r["selected_clip_count"] != count
            or r["scheduled_post_date"] is not None or r["published_at"] is not None
            or r["platform_post_url"] is not None
            or (bag.get("SM_Gallery_Draft_Restoration_20261121") or {}).get("status") != "draft_native_slides_restored"
            or (bag.get("SM_Gallery_Subject_QA_20261121") or {}).get("status") != "blocked_wrong_subject_requires_creative_replacement"):
            raise RuntimeError("gallery_changed_abort_" + str(n))
    assets = [item for story in STORIES.values() for item in story]
    if len(assets) != 24 or len({s[0] for s in assets}) != 24: raise RuntimeError("asset_list_not_unique_24")
    source = _get("media_assets", {
        "airtable_record_id":"in.(" + ",".join(s[0] for s in assets) + ")",
        "select":"airtable_record_id,asset_name,google_drive_file_id,media_class,active,do_not_use,asset_status,metadata",
        "limit":50})
    byid = {s["airtable_record_id"]:s for s in source}
    if len(byid) != 24: raise RuntimeError("original_media_not_found_24")
    for rid,drive_id,name,raw in assets:
        a = byid[rid]
        m = a.get("metadata") or {}
        if (a.get("google_drive_file_id") != drive_id or a.get("asset_name") != name
            or a.get("media_class") != "Image" or a.get("active") is not True
            or a.get("do_not_use") is not False or a.get("asset_status") != "Available"
            or m.get("rights_status") != "Owned"
            or m.get("content_profile_airtable_id") != NYC_PROFILE):
            raise RuntimeError("media_ownership_or_state_changed_" + rid)
    return byid

def _jpeg(blob:bytes, raw:bool, pos:int)->bytes:
    if not 5_000 < len(blob) < 16_000_000: raise RuntimeError("bad_source_bytes")
    with Image.open(io.BytesIO(blob)) as src:
        src.load()
        im = ImageOps.exif_transpose(src).convert("RGB")
    if raw:
        if im.size != (768,1376): raise RuntimeError("ferry_raw_geometry_changed")
        im = ImageOps.fit(im, (1080,1350), method=Image.Resampling.LANCZOS, centering=FOCUS[pos])
        buf=io.BytesIO(); im.save(buf,format="JPEG",quality=92,optimize=True,subsampling=0)
        return buf.getvalue()
    if im.size != (1080,1350): raise RuntimeError("4x5_variant_invalid_dimensions")
    return blob

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

def main():
    drive,r2=_setup()
    _preflight()
    receipts=[]
    for content,assets in STORIES.items():
        for index,(media_id,drive_id,name,raw) in enumerate(assets,1):
            data,mime=drive.download_file(drive_id)
            if (raw and mime not in ("image/png","image/jpeg")) or (not raw and mime != "image/jpeg"):
                raise RuntimeError("drive_mime_wrong_"+media_id)
            jpeg=_jpeg(data,raw,index-1 if raw else 0)
            sha=hashlib.sha256(jpeg).hexdigest()
            key=f"studio/previews/repairs/issue2371/nyc-{content}/slide-{index:02d}-{sha[:16]}.jpg"
            url="https://media.chicagoshining.com/"+key
            r2.put_object(key,jpeg,"image/jpeg")
            _confirm(url,sha)
            receipt={"content":content,"index":index,"media_asset_id":media_id,"drive_id":drive_id,
                     "asset_name":name,"url":url,"sha256":sha,"bytes":len(jpeg),
                     "geometry":"1080x1350","original_owned":True,"raw_crop":raw,
                     "cdn_verified":True}
            receipts.append(receipt)
            print("NYC_GALLERY_STAGED_IMAGE="+json.dumps(receipt,separators=(",",":")),flush=True)
    if len(receipts)!=24: raise RuntimeError("stage_count_not_24")
    print("NYC_GALLERY_STAGE="+json.dumps({
        "verified":True,"assets":receipts,"unique_assets":24,"source_writes":0,
        "provider_writes":0,"airtable_reads":0,"factory_approvals":0,
        "note":"original_output_gallery_references_not_updated_yet"},
        separators=(",",":")),flush=True)

if __name__ == "__main__":
    main()
