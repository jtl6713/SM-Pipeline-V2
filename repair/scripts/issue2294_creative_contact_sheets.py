"""Issue #2294: GET-only review contact sheets for 12 publication-held galleries.

These are UNVERIFIED source images. This tool has no DB, R2 or provider write
credentials, does not generate approved assets and does not mutate any source.
"""
from __future__ import annotations

import hashlib
from io import BytesIO
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

from PIL import Image, ImageDraw, ImageFont, ImageOps

def safe_url(value: str) -> bool:
    try:
        p = urlsplit(value)
    except (ValueError, TypeError):
        return False
    return (p.scheme == "https" and p.netloc == "media.chicagoshining.com"
            and p.path.startswith("/studio/previews/")
            and p.path.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
            and not p.query and not p.fragment and not p.username and not p.password
            and ".." not in p.path and "\\\\" not in p.path)

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "repair/manifests/issue2294-protected-candidate-gallery-cdn-20261122.json"
DEST = Path("/tmp/issue2294-creative-contact-sheets")
OUTPUTS = (10853,10854,10992,10993,11033,11034,11129,11130,11131,11132,11136,11137)
TILE_W, TILE_H = 300, 445
COLS = 4
MAX_BYTES = 5 * 1024 * 1024


def fetch_image(url: str):
    if not safe_url(url):
        raise ValueError("unapproved_host_or_url")
    req = Request(url, headers={"User-Agent": "SM-Pipeline-V2-Issue2294-ReadOnly-Review/1.0",
                                "Accept": "image/jpeg,image/png,image/webp"}, method="GET")
    with urlopen(req, timeout=30) as response:
        if response.status != 200 or not safe_url(response.url):
            raise ValueError("invalid_response_or_redirect")
        data = response.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise ValueError("empty_or_oversized_media")
    with Image.open(BytesIO(data)) as image:
        image.load()
        if image.format not in ("JPEG", "PNG", "WEBP"):
            raise ValueError("invalid_media_format")
        size = image.size
        preview = ImageOps.contain(image.convert("RGB"), (TILE_W-16, TILE_H-95))
    return preview, size, hashlib.sha256(data).hexdigest()


def main():
    document = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = document["entries"]
    if (document.get("read_only") is not True or document.get("do_not_approve") is not True
            or document.get("release_to_publish_authorized") is not False
            or document.get("record_count") != 12 or document.get("candidate_slide_count") != 82
            or tuple(sorted(e["output_number"] for e in entries)) != OUTPUTS):
        raise SystemExit("unsafe_or_stale_manifest")
    DEST.mkdir(parents=True, exist_ok=True)
    receipts = []
    for entry in entries:
        number = entry["output_number"]
        slides = entry["slide_candidates"]
        if (entry["do_not_publish"] is not True or entry["publication_authorized"] is not False
                or len(slides) != entry["candidate_slide_count"]
                or [s["slide"] for s in slides] != list(range(1, len(slides)+1))
                or len(set(s["cdn_url"] for s in slides)) != len(slides)):
            raise SystemExit("hold_or_slide_manifest_mismatch")
        rows = (len(slides) + COLS - 1) // COLS
        sheet = Image.new("RGB", (COLS*TILE_W, rows*TILE_H+90), "#f3f3f3")
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 8), f"OUTPUT #{number} - UNVERIFIED SOURCE IMAGES", fill="#a00000")
        draw.text((12, 32), "DO NOT APPROVE / SCHEDULE / PUBLISH | 4:5 review | watermark + location pending", fill="#a00000")
        per_output = []
        for i, slide in enumerate(slides):
            x = (i % COLS)*TILE_W
            y = (i // COLS)*TILE_H+90
            preview, (width, height), sha = fetch_image(slide["cdn_url"])
            sheet.paste(preview, (x+(TILE_W-preview.width)//2, y+24))
            draw.text((x+8, y+3), f"SLIDE {i+1} | {width}x{height}", fill="#111111")
            draw.text((x+8, y+TILE_H-59), f"4:5 {'YES' if width*5 == height*4 else 'NO - REPAIR'}", fill="#a00000" if width*5 != height*4 else "#006020")
            draw.text((x+8, y+TILE_H-37), "BRAND / RIGHTS / LOCATION: UNVERIFIED", fill="#a00000")
            per_output.append({"slide":i+1,"sha256":sha,"width":width,"height":height,
                               "exact_4x5":width*5==height*4,
                               "media_asset_id":slide["media_asset_id"],
                               "source_variant_drive_id":slide["source_variant_drive_id"],
                               "url":slide["cdn_url"],"creative_approved":False})
        name=f"output-{number}-UNVERIFIED-review.jpg"
        sheet.save(DEST/name, quality=90)
        receipts.append({"output_number":number,"sheet":name,"slides":per_output,
                         "review_required":True,"publication_authorized":False})
        print(f"CREATIVE_CONTACT_SHEET={number} {name} slides={len(slides)}")
    result={"schema":"issue2294_unverified_visual_review_v1","read_only":True,
            "database_writes":0,"provider_calls":0,"approval_calls":0,"hold_releases":0,
            "output_count":len(receipts),"slide_count":sum(len(x["slides"]) for x in receipts),
            "human_creative_approval":False,"outputs":receipts}
    (DEST/"review-evidence.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    assert result["output_count"]==12 and result["slide_count"]==82
    print("CREATIVE_CONTACT_SHEETS_COMPLETE=12 outputs 82 unverified images")


if __name__ == "__main__":
    main()
