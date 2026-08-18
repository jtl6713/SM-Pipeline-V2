#!/usr/bin/env python3
"""Prove Item 15 TikTok per-photo overlay contract without starting Make."""

from __future__ import annotations

import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKER = (ROOT / "apps/studio-api/worker.js").read_text(encoding="utf-8")
CONTRACT = (ROOT / "apps/tiktok-overlay/contract.mjs").read_text(encoding="utf-8")
RENDERER = (ROOT / "services/remotion-renderer/src/ChicagoShiningPhotoSequence.tsx").read_text(encoding="utf-8")


def main():
    out = Path(os.environ.get("ITEM15_EVIDENCE", "/tmp/item15-tiktok-overlay-proof.json"))
    checks = {
        "contract_recipe": 'recipe: "tiktok-title-overlay-v1"' in CONTRACT,
        "contract_centered_4x5": "critical_4x5: Object.freeze({ width: 1080, height: 1350 })" in CONTRACT,
        "contract_safe_area_285": "safe_area: Object.freeze({ top: 285, right: 78, bottom: 285, left: 78 })" in CONTRACT,
        "contract_timing": "default_start_fraction: 0" in CONTRACT and "default_end_fraction: 1" in CONTRACT,
        "contract_identity": "function overlayIdentityKey" in CONTRACT,
        "worker_recipe": 'overlay.recipe = "tiktok-title-overlay-v1"' in WORKER,
        "worker_tiktok_lower_third": 'o.position || (tiktok ? "lower-third" : "center")' in WORKER,
        "worker_timing": "startFraction: Math.min(startFraction, endFraction)" in WORKER,
        "worker_identity": 'overlay.idempotencyKey = [' in WORKER,
        "worker_slide_name_fallback": 'o.text || (tiktok ? slide?.name : "")' in WORKER,
        "renderer_tiktok_mode": 'mode === "tiktok-9x16"' in RENDERER,
        "renderer_tiktok_insets": "return {top: 285, right: 78, bottom: 285, left: 78}" in RENDERER,
        "renderer_default_9x16_unchanged": "return {top: 190, right: 78, bottom: 270, left: 78}" in RENDERER,
        "renderer_passes_safe_area": "safeArea={overlay?.safeArea}" in RENDERER,
    }
    evidence = {
        "repair_item": 15,
        "checkpoint": "tiktok-per-photo-title-overlay-contract",
        "make_scenario_runs": 0,
        "tiktok_drafts_created": 0,
        "ttd_orch_pulsed": False,
        "recipe": "tiktok-title-overlay-v1",
        "safe_area": {"top": 285, "right": 78, "bottom": 285, "left": 78},
        "critical_4x5": {"width": 1080, "height": 1350},
        "checks": checks,
        "passed": all(checks.values()),
    }
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"passed": evidence["passed"], "failed": [k for k, v in checks.items() if not v]}, indent=2))
    if not evidence["passed"]:
        raise SystemExit("Item 15 TikTok overlay contract proof failed")


if __name__ == "__main__":
    main()
