import { scanOutstandingFailedOutputs } from "./failed-output-monitor.mjs";

/**
 * QA-PUBLISH-001: final-approved output remains unconfirmed beyond its
 * scheduled publication time. Detection does NOT establish a failed post.
 * Airtable is the write authority; platform-specific pollers establish
 * remote publication, not a successful draft/upload/dispatch response.
 */
export const QA_APPROVED_PAST_DUE = "QA-PUBLISH-001";
export const PAST_DUE_GRACE_MS = 15 * 60 * 1000;

const value = (row, key) => String(row?.fields?.[key] ?? row?.[key] ?? "").trim();
const truth = (row, key) => row?.fields?.[key] === true || row?.[key] === true;
const has = (row, key) => Boolean(value(row, key));

export function approvedPastDueFormula(nowMs = Date.now(), graceMs = PAST_DUE_GRACE_MS) {
  const before = new Date(nowMs - Math.max(0, graceMs)).toISOString();
  return 'AND({Test_Run_ID}=BLANK(),{Review_Status}="Approved",{Do_Not_Publish}=0,'
    + '{Scheduled_Post_Date}!="",IS_BEFORE({Scheduled_Post_Date},"' + before + '"),'
    + '{Output_Status}!="Published",{Publish_Status}!="Published",'
    + '{Published_At}=BLANK(),{Platform_Post_URL}=BLANK(),'
    + '{Manual_Published_URL}=BLANK())';
}

// A second census detects verified-live receipts that were never reflected
// in the canonical output/publish statuses. It is NOT a remote proof checker.
export const STALE_PUBLISHED_RECEIPT_FORMULA =
  'AND({Test_Run_ID}=BLANK(),{Review_Status}="Approved",{Do_Not_Publish}=0,'
  + '{Published_At}!=BLANK(),'
  + 'OR({Output_Status}!="Published",{Publish_Status}!="Published"))';

export async function scanApprovedPastDueOutputs(fetchPage, options = {}) {
  return scanOutstandingFailedOutputs(fetchPage, {
    filterFormula: approvedPastDueFormula(options.nowMs, options.graceMs),
  });
}

export function publishedReceiptRepairReason(row) {
  if (truth(row, "Do_Not_Publish")) return "publication_held";
  if (value(row, "Review_Status") !== "Approved") return "approval_changed";
  if (!has(row, "Published_At")) return "no_authoritative_published_timestamp";
  // A timestamp alone is insufficient for a write repair: some connectors
  // record upload/private/draft success before public visibility is verified.
  // Require a persisted *public* post URL plus Published_At, or leave the row
  // for the platform-specific poller. IDs alone can identify a private upload.
  if (!has(row, "Platform_Post_URL") && !has(row, "Manual_Published_URL"))
    return "public_post_url_unverified";
  const status = value(row, "Publish_Status").toLowerCase();
  if (status.includes("privately") || status.includes("manual publish"))
    return "publication_not_verified_public";
  if (value(row, "Platform") === "TikTok"
    && /draft delivered|manual fallback|manual action/i.test(value(row, "TikTok_Draft_Status")))
    return "draft_not_verified_public";
  if (value(row, "Output_Status") === "Published" && value(row, "Publish_Status") === "Published")
    return "already_reconciled";
  const lockedAt = Date.parse(value(row, "Publish_Locked_At"));
  if (has(row, "Publish_Locked_By")
      && (!Number.isFinite(lockedAt) || Date.now() - lockedAt < 15 * 60 * 1000))
    return "active_publish_lock";
  return null;
}

