// Keep these helpers aligned with apps/studio-api/worker.js
// (Studio TikTok URL confirmation — same Airtable fields as TTD4 email submit).

export function isTikTokPostUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  return value.toLowerCase().includes("tiktok.com");
}

export function tiktokCompleteEligibility(record = {}) {
  const platform = String(record.platform || "").trim().toLowerCase();
  if (platform !== "tiktok") return "not_tiktok";
  if (record.do_not_publish) return "do_not_publish";
  const publish = String(record.publish_status || "").trim().toLowerCase();
  const output = String(record.output_status || "").trim().toLowerCase();
  const draft = String(record.tiktok_draft_status || "").trim().toLowerCase();
  if (publish === "published" || output === "published" || draft === "published") return "already_published";
  const manual = String(record.manual_completion_status || "").trim().toLowerCase();
  const studio = String(record.studio_state || "").trim().toLowerCase();
  const awaiting = manual === "required"
    || studio.includes("manual action")
    || studio === "draft delivered"
    || draft.includes("manual action")
    || draft.includes("draft delivered")
    || draft.includes("manual completion received");
  if (!awaiting) return "manual_completion_not_required";
  return null;
}

export function tiktokNeedsUrlEntry(record) {
  return tiktokCompleteEligibility(record) === null;
}

export function tiktokMusicStatusFromChoice(choice, currentMusicStatus) {
  const music = String(choice || "").trim().toLowerCase();
  if (music === "yes") return { status: "Completed Manually", completedAt: true };
  if (music === "no") return { status: "Manual Action Required", completedAt: false };
  if (music === "not_requested") return { status: "Not Required", completedAt: false };
  const current = String(currentMusicStatus || "").trim().toLowerCase();
  if (current.includes("manual action")) return { status: "Manual Action Required", completedAt: false };
  return { status: "Not Required", completedAt: false };
}

export function tiktokManualPublishFields({
  url,
  now,
  existingNotes = "",
  musicStatus = "Not Required",
  musicCompletedAt = null,
} = {}) {
  const stamp = String(now || "").trim() || new Date().toISOString();
  const liveUrl = String(url || "").trim();
  const note = `Studio TikTok publication confirmed at ${stamp}. URL: ${liveUrl}`;
  const notes = String(existingNotes || "").trim() ? `${String(existingNotes).trim()}\n\n${note}` : note;
  return {
    Publish_Locked_At: null,
    Publish_Locked_By: "",
    Publish_Started_At: null,
    Music_Status: musicStatus,
    Music_Completion_At: musicCompletedAt ? stamp : null,
    Output_Notes: notes.slice(0, 10000),
    Published_At: stamp,
    Output_Status: "Published",
    Publish_Status: "Published",
    Platform_Post_URL: liveUrl,
    Publish_Error_Stage: "",
    TikTok_Draft_Status: "Published",
    Manual_Completion_At: stamp,
    Manual_Published_URL: liveUrl,
    Publish_Error_Message: "",
    Publish_Next_Retry_At: null,
    Publish_Retry_Eligible: false,
    TikTok_Manual_Posted_At: stamp,
    Manual_Completion_Status: "Completed",
    Manual_Fallback_Required: false,
    TikTok_Public_Confirmation_At: stamp,
  };
}
