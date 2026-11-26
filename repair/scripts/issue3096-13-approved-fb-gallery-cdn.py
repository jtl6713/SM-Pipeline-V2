"""Exact already-approved gallery CDN bytes; no publication authorization."""
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from io import BytesIO
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
MANIFEST=ROOT/"repair/manifests/issue3096-13-approved-fb-gallery-cdn.json"
REPORT=Path("/tmp/issue3096-fb-gallery-cdn.json")
IDS=(9851,10205,10207,10214,10311,10319,10328,10357,10430,10432,10444,10461,10487)
MAX_BYTES=5*1024*1024
Image.MAX_IMAGE_PIXELS=25_000_000

def safe(url):
    p=urlsplit(url)
    return (p.scheme=="https" and p.netloc=="media.chicagoshining.com"
            and p.path.startswith("/studio/previews/") and not p.query and not p.fragment
            and ".." not in p.path and chr(92) not in p.path
            and p.path.lower().endswith((".jpg",".jpeg",".png",".webp")))

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None

def check(item):
    n,s=item
    r={"output":n,"slide":s["slide"],"slide_id":s["slide_id"],"verified":False}
    try:
        assert safe(s["cdn_url"])
        req=Request(s["cdn_url"],method="GET",headers={"User-Agent":"SM-Pipeline-3096-CDN-Audit/1.0","Accept":"image/jpeg,image/png,image/webp"})
        with build_opener(NoRedirect()).open(req,timeout=20) as res:
            mime=res.headers.get("Content-Type","").split(";")[0].lower()
            if res.status!=200 or mime not in ("image/jpeg","image/png","image/webp") or not safe(res.url):
                raise ValueError("invalid_response")
            data=res.read(MAX_BYTES+1)
        if not data or len(data)>MAX_BYTES:
            raise ValueError("invalid_byte_count")
        with Image.open(BytesIO(data)) as im:
            im.load()
            w,h=im.size
            fmt=im.format
        r.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),width=w,height=h,
                 verified=(w>0 and h>0 and w*5==h*4 and fmt in ("JPEG","PNG","WEBP")))
    except Exception as e:
        r["error_type"]=type(e).__name__
    return r

def main():
    m=json.loads(MANIFEST.read_text())
    assert m["schema"]=="issue3096_fb_approved_cdn_v1" and m["read_only"] is True and m["publication_authorized"] is False
    entries=m["entries"]
    assert tuple(x["output_number"] for x in entries)==IDS
    batch=[]
    for x in entries:
        s=x["slides"]
        assert len(s) in (4,8) and [y["slide"] for y in s]==list(range(1,len(s)+1))
        assert len({y["cdn_url"] for y in s})==len(s) and all(safe(y["cdn_url"]) for y in s)
        batch.extend((x["output_number"],y) for y in s)
    assert len(batch)==64
    with ThreadPoolExecutor(max_workers=4) as pool:
        images=list(pool.map(check,batch))
    dispositions=[]
    for n in IDS:
        rows=[x for x in images if x["output"]==n]
        good=all(x["verified"] for x in rows)
        distinct=len({x.get("sha256") for x in rows})==len(rows)
        dispositions.append({"output":n,"slides":len(rows),"all_exact_4x5":good,"distinct_bytes":distinct,
                             "media_ready_for_further_verification":good and distinct})
    report={"read_only":True,"publication_authorized":False,"output_writes":0,"provider_writes":0,
            "slides":len(images),"verified":sum(x["verified"] for x in images),
            "complete_galleries":sum(x["media_ready_for_further_verification"] for x in dispositions),
            "dispositions":dispositions,"images":images}
    REPORT.write_text(json.dumps(report,indent=2))
    print("ISSUE3096_FB_CDN="+json.dumps({k:v for k,v in report.items() if k!="images"},separators=(",",":")))
if __name__=="__main__":
    main()
