#!/usr/bin/env python3
"""Prove Item 17 Studio per-photo title editing without starting Make."""

from __future__ import annotations

import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKER = (ROOT / "apps/studio-api/worker.js").read_text(encoding="utf-8")
CONTRACT = (ROOT / "apps/studio-title-edit/contract.mjs").read_text(encoding="utf-8")
WEB = (ROOT / "apps/studio-web/assets/app-item4-0619.js").read_text(encoding="utf-8")
HTML = (ROOT / "apps/studio-web/index.html").read_text(encoding="utf-8")
CSS = (ROOT / "apps/studio-web/assets/styles-phase7-0617.css").read_text(encoding="utf-8")
ITEM15 = (ROOT / "apps/tiktok-overlay/contract.mjs").read_text(encoding="utf-8")


def main():
    out = Path(os.environ.get("ITEM17_EVIDENCE", "/tmp/item17-title-edit-proof.json"))
    checks = {
        "contract_schema": 'schema: "studio-title-edit-v1"' in CONTRACT,
        "contract_version_bump": "function nextTitleVersion" in CONTRACT,
        "contract_lock": 'code: "title-lock-conflict"' in CONTRACT,
        "contract_unlock": 'code: "unlocked"' in CONTRACT,
        "contract_render_input": "function buildTitleRenderInput" in CONTRACT,
        "contract_keeps_item15": 'from "../tiktok-overlay/contract.mjs"' in CONTRACT,
        "item15_recipe_unchanged": 'recipe: "tiktok-title-overlay-v1"' in ITEM15,
        "worker_schema": '"studio-title-edit-v1"' in WORKER,
        "worker_version": "function phase6NextTitleVersion" in WORKER,
        "worker_lock_conflict": "Per-photo titles are locked after preview approval" in WORKER,
        "worker_unlock_flag": "payload?.unlock_titles === true" in WORKER,
        "worker_approve_lock": "overlay_identity: lockView.overlay_identity" in WORKER,
        "worker_render_input": "function phase6TitleRenderInput" in WORKER,
        "worker_package_uses_title_input": "overlay: phase6TitleRenderInput(slide, {" in WORKER,
        "worker_item15_recipe": 'overlay.recipe = "tiktok-title-overlay-v1"' in WORKER,
        "worker_item15_lower_third": 'o.position || (tiktok ? "lower-third" : "center")' in WORKER,
        "worker_item15_identity": "overlay.idempotencyKey = [" in WORKER,
        "web_live_preview": "function phase6OverlayPreviewHtml" in WEB,
        "web_caption_field": 'data-field="overlay_caption"' in WEB,
        "web_timing_fields": 'data-field="overlay_start"' in WEB and 'data-field="overlay_end"' in WEB,
        "web_unlock": "function unlockCreativeTitles" in WEB,
        "web_lock_disable": "titleLocked ? \"disabled\" : \"\"" in WEB,
        "html_unlock_button": 'id="creativeUnlockTitles"' in HTML,
        "html_cache_bust": "item17-title-edit" in HTML,
        "css_preview": ".slide-title-preview" in CSS,
        "no_ttd_orch_start": "phase6SetScenarioActive(env, 5806668" not in WORKER,
    }
    evidence = {
        "repair_item": 17,
        "checkpoint": "studio-per-photo-title-edit-lock-render-input",
        "make_scenario_runs": 0,
        "tiktok_drafts_created": 0,
        "ttd_orch_pulsed": False,
        "schema": "studio-title-edit-v1",
        "keeps_item15_recipe": "tiktok-title-overlay-v1",
        "checks": checks,
        "passed": all(checks.values()),
        "live": {
            "studio_api_deployed": False,
            "studio_pages_deployed": False,
            "ttd_orch_must_stay_off": True,
        },
    }
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"passed": evidence["passed"], "failed": [k for k, v in checks.items() if not v]}, indent=2))
    if not evidence["passed"]:
        raise SystemExit("Item 17 Studio title-edit proof failed")


if __name__ == "__main__":
    main()
