/**
 * QA-FB-RATE-LIMIT-TO-REVIEW
 * Reconcile a temporary Meta posting restriction into a human approval decision.
 * Never convert an unsuccessful Graph create into permission to create again.
 *
 * Pure helpers: every live mutation must re-fetch the Airtable record and use
 * these gates again. A verified published post is reconciled elsewhere.
 */
const value = (record, field) => String(record?.fields?.[field] ?? record?.[field] ?? "").trim();
const flag = (record, field) => record?.fields?.[field] === true || record?.[field] === true;
const blockedPolicy = /policy violation|community standards|copyright|ineligible|permanently restricted|checkpoint|security challenge|account disabled|integrity violation/i;
const retryStages = new Set(["FACEBOOK_STORY_RATE_LIMIT_368", "FBS3_RATE_LIMIT", "FB_GRAPH_RATE_LIMIT"]);
const HOUR = 60 * 60 * 1000;

/** A deliberate API rate limit is not a permanent content-policy rejection. */
export function facebookPreapprovalRecoveryReason(record, { nowMs = Date.now(), maxDispatches = 3 } = {}) {
  if (value(record, "Platform") !== "Facebook") return "not_facebook";
  if (value(record, "Test_Run_ID") || flag(record, "Do_Not_Publish")) return "publication_held";
  const stage = value(record, "Publish_Error_Stage");
  const message = [value(record, "Publish_Error_Message"), value(record, "FB_Slideshow_Error_Message"),
    value(record, "Studio_Publish_Dispatch_Note")].join(" ");
  if (!retryStages.has(stage)) return "not_transient_rate_limit";
  if (blockedPolicy.test(message)) return "policy_or_account_restriction";
  if (value(record, "Review_Status") !== "Approved") return "not_approved";
  if (!["Approved for Publishing", "Failed"].includes(value(record, "Output_Status")))
    return "unexpected_output_state";
  if (!["Failed", "Ready to Schedule", "Ready to Publish"].includes(value(record, "Publish_Status")))
    return "unexpected_publish_state";
  if (value(record, "Published_At") || value(record, "Platform_Post_ID") ||
      value(record, "Platform_Post_URL") || value(record, "Facebook_Post_ID") ||
      value(record, "FB_Post_ID") || value(record, "FB_Video_ID") ||
      value(record, "Platform_Media_ID") || value(record, "Manual_Published_URL") ||
      /published|posted|processing/i.test(value(record, "FB_Publish_Status")) ||
      /published|posted|processing/i.test(value(record, "FB_Slideshow_Status")))
    return "remote_publication_verification_required";
  if (value(record, "Publish_Locked_By") || value(record, "Publish_Locked_At"))
    return "publish_locked";
  if (value(record, "Render_Status") === "Failed") return "render_failed";
  if (![value(record, "Final_File_URL"), value(record, "Final_Video_URL"),
    value(record, "Publish_Asset_URL"), value(record, "FB_Slideshow_Public_URL")].some(Boolean))
    return "finished_media_missing";
  const attempts = Math.max(Number(value(record, "Publish_Attempt_Count")) || 0,
    Number(value(record, "Studio_Publish_Dispatch_Count")) || 0);
  // Missing remote IDs are not proof of nonpublication after multiple Graph sends.
  if (attempts >= maxDispatches) return "remote_publication_verification_required";
  const savedRetry = Date.parse(value(record, "Publish_Next_Retry_At"));
  const lastAttempt = Date.parse(value(record, "Last_Publish_Attempt_At"));
  if (!Number.isFinite(savedRetry) && !Number.isFinite(lastAttempt))
    return "cooldown_unverified";
  const retryAt = Math.max(Number.isFinite(savedRetry) ? savedRetry : 0,
    Number.isFinite(lastAttempt) ? lastAttempt + 48 * HOUR : 0);
  if (retryAt > nowMs) return "cooldown";
  return null;
}

/** Fields intentionally do not reset attempt counts, delete assets, or dispatch. */
export function facebookPreapprovalRecoveryFields(record, now = new Date()) {
  const stage = value(record, "Publish_Error_Stage");
  const attempts = Math.max(Number(value(record, "Publish_Attempt_Count")) || 0,
    Number(value(record, "Studio_Publish_Dispatch_Count")) || 0);
  const prior = value(record, "Studio_Publish_Dispatch_Note");
  const stamp = now.toISOString();
  return {
    Review_Status: "Review Sent",
    Output_Status: "Ready for Review",
    Publish_Status: "Not Ready",
    Auto_Publish_Enabled: false,
    Publish_Retry_Eligible: false,
    // Preserve Scheduled_Post_Date until the next approval atomically moves
    // its durable reservation. Clear only the suggestion marker so MAE replans.
    Studio_Scheduled_At: null,
    Publish_Error_Stage: "",
    Publish_Error_Message: "",
    FB_Slideshow_Error_Message: "",
    Studio_Publish_Dispatch_Note: (prior.slice(0, 360) +
      " | QA-FB-RATE-LIMIT-TO-REVIEW:" + stamp +
      " | QA-AUTOVERIFY-RECOVERED:" + stamp +
      " (" + stage + ", attempts=" + attempts + "); no remote send; approval required; MAE reschedules").slice(0, 900),
  };
}

export const FACEBOOK_PREAPPROVAL_FORMULA =
  'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Do_Not_Publish}=0,' +
  'OR({Publish_Error_Stage}="FACEBOOK_STORY_RATE_LIMIT_368",' +
  '{Publish_Error_Stage}="FBS3_RATE_LIMIT",{Publish_Error_Stage}="FB_GRAPH_RATE_LIMIT"))';
