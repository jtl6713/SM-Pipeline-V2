// Keep aligned with apps/studio-api/worker.js TikTok resend / publish-kick rearm.

export function tiktokResendEligibility(record = {}) {
  const platform = String(record.platform || "").trim().toLowerCase();
  if (platform !== "tiktok") return "not_tiktok";
  if (record.do_not_publish) return "do_not_publish";
  const publish = String(record.publish_status || "").trim().toLowerCase();
  const output = String(record.output_status || "").trim().toLowerCase();
  const draft = String(record.tiktok_draft_status || "").trim().toLowerCase();
  if (publish === "published" || output === "published" || draft === "published") {
    return "already_published";
  }
  if (output !== "approved for publishing") return "not_approved";
  return null;
}

export function tiktokResendRearmFields({ now, existingNotes = "" } = {}) {
  const stamp = String(now || "").trim() || new Date().toISOString();
  const note = `Studio TikTok draft resend requested at ${stamp}.`;
  const notes = String(existingNotes || "").trim()
    ? `${String(existingNotes).trim()}\n\n${note}`
    : note;
  return {
    TikTok_Draft_Status: "Ready for Delivery",
    Publish_Status: "Ready to Publish",
    Output_Status: "Approved for Publishing",
    Manual_Fallback_Required: false,
    Publish_Retry_Eligible: true,
    Publish_Attempt_Count: 0,
    Studio_Publish_Dispatch_Count: 0,
    Publish_Error_Message: "",
    Publish_Error_Stage: "",
    Publish_Locked_By: "",
    Publish_Locked_At: null,
    Publish_Started_At: null,
    Publish_Next_Retry_At: null,
    TikTok_Draft_Publish_ID: "",
    Output_Notes: notes.slice(0, 10000),
  };
}

export const TIKTOK_RESEND_ERRORS = {
  not_tiktok: "Resend draft is only available for TikTok outputs.",
  do_not_publish: "Publishing is blocked on this output.",
  already_published: "This TikTok is already marked Published. Paste a new URL only if you need to correct it.",
  not_approved: "Approve this TikTok for publishing before resending the draft.",
};

export function tiktokNeedsDraftResend(record) {
  return tiktokResendEligibility(record) === null;
}
