"""Read-only HTTP/JPEG geometry proof for exact #2464 damaged source galleries.
Never writes media, Supabase, Airtable, or any social-provider object.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from PIL import Image

BASE = "https://media.chicagoshining.com/studio/previews"
# Exact output ID -> immutable original output record IDs from Supabase.
GALLERIES = [
    {"output": 9941, "record": "recdjiDsU4dTBmFea", "family": "lettered", "count": 4, "purpose": "tiktok_9x16"},
    {"output": 10015, "record": "recKuooqEnBikHLOI", "family": "lettered", "count": 4, "purpose": "tiktok_9x16"},
    {"output": 8221, "record": "rec8urJx5v32Mlm8o", "family": "lettered", "count": 5, "purpose": "instagram_missing"},
    {"output": 8221, "record": "rec8urJx5v32Mlm8o", "family": "watermarked", "count": 5, "purpose": "instagram_missing"},
    {"output": 7894, "record": "recAlU4bLFmWDBV4H", "family": "lettered", "count": 4, "purpose": "instagram_lost_slides"},
    {"output": 10802, "record": "recr4kD97CT3X2JLX", "family": "lettered", "count": 4, "purpose": "facebook_photo_set"},
]
def probe(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SM-Pipeline-V2-media-integrity-audit/1.0", "Accept": "image/jpeg"})
    try:
        with urllib.request.urlopen(req, timeout=22) as response:
            if response.status != 200:
                return {"http":response.status,"valid":False,"reason":"non_200"}
            content = response.read(12_000_001)
            if len(content) > 12_000_000 or len(content) < 128:
                return {"http":response.status,"valid":False,"reason":"size_out_of_range"}
            if not content.startswith(b"\\xff\\xd8\\xff"):
                return {"http":response.status,"valid":False,"reason":"not_jpeg_magic"}
            with Image.open(io.BytesIO(content)) as im:
                im.verify()
            with Image.open(io.BytesIO(content)) as im:
                width, height = im.size
            ratio = round(width / height, 5) if height else 0
            return {"http":200,"valid":True,"width":width,"height":height,"ratio":ratio,
                    "aspect_9x16":bool(0.54 <= ratio <= 0.58 and height >= 640),
                    "aspect_4x5":bool(0.77 <= ratio <= 0.83 and height >= 640),
                    "sha256_prefix":hashlib.sha256(content).hexdigest()[:16]}
    except urllib.error.HTTPError as exc:
        return {"http":exc.code,"valid":False,"reason":"http_error"}
    except Exception as exc:
        return {"http":0,"valid":False,"reason":type(exc).__name__}

def main():
    results=[]
    for gallery in GALLERIES:
        for index in range(gallery["count"]):
            url=f"{BASE}/{gallery['family']}/{gallery['record']}/{index}.jpg"
            r=probe(url)
            results.append({**gallery,"order":index+1,"url":url,**r})
    summary={}
    for g in GALLERIES:
        key=f"{g['output']}/{g['family']}"
        items=[r for r in results if r["output"]==g["output"] and r["family"]==g["family"]]
        summary[key]={"tested":len(items),"http_200":sum(r["http"]==200 for r in items),
                      "distinct_sha256":len({r.get("sha256_prefix") for r in items if r.get("valid")}),
                      "aspect_9x16":sum(r.get("aspect_9x16",False) for r in items),
                      "aspect_4x5":sum(r.get("aspect_4x5",False) for r in items)}
    report={"kind":"issue2464_exact_original_gallery_public_media_probe_v1",
            "checked_at":datetime.now(timezone.utc).isoformat(),
            "read_only":True,"source_writes":0,"provider_writes":0,"published":0,
            "gallery_summaries":summary,"images":results}
    outfile=os.environ.get("ISSUE2464_MEDIA_AUDIT_JSON","/tmp/issue2464-gallery-geometry.json")
    with open(outfile,"w",encoding="utf-8") as fp:json.dump(report,fp,indent=2)
    print("ISSUE2464_GALLERY_MEDIA_AUDIT="+json.dumps({"checked_at":report["checked_at"],
         "gallery_summaries":summary,"read_only":True,"source_writes":0,"provider_writes":0}))
    # A 404 is an evidence result, not a workflow failure.
    # Fail on network failure for every gallery; it would not be a useful evidence census.
    if all(s["http_200"]==0 for s in summary.values()):
        raise SystemExit("all_public_gallery_probes_unavailable")
if __name__=="__main__":main()
