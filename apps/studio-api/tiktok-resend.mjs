// Keep aligned with apps/studio-api/worker.js TikTok resend / publish-kick rearm.

import { studioTikTokInboxIsDue } from "./tiktok-inbox-schedule.mjs";

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
  if (output === "approved for publishing") return null;
  // Supabase SoR often leaves Output_Status null while Music_Status / studio
  // state is Manual Action Required (Miami Vizcaya 4988 / NYC SoHo 5031).
  const music = String(record.music_status || "").trim().toLowerCase();
  const studio = String(record.studio_state || "").trim().toLowerCase();
  const manual = String(record.manual_completion_status || "").trim().toLowerCase();
  const awaitingManual = music.includes("manual action")
    || studio.includes("manual action")
    || manual === "required"
    || draft.includes("manual action")
    || draft.includes("draft delivered")
    || draft.includes("ready for delivery");
  if (awaitingManual) return null;
  if (!output && (publish === "ready to publish" || publish === "ready to schedule" || publish.includes("manual"))) {
    return null;
  }
  return "not_approved";
}

export function tiktokResendRearmFields({
  now,
  existingNotes = "",
  scheduledPostDate = "",
  nowMs = Date.now(),
} = {}) {
  const stamp = String(now || "").trim() || new Date().toISOString();
  const note = `Studio TikTok draft resend requested at ${stamp}.`;
  const notes = String(existingNotes || "").trim()
    ? `${String(existingNotes).trim()}\n\n${note}`
    : note;
  const due = studioTikTokInboxIsDue(
    { fields: { Scheduled_Post_Date: scheduledPostDate } },
    nowMs,
  );
  // A future Scheduled_Post_Date must not jump to Ready for Delivery.
  // TTD1 sends that status straight to the TikTok inbox (Output 3923 / Nov 13).
  return {
    TikTok_Draft_Status: due ? "Ready for Delivery" : "Waiting for Schedule",
    Publish_Status: due ? "Ready to Publish" : "Ready to Schedule",
    Output_Status: "Approved for Publishing",
    Manual_Fallback_Required: false,
    Publish_Retry_Eligible: due,
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
  not_approved: "This TikTok is not ready to resend. Approve for publishing or wait until Manual Action Required.",
};

export function tiktokNeedsDraftResend(record) {
  return tiktokResendEligibility(record) === null;
}