export function classifyApprovedPastDue(row, nowMs = Date.now()) {
  const dueAt = Date.parse(value(row, "Scheduled_Post_Date"));
  const lagMinutes = Number.isFinite(dueAt) ? Math.max(0, Math.floor((nowMs - dueAt) / 60000)) : null;
  const platform = value(row, "Platform");
  const status = value(row, "Publish_Status");
  const outputStatus = value(row, "Output_Status");
  const stage = [
    value(row, "TikTok_Draft_Status"), value(row, "YouTube_Upload_Status"),
    value(row, "YouTube_Processing_Status"), value(row, "FB_Publish_Status"),
    value(row, "IG_Carousel_Status"),
  ].join(" ").toLowerCase();
  const retryAt = Date.parse(value(row, "Publish_Next_Retry_At"));
  const lockAt = Date.parse(value(row, "Publish_Locked_At"));
  const hasLock = has(row, "Publish_Locked_By")
    && (!Number.isFinite(lockAt) || nowMs - lockAt < 15 * 60 * 1000);
  const attempts = Math.max(
    Number(value(row, "Studio_Publish_Dispatch_Count")) || 0,
    Number(value(row, "Publish_Attempt_Count")) || 0,
  );

  let cause = "remote_publication_unconfirmed";
  let recovery = "verify_remote_before_retry";
  let action = "Inspect the platform-specific publishing receipt and poll remote post visibility; never blindly republish.";
  if (truth(row, "Do_Not_Publish")) {
    cause = "publication_held"; recovery = "held";
    action = "Honor the publishing hold; exclude this output from automatic dispatch.";
  } else if (has(row, "Published_At")) {
    cause = "canonical_publication_receipt_status_stale"; recovery = "verify_and_reconcile_status";
    action = "Re-read the authoritative receipt; only repair statuses if public visibility evidence and platform safety guards pass. No new dispatch.";
  } else if (platform === "Facebook"
      && /^(Facebook Photo Set|Facebook Post)$/i.test(
        value(row, "Studio_Output_Type") || value(row, "Platform_Output_Type"))
      && value(row, "FB_Publish_Status") === "Published Pending Finalize"
      && has(row, "Platform_Post_ID")) {
    // FB2 already returned a unique Page post id. This is a *finalization*
    // stall, never a reason to publish another photo or attached-media feed.
    cause = "facebook_photo_existing_post_finalize_stalled";
    recovery = "verify_remote_before_retry";
    action = "Run the bounded FB3 existing-Page-post Graph GET. Require matching post id and permalink before repairing publication status; never call FB0/FB1/FB2 or create another Facebook post.";
  } else if (has(row, "Platform_Post_URL") || has(row, "Manual_Published_URL")
      || has(row, "Platform_Post_ID") || has(row, "YouTube_Video_ID")) {
    cause = "remote_identity_not_public_visibility"; recovery = "verify_remote_before_retry";
    action = "Confirm the existing post is PUBLIC on its platform before status repair. A YouTube ID or watch URL may still be private.";
  } else if (platform === "TikTok" && /draft delivered|manual fallback|manual action/.test(stage)) {
    cause = "tiktok_draft_needs_manual_completion"; recovery = "manual_action";
    action = "Keep the delivered draft awaiting manual posting and public URL. Do not upload another draft automatically.";
  } else if (platform === "YouTube" && /uploaded|completed|processing|succeeded/.test(stage)) {
    cause = "youtube_upload_not_publication"; recovery = "verify_remote_before_retry";
    action = "Use the existing YouTube publish/visibility reconciler; a private successful upload is not a public post.";
  } else if (Number.isFinite(retryAt) && retryAt > nowMs) {
    cause = "publish_retry_cooldown"; recovery = "cooldown";
    action = "Wait for the recorded retry time; the existing guarded healer owns retry.";
  } else if (hasLock || /publishing|processing|uploading|in progress/i.test(status)) {
    cause = "publisher_in_flight"; recovery = "verify_remote_before_retry";
    action = "Check the live lock and provider receipts; do not dispatch a second copy while publishing may still be active.";
  } else if (outputStatus === "Ready for Review" && value(row, "Review_Status") === "Approved") {
    cause = "approval_output_state_disagreement";
    recovery = "repair_approval_state_not_publish";
    action = "Reconcile the final approval ledger and authoritative output state; do not reapprove or dispatch while state disagrees.";
  } else if (status === "Failed" || outputStatus === "Failed") {
    cause = "publish_failure"; recovery = "existing_healer";
    action = "Route to failed-output Quality Agent for cause-specific bounded recovery; enforce locks, retry limits and cooldowns.";
  } else if (attempts >= 3) {
    // Production evidence: several overdue LA Facebook outputs have eight
    // dispatches with no post URL/ID. More dispatches risk duplicates and
    // rate limits; do not reset counters or invoke the due-publish rescue.
    cause = "publish_dispatch_attempt_limit";
    recovery = "escalate_without_redispatch";
    action = "Stop new dispatch attempts; inspect publisher receipts, last attempt and provider rate limits. Escalate missing remote proof.";
  } else if (attempts === 0 && truth(row, "Auto_Publish_Enabled")) {
    cause = "approved_due_without_dispatch"; recovery = "existing_overdue_rescue";
    action = "Existing five-minute overdue-publish rescue should verify latest state and dispatch once using its idempotency guards.";
  } else if (attempts === 0) {
    cause = "auto_publish_disabled_or_manual"; recovery = "manual_action";
    action = "Inspect platform delivery policy; do not silently enable Auto Publish or force an immediate post.";
  }

  const linked = row?.fields?.Content_Profile;
  const profileId = Array.isArray(linked) ? String(linked[0] || "") : "";
  return {
    signature: QA_APPROVED_PAST_DUE,
    record_id: row?.id || null, output_id: value(row, "Output_ID") || null,
    profile_id: profileId || null, platform, output_type:
      value(row, "Studio_Output_Type") || value(row, "Platform_Output_Type"),
    scheduled_at: value(row, "Scheduled_Post_Date"), minutes_past_due: lagMinutes,
    publish_status: status, output_status: outputStatus, dispatch_attempts: attempts,
    cause, recovery, action,
    severity: lagMinutes >= 60 ? "critical" : "warning",
  };
}
