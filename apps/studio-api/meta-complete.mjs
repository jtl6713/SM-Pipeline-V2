// Keep aligned with apps/studio-api/worker-functions-04.mjs extract markers
// (Studio Instagram / Facebook manual URL confirmation).

export function isMetaPostUrl(url, platform = "") {
  const value = String(url || "").trim();
  if (!value) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const plat = String(platform || "").trim().toLowerCase();
  const instagram = host === "instagram.com" || host.endsWith(".instagram.com");
  const facebook = host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch";
  if (plat === "instagram") return instagram;
  if (plat === "facebook") return facebook;
  return instagram || facebook;
}

export function metaCompleteEligibility(record = {}) {
  const platform = String(record.platform || "").trim().toLowerCase();
  if (platform !== "instagram" && platform !== "facebook") return "not_meta";
  if (record.do_not_publish) return "do_not_publish";
  const publish = String(record.publish_status || "").trim().toLowerCase();
  const output = String(record.output_status || "").trim().toLowerCase();
  if (publish === "published" || publish === "published privately" || output === "published") {
    return "already_published";
  }
  if (/^https?:\/\//i.test(String(record.platform_post_url || record.manual_published_url || "").trim())) {
    return "already_published";
  }
  const studio = String(record.studio_state || "").trim().toLowerCase();
  const manual = String(record.manual_completion_status || "").trim().toLowerCase();
  const awaiting = studio.includes("manual action")
    || manual === "required"
    || record.manual_fallback_required === true
    || publish.includes("manual publish required");
  if (!awaiting) return "manual_completion_not_required";
  return null;
}

export function metaNeedsUrlEntry(record) {
  return metaCompleteEligibility(record) === null;
}

export function metaManualPublishFields({ url, now, existingNotes = "", platform = "" } = {}) {
  const stamp = String(now || "").trim() || new Date().toISOString();
  const liveUrl = String(url || "").trim();
  const label = String(platform || "Meta").trim() || "Meta";
  const note = `Studio ${label} publication confirmed at ${stamp}. URL: ${liveUrl}`;
  const notes = String(existingNotes || "").trim() ? `${String(existingNotes).trim()}\n\n${note}` : note;
  return {
    Do_Not_Publish: false,
    Publish_Locked_At: null,
    Publish_Locked_By: "",
    Publish_Started_At: null,
    Output_Notes: notes.slice(0, 10000),
    Published_At: stamp,
    Output_Status: "Published",
    Publish_Status: "Published",
    Platform_Post_URL: liveUrl,
    Manual_Published_URL: liveUrl,
    Manual_Completion_At: stamp,
    Manual_Completion_Status: "Completed",
    Manual_Fallback_Required: false,
    Publish_Error_Stage: "",
    Publish_Error_Message: "",
    Publish_Next_Retry_At: null,
    Publish_Retry_Eligible: false,
  };
}

export const META_COMPLETE_ERRORS = {
  not_meta: "This action is only for Instagram or Facebook outputs.",
  do_not_publish: "This output is held with Do Not Publish.",
  already_published: "This output is already published.",
  manual_completion_not_required: "Manual URL entry is not required for this output.",
};
