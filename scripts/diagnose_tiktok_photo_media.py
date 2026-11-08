"""Read-only public CDN probe for TikTok photo draft delivery.

Tests the exact R2 public URLs held in the six failed 2026-11-08
Platform Outputs. No TikTok API calls, credentials or mutations.
"""
import concurrent.futures
import urllib.error
import urllib.request

OUTPUTS = (
    (9921, "rec3FO174xdgwM4mu", 8),
    (9897, "recH1C9xp9LwHHsAR", 4),
    (9907, "recRg41NO885N7Rxz", 4),
    (9869, "recWuGqtBA1cZ7SuV", 4),
    (9884, "recc6jsIUkCyuxoGc", 4),
    (9910, "recxChzJygYjPs4fl", 8),
)
HOST = "https://media.chicagoshining.com"

def public_urls():
    for output_id, record_id, count in OUTPUTS:
        yield output_id, "cover", f"{HOST}/publish/platform-output-{output_id}/cover.jpg"
        for index in range(count):
            yield output_id, f"slide-{index}", f"{HOST}/studio/previews/lettered/{record_id}/{index}.jpg"

def check(item):
    output_id, label, url = item
    headers = {
        "User-Agent": "Mozilla/5.0 TikTokPhotoDeliveryPreflight/1.0",
        "Accept": "image/jpeg,image/png,image/webp,*/*",
        "Range": "bytes=0-16383",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=25) as response:
            status = response.status
            media_type = response.headers.get("Content-Type", "").split(";")[0].lower()
            chunk = response.read(32)
            valid = chunk.startswith(b"\\xff\\xd8\\xff") or chunk.startswith(b"\\x89PNG\\r\\n\\x1a\\n") or (chunk.startswith(b"RIFF") and chunk[8:12] == b"WEBP")
            challenge = response.headers.get("cf-mitigated", "")
            length = response.headers.get("Content-Length", "unknown")
            ok = status in {200, 206} and valid and media_type in {"image/jpeg","image/png","image/webp"} and not challenge
            return ok, f"output={output_id} asset={label} http={status} type={media_type or 'missing'} content_length={length} image_signature={valid} cf_mitigated={challenge or 'none'} url={url}"
    except Exception as exc:
        return False, f"output={output_id} asset={label} ERROR={type(exc).__name__}: {exc} url={url}"

def main():
    targets = list(public_urls())
    print(f"Checking {len(targets)} public photo URLs across {len(OUTPUTS)} failed drafts")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, targets))
    for ok, line in results:
        print(("PASS " if ok else "FAIL ") + line, flush=True)
    failures = [line for ok, line in results if not ok]
    print(f"Results: {len(results) - len(failures)}/{len(results)} media URLs passed")
    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
