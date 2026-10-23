/**
 * Validated, deterministic portion of Conversational Producer planning.
 * This module intentionally never claims that AI-requested media exists:
 * callers must supply a resolved asset manifest from the classified inventory.
 */
const changeStages = Object.freeze({
  add_photos: ["media_selection", "timeline", "render", "quality"],
  replace_media: ["media_selection", "timeline", "render", "quality"],
  reorder_media: ["media_selection", "timeline", "render", "quality"],
  trim_clip: ["timeline", "render", "quality"],
  add_clip: ["media_selection", "timeline", "render", "quality"],
  adjust_timing: ["timeline", "audio_sync", "render", "quality"],
  rewrite_narration: ["script", "voiceover", "audio_sync", "timeline", "render", "quality"],
  replace_music: ["audio_mix", "render", "quality"],
  onscreen_text: ["timeline", "render", "quality"],
  metadata_only: ["metadata", "quality"],
});
const supported = new Set(Object.keys(changeStages));
const text = (v) => typeof v === "string" ? v.trim() : "";
const ids = (items) => [...new Set(items.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))];

export function validateProducerPlan(input, inventory = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Producer Plan must be an object");
  const originalPrompt = text(input.original_prompt);
  if (!originalPrompt) throw new TypeError("Original creative direction is required");
  const profileId = text(input.profile_id);
  if (!profileId) throw new TypeError("Profile is required");
  if (!Array.isArray(inventory)) throw new TypeError("Resolved inventory must be an array");
  const manifest = new Map(inventory.filter((asset) => asset && typeof asset.id === "string").map((asset) => [asset.id, asset]));
  const required = ids(input.required_asset_ids ?? []);
  const excluded = ids(input.excluded_asset_ids ?? []);
  const errors = [];
  for (const id of required) {
    const asset = manifest.get(id);
    if (!asset) errors.push({ code: "REQUIRED_ASSET_UNRESOLVED", asset_id: id });
    else if (asset.profile_id !== profileId && asset.cross_profile_authorized !== true)
      errors.push({ code: "CROSS_PROFILE_ASSET", asset_id: id });
    if (excluded.includes(id)) errors.push({ code: "ASSET_REQUIRED_AND_EXCLUDED", asset_id: id });
  }
  const changes = ids(input.changes ?? []);
  for (const change of changes) if (!supported.has(change)) errors.push({ code: "UNSUPPORTED_CHANGE", change });
  const seconds = input.target_duration_seconds;
  if (seconds != null && (!Number.isFinite(seconds) || seconds <= 0))
    errors.push({ code: "INVALID_DURATION" });
  return {
    valid: errors.length === 0,
    errors,
    plan: {
      original_prompt: originalPrompt,
      profile_id: profileId,
      required_asset_ids: required,
      excluded_asset_ids: excluded,
      target_duration_seconds: seconds ?? null,
      changes,
      preserve: ids(input.preserve ?? []),
    },
  };
}

export function planSelectiveRework(validatedPlan) {
  if (!validatedPlan?.valid || !validatedPlan.plan) throw new Error("A validated Producer Plan is required");
  const stages = new Set();
  for (const change of validatedPlan.plan.changes) {
    for (const stage of changeStages[change]) stages.add(stage);
  }
  return {
    stages: [...stages],
    requires_render: stages.has("render"),
    requires_fresh_approval: true,
  };
}

export function validateRevisionDispatch({ current_revision, job_revision, approved_revision, revision_pending, published, held }) {
  if (published || held || revision_pending) return { allowed: false, reason: "OUTPUT_NOT_PUBLISHABLE" };
  if (!current_revision || current_revision !== job_revision) return { allowed: false, reason: "STALE_REVISION" };
  if (approved_revision !== current_revision) return { allowed: false, reason: "REVISION_NOT_APPROVED" };
  return { allowed: true, reason: null };
}
