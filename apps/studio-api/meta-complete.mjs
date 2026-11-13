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

/** Operator-confirmed Studio Graph republish (not profile-side manual publish). */
export function metaRepublishEligibility(record = {}) {
  const base = metaCompleteEligibility(record);
  if (base === "not_meta" || base === "do_not_publish" || base === "already_published") return base;
  if (base === "manual_completion_not_required") {
    // Also allow Failed Meta rows that parked without the Manual Action badge.
    const publish = String(record.publish_status || "").trim().toLowerCase();
    if (publish === "failed") return null;
    return base;
  }
  if (String(record.replace_transaction_id || "").trim()) return "replace_open";
  return null;
}

export function metaNeedsRepublish(record) {
  return metaRepublishEligibility(record) === null;
}

export function metaPublishDue(scheduledPostDate = "", nowMs = Date.now()) {
  const ms = Date.parse(String(scheduledPostDate || "").trim());
  if (!Number.isFinite(ms)) return true;
  return ms <= nowMs;
}

export function metaRepublishRearmFields({
  now,
  existingNotes = "",
  platform = "",
  scheduledPostDate = "",
  platformOutputType = "",
  nowMs = Date.now(),
} = {}) {
  const stamp = String(now || "").trim() || new Date().toISOString();
  const label = String(platform || "Meta").trim() || "Meta";
  const note = `Studio ${label} republish requested at ${stamp} after operator confirmed the post is not live.`;
  const notes = String(existingNotes || "").trim()
    ? `${String(existingNotes).trim()}\n\n${note}`
    : note;
  const due = metaPublishDue(scheduledPostDate, nowMs);
  const outputType = String(platformOutputType || "").trim().toLowerCase();
  const carousel = outputType.includes("carousel") || outputType.includes("multi-image");
  const fields = {
    Do_Not_Publish: false,
    Auto_Publish_Enabled: true,
    Publish_Method: "Automated",
    Output_Status: "Approved for Publishing",
    Publish_Status: due ? "Ready to Publish" : "Ready to Schedule",
    Manual_Fallback_Required: false,
    Manual_Completion_Status: "",
    Manual_Completion_At: null,
    Publish_Retry_Eligible: due,
    Publish_Attempt_Count: 0,
    Studio_Publish_Dispatch_Count: 0,
    Publish_Error_Message: "",
    Publish_Error_Stage: "",
    Publish_Locked_By: "",
    Publish_Locked_At: null,
    Publish_Started_At: null,
    Publish_Next_Retry_At: null,
    Last_Publish_Attempt_At: null,
    Platform_Media_ID: "",
    Platform_Post_ID: "",
    Platform_Post_URL: "",
    Manual_Published_URL: "",
    Published_At: null,
    Output_Notes: notes.slice(0, 10000),
  };
  if (carousel) {
    fields.IG_Carousel_Status = "Assets Ready";
    fields.IG_Carousel_Parent_Status = "Not Created";
    fields.IG_Carousel_Parent_Container_ID = "";
    fields.IG_Carousel_Published_Media_ID = "";
    fields.IG_Carousel_Error_Message = "";
    fields.IG_Carousel_Error_Stage = "";
    fields.IG_Carousel_Next_Retry_At = null;
  }
  return fields;
}

export const META_REPUBLISH_ERRORS = {
  not_meta: "Republish is only available for Instagram or Facebook outputs.",
  do_not_publish: "This output is held with Do Not Publish.",
  already_published: "This output is already published. Paste the live URL instead if Studio needs the link.",
  manual_completion_not_required: "Republish is not available for this output.",
  replace_open: "Item6 replacement is open on this output. Reconcile or clean up before republishing.",
  confirmation_required: "Confirm the post is not live before republishing.",
};

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
