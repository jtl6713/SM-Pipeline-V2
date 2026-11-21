/**
 * Protect an explicitly approved story-first Production handoff from ordinary
 * output-plan forms that accidentally collapse six sources to a single photo.
 * The proof is the exact ordered Media Asset IDs from the persisted directives,
 * not an untrusted client-reported scene count.
 */
const marker = "[story-first-production.1] ";

export function reconcileApprovedStoryFirstSourcePlan(notes, assets, plan) {
  const source = String(notes || "");
  const directiveLines = source.split(/\r?\n/).filter(line => line.startsWith(marker));
  if (!directiveLines.length) return { kind: "not_story", plan };
  if (directiveLines.length !== 1)
    return { kind: "invalid", reason: "Multiple storyboard production directives; review required" };
  let story;
  try { story = JSON.parse(directiveLines[0].slice(marker.length)); }
  catch { return { kind: "invalid", reason: "Stored production storyboard is invalid" }; }
  if (story?.schema !== "story-first-production.1" || !Array.isArray(story.scenes) || !story.scenes.length)
    return { kind: "invalid", reason: "Stored production storyboard schema is invalid" };
  if (!Array.isArray(assets) || story.scenes.length !== assets.length)
    return { kind: "invalid", reason: "Approved storyboard scene count differs from selected masters" };
  const ids = story.scenes.map(scene => String(scene?.asset_id || "").trim());
  if (ids.some((id,index) => !/^rec[A-Za-z0-9]{14}$/.test(id) ||
    id !== String(assets[index]?.media_asset_record_id || "").trim()))
    return { kind: "invalid", reason: "Approved storyboard master IDs or order changed" };
  if (!plan || !Array.isArray(plan.items) || !plan.items.length)
    return { kind: "invalid", reason: "No saved platform output plan" };
  const count = assets.length;
  const stale = Number(plan.source_asset_count) !== count ||
    plan.photo_count_kind !== (count <= 1 ? "single-photo" : "multiple-photos") ||
    plan.items.some(item => Number(item?.source_asset_count) !== count);
  if (!stale) return { kind: "ready", plan, count };
  // Preserve every existing platform, destination, companion flag and ratio.
  // Source count is editorial inventory, never permission to auto-publish.
  const corrected = {
    ...plan,
    source_asset_count: count,
    photo_count_kind: count <= 1 ? "single-photo" : "multiple-photos",
    items: plan.items.map(item => ({ ...item, source_asset_count: count })),
  };
  return { kind: "repair", plan: corrected, count };
}
