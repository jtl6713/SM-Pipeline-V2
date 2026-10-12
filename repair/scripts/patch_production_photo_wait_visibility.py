#!/usr/bin/env python3
"""Apply the bounded, idempotent Production photo-wait visibility repair."""
from pathlib import Path
import re
worker = Path("apps/studio-api/worker.js")
source = worker.read_text()
anchor = "async function listProductionRequests(request, env, url, authorization) {"
old = """  const visible = filtered.filter((record) => {
    const ideaId = ideaRecordIdFromProductionRequest(record);
    return !ideaId || photoWaitStates.get(ideaId) !== "Waiting";
  });"""
new = """  const visible = filtered.filter((record) => {
    const ideaId = ideaRecordIdFromProductionRequest(record);
    return !ideaId || !productionRequestPhotoWaitHidden(record, photoWaitStates.get(ideaId));
  });"""
helper = """// QA-PRODUCTION-PHOTO-WAIT: a stale Idea 'Waiting' flag must not hide an
// operator-owned draft with exact narration and attached photos. Untouched
// photo-listening shells remain hidden until they actually enter Production.
function productionRequestPhotoWaitHidden(record, ideaWait) {
  if (String(ideaWait || "").trim() !== "Waiting") return false;
  const notes = String(f(record, "Production_Notes") || "");
  if (productionPhotoWaitAutoOff(notes)) return false;
  const assetCount = Number(f(record, "Studio_Master_Asset_Count") || 0);
  if (assetCount > 0 && timedScriptFromNotes(notes)?.segments?.some(
    segment => String(segment?.voiceover_text || "").trim()
  )) return false;
  return true;
}

"""
if "function productionRequestPhotoWaitHidden(" in source and old not in source:
    print("Already patched; no changes needed")
    raise SystemExit(0)
assert source.count(anchor) == 1, "Production route anchor changed"
assert source.count(old) == 1, "Exact old filter changed"
assert "function productionRequestPhotoWaitHidden(" not in source, "Unexpected existing helper"
source = source.replace(anchor, helper + anchor, 1).replace(old, new, 1)
source, n = re.subn(r'version: "0[.]10[.]560-ops-phase-open"', 'version: "0.10.561-production-photo-wait-visibility"', source, count=1)
assert n == 1, "Expected Worker source version changed; inspect before re-running"
assert source.count("function productionRequestPhotoWaitHidden(") == 1
worker.write_text(source)
with Path("deploy/cloudflare-worker-production.txt").open("a") as out:
    out.write(chr(10) + "2026-10-12 Worker 0.10.561-production-photo-wait-visibility: keep prepared Production drafts visible when Idea photo-wait flag is stale." + chr(10))
print("Patched Worker Production photo-wait visibility and deployment marker")
