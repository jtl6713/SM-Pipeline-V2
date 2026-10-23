/**
 * Independent QA for the ACTUAL source selection on rendered Platform Outputs.
 * A changed Production Request manifest alone is not evidence of a new render.
 * Fail closed if the runner did not persist its per-output selected source list.
 */
function selectedClips(raw) {
  let data = raw;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return null; }
  }
  return data && Array.isArray(data.selected_clips) ? data : null;
}
function seconds(clip, names) {
  for (const field of names) {
    const value = clip?.[field];
    if (value != null && value !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}
function matchSequence(ids, expectedIds) {
  let cursor = -1;
  for (const id of ids) {
    cursor = expectedIds.indexOf(id, cursor + 1);
    if (cursor < 0) return false;
  }
  return true;
}
export function verifyFactoryRenderedMedia({
  expectedAssets,
  outputs,
  requestId,
  changes = [],
  changedAssetIds = [],
}) {
  const failures = [];
  const expected = Array.isArray(expectedAssets) ? expectedAssets : [];
  const candidates = Array.isArray(outputs) ? outputs : [];
  if (!expected.length || !candidates.length) return ["Missing expected assets or revised output records"];
  const ordered = [...expected].sort((a,b) => Number(a?.order || 0) - Number(b?.order || 0));
  const expectedIds = ordered.map(a => String(a?.id || "").trim());
  const byId = new Map(ordered.map(a => [String(a?.id || "").trim(), a]));
  const byMediaId = new Map(ordered.map(a => [String(a?.media_asset_record_id || "").trim(), String(a?.id || "").trim()]));
  if (expectedIds.some(id => !id) || new Set(expectedIds).size !== expectedIds.length) {
    return ["Ambiguous expected source asset identities"];
  }
  const requireOrder = changes.includes("reorder_media") || changes.includes("add_photos") || changes.includes("add_clip") || changes.includes("remove_media");
  const requireTrim = changes.includes("trim_clip");
  const requiredIds = new Set(changedAssetIds.filter(id => byId.has(String(id))).map(String));
  if (changedAssetIds.some(id => !byId.has(String(id))) && !changes.includes("remove_media")) {
    failures.push("Changed media asset is missing from the revised manifest");
  }
  const seen = new Set();
  let fullSequenceSeen = false;
  for (const output of candidates) {
    const id = String(output?.id || "(unknown)");
    const selected = selectedClips(output?.selected_assets_json);
    if (!selected?.selected_clips?.length) {
      failures.push(`Output ${id}: no authoritative selected-asset render evidence`);
      continue;
    }
    if (String(selected.production_request_record_id || "") !== String(requestId || "")) {
      failures.push(`Output ${id}: source selection belongs to a different Production Request`);
      continue;
    }
    const chosen = [];
    const source = selected.selected_clips;
    let invalid = false;
    for (const clip of source) {
      const mediaId = String(clip?.media_asset_record_id || clip?.mediaAssetRecordId || "").trim();
      const sourceId = String(clip?.source_asset_id || clip?.sourceAssetId || "").trim() || byMediaId.get(mediaId) || "";
      const asset = byId.get(sourceId);
      if (!asset || (mediaId && String(asset.media_asset_record_id || "") && mediaId !== String(asset.media_asset_record_id))) {
        failures.push(`Output ${id}: rendered an unrequested or cross-profile asset`);
        invalid = true;
        break;
      }
      chosen.push(sourceId);
      seen.add(sourceId);
      if (requireTrim && requiredIds.has(sourceId)) {
        const from = seconds(clip, ["sourceInSeconds","source_in_seconds","in_seconds","inSeconds"]);
        const to = seconds(clip, ["sourceOutSeconds","source_out_seconds","out_seconds","outSeconds"]);
        if (from == null || to == null
          || Math.abs(from - Number(asset.in_seconds)) > 0.05
          || Math.abs(to - Number(asset.out_seconds)) > 0.05) {
          failures.push(`Output ${id}: clip trim does not match the requested source interval`);
        }
      }
    }
    if (invalid) continue;
    // Stories may legitimately use a subset, but their source order still
    // cannot contradict the requested scene sequence.
    if (requireOrder && !matchSequence(chosen, expectedIds)) {
      failures.push(`Output ${id}: selected scenes are out of the requested order`);
    }
    if (chosen.length === expectedIds.length && chosen.every((asset,i) => asset === expectedIds[i])) fullSequenceSeen = true;
  }
  if (requireOrder && !fullSequenceSeen) failures.push("No completed output proves the entire requested media sequence");
  for (const id of requiredIds) if (!seen.has(id)) failures.push(`Requested media asset ${id} is absent from the rendered output selections`);
  return [...new Set(failures)];
}
