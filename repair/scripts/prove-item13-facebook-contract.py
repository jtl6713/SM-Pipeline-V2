#!/usr/bin/env python3
"""Assert Item 13 Facebook native multi-photo default without starting Make."""

from __future__ import annotations

import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKER = (ROOT / "apps/studio-api/worker.js").read_text(encoding="utf-8")
WEB_JS = (ROOT / "apps/studio-web/assets/app-item4-0619.js").read_text(encoding="utf-8")
WEB_HTML = (ROOT / "apps/studio-web/index.html").read_text(encoding="utf-8")


def main():
    out = Path(os.environ.get("ITEM13_EVIDENCE", "/tmp/item13-facebook-contract-proof.json"))
    checks = {
        "worker_health_default": 'item4_facebook_default_output: "Multi-Image Post"' in WORKER,
        "worker_health_object": 'item4_facebook_photo_object: "native_multi_photo"' in WORKER,
        "worker_slideshow_opt_in": "item4_facebook_slideshow_reel_opt_in: true" in WORKER,
        "worker_plan_default": 'default_output_type: "Multi-Image Post"' in WORKER,
        "worker_plan_not_slideshow_default": 'Facebook: Object.freeze({\n    default_output_type: "Slideshow Reel"' not in WORKER,
        "worker_native_object_route": 'facebook_object: "native_multi_photo"' in WORKER,
        "worker_mapping": 'proven_mapping: "Facebook Photo Set"' in WORKER,
        "web_photo_set_default": '"Photo Set": {Instagram:"Reel", Facebook:"Multi-Image Post", TikTok:"Multi-Photo", YouTube:"Slideshow Video"}' in WEB_JS,
        "web_carousel_still_native": '"Carousel": {Instagram:"Carousel", Facebook:"Multi-Image Post", TikTok:"Multi-Photo"}' in WEB_JS,
        "web_video_still_reel": '"Vertical Short Video": {Instagram:"Reel", Facebook:"Reel", TikTok:"Video Draft", YouTube:"Short"}' in WEB_JS,
        "html_native_label": "Multi-Image Post (native album)" in WEB_HTML,
        "html_opt_in_label": "Slideshow Reel (optional 9:16 from photos)" in WEB_HTML,
        "html_values_unchanged": 'value="Multi-Image Post"' in WEB_HTML and 'value="Slideshow Reel"' in WEB_HTML,
    }
    evidence = {
        "repair_item": 13,
        "checkpoint": "facebook-native-multi-photo-default",
        "decision": "native_multi_photo_default",
        "opt_in": "Slideshow Reel",
        "shot_video_default": "Reel",
        "make_scenario_runs": 0,
        "checks": checks,
        "passed": all(checks.values()),
    }
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"passed": evidence["passed"], "path": str(out)}, indent=2))
    if not evidence["passed"]:
        failed = [name for name, ok in checks.items() if not ok]
        raise SystemExit(f"Item 13 contract proof failed: {failed}")


if __name__ == "__main__":
    main()
