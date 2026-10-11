// Keep these helpers aligned with apps/studio-web/assets/app-item4-0621.js
// and apps/studio-api/worker.js (studioMappedPreviewUrl, studioPreviewKind)
// plus renderCreativeTiktokComplete / tiktokNeedsUrlEntry.

export function item4LooksLikeImage(url) {
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(String(url || ""));
}

export function item4LooksLikeVideo(url) {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(url || ""))
    || /\/current\.mp4/i.test(String(url || ""));
}

export function item4LooksLikeDriveFile(url) {
  return /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?)/i.test(String(url || ""));
}

export function item4OutputHasVideoFinal(output = {}) {
  if (String(output.final_file_id || "").trim()) return true;
  return [output.final_file_url, output.output_url, output.publish_asset_url, output.studio_preview_url]
    .map((value) => String(value || "").trim())
    .some((href) => href && (item4LooksLikeVideo(href) || item4LooksLikeDriveFile(href)));
}

export function item4MappedStudioPreviewUrl(output = {}, stillUrl = "") {
  const stored = String(output.studio_preview_url || "").trim();
  if (item4OutputHasVideoFinal(output) && output.id) return `/api/outputs/${encodeURIComponent(output.id)}/preview`;
  if (stored && item4LooksLikeVideo(stored)) return stored;
  return stored || String(stillUrl || "").trim() || null;
}

export function item4PreviewKind(output = {}, { nativePhoto = false, stillUrl = "" } = {}) {
  const stored = String(output.studio_preview_url || "").trim();
  const finalUrl = String(output.final_file_url || "").trim();
  if (!nativePhoto && item4OutputHasVideoFinal(output)) return "video";
  if (stored && item4LooksLikeVideo(stored)) return "video";
  if (finalUrl && item4LooksLikeVideo(finalUrl)) return "video";
  if (nativePhoto && (stillUrl || item4LooksLikeImage(stored))) return "still";
  if (stored && item4LooksLikeImage(stored) && !item4OutputHasVideoFinal(output)) return "still";
  if (stored || finalUrl) return "video";
  return stillUrl ? "still" : "none";
}

export function item4ReviewWatchUrl(output = {}) {
  if (output.id && item4OutputHasVideoFinal(output)) {
    return `/api/outputs/${encodeURIComponent(output.id)}/preview`;
  }
  return String(output.studio_preview_url || output.final_file_url || "").trim();
}

export function item4PreviewPlayerFallback(output = {}) {
  return item4OutputHasVideoFinal(output) ? "native" : "cover";
}

export function item4IsTikTokOutput(output = {}) {
  return String(output.platform || "").trim().toLowerCase() === "tiktok";
}

export function item4TiktokLiveUrl(output = {}) {
  return String(output.platform_post_url || output.manual_published_url || "").trim();
}

export function item4TiktokNeedsUrlEntry(output = {}) {
  if (!item4IsTikTokOutput(output)) return false;
  if (output.do_not_publish) return false;
  const publish = String(output.publish_status || "").trim().toLowerCase();
  const status = String(output.output_status || "").trim().toLowerCase();
  const draft = String(output.tiktok_draft_status || "").trim().toLowerCase();
  if (publish === "published" || status === "published" || draft === "published") return false;
  const manual = String(output.manual_completion_status || "").trim().toLowerCase();
  const studio = String(output.studio_state || "").trim().toLowerCase();
  return manual === "required"
    || studio.includes("manual action")
    || studio === "draft delivered"
    || draft.includes("manual action")
    || draft.includes("draft delivered")
    || draft.includes("manual completion received");
}

export function item4ShowTiktokCompleteCard(output = {}) {
  if (!item4IsTikTokOutput(output)) return false;
  return item4TiktokNeedsUrlEntry(output) || Boolean(item4TiktokLiveUrl(output));
}

export function item4MixInProgress(output = {}, handoff = null) {
  if (handoff?.completed || handoff?.overall_status === "complete" || handoff?.overall_status === "idle") return false;
  if (item4OutputHasVideoFinal(output) && !(handoff?.active && handoff?.overall_status === "active")) return false;
  const render = String(output.render_status || "").trim();
  const status = String(output.output_status || "").trim();
  if (["Ready for Render", "Rendering"].includes(render)) return true;
  if (status === "In Production" && !String(output.final_file_url || "").trim() && !String(output.studio_preview_url || "").trim()) {
    return Boolean(handoff?.active && handoff?.overall_status === "active");
  }
  if (status === "In Production" && (["Ready for Render", "Rendering"].includes(render) || (handoff?.active && handoff?.overall_status === "active"))) return true;
  return Boolean(handoff?.active && handoff?.overall_status === "active");
}
