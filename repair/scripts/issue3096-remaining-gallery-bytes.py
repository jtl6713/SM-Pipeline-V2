"""Read-only exact remaining gallery media audit; never authorize publication."""
from concurrent.futures import ThreadPoolExecutor
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
spec = spec_from_file_location("prior_cdn_audit", ROOT / "repair/scripts/issue3096-13-approved-fb-gallery-cdn.py")
audit = module_from_spec(spec)
spec.loader.exec_module(audit)

def main():
    manifest = json.loads((ROOT / "repair/manifests/issue3096-remaining-gallery-bytes.json").read_text())
    assert manifest["schema"] == "issue3096_remaining_gallery_bytes_v1"
    assert manifest["read_only"] is True and manifest["publication_authorized"] is False
    entries = manifest["entries"]
    assert [e["output"] for e in entries] == [10202, 10251, 10313, 10373, 10430, 10503]
    batch = {}
    for e in entries:
        positions = e["positions"]
        assert len(positions) in (4, 8)
        assert [p["position"] for p in positions] == list(range(1, len(positions) + 1))
        for p in positions:
            assert len(p["observed"]) == (1 if e["output"] == 10430 else 2)
            for url in [p["expected_url"]] + [s["url"] for s in p["observed"]]:
                assert audit.safe(url)
                assert url.startswith("https://media.chicagoshining.com/studio/previews/lettered/" + e["record_id"] + "/")
                batch.setdefault(url, (e["output"], {"slide": p["position"], "slide_id": p["observed"][0]["slide_id"], "cdn_url": url}))
    assert len(batch) == 40
    urls = list(batch)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = dict(zip(urls, pool.map(audit.check, [batch[u] for u in urls])))
    dispositions = []
    for e in entries:
        positions = []
        hashes = {}
        for p in e["positions"]:
            expected = results[p["expected_url"]]
            observed = [{"slide_id": s["slide_id"], "url": s["url"], "verified": results[s["url"]]["verified"],
                         "same_bytes_as_expected": bool(expected["verified"] and results[s["url"]]["verified"] and
                         expected["sha256"] == results[s["url"]]["sha256"])} for s in p["observed"]]
            positions.append({"position": p["position"], "expected_verified": expected["verified"],
                              "expected_url": p["expected_url"], "observed": observed})
            if expected["verified"]:
                hashes.setdefault(expected["sha256"], []).append(p["position"])
        dispositions.append({"output": e["output"], "all_expected_verified": all(p["expected_verified"] for p in positions),
                             "duplicate_byte_positions": [v for v in hashes.values() if len(v) > 1],
                             "mismatched_observed_positions": [p["position"] for p in positions if not all(s["same_bytes_as_expected"] for s in p["observed"])],
                             "positions": positions})
    report = {"read_only": True, "publication_authorized": False, "output_writes": 0, "provider_writes": 0,
              "verified_urls": sum(r["verified"] for r in results.values()), "total_urls": len(results),
              "dispositions": dispositions, "images": results}
    Path("/tmp/issue3096-remaining-gallery-bytes.json").write_text(json.dumps(report, indent=2))
    print("ISSUE3096_REMAINING=" + json.dumps({**{k:v for k,v in report.items() if k not in ("images","dispositions")},
          "dispositions":[{k:v for k,v in d.items() if k!="positions"} for d in dispositions]}, separators=(",",":")))

if __name__ == "__main__":
    main()
