import { isQueuedForPlatformDispatch } from "./overview-dispatch-counts.mjs";
import { isTikTokEmailedManualHandoff } from "./tiktok-emailed-handoff.mjs";
import {
  evaluateReviewPackage,
  factoryReviewVisibility,
  formalFactoryApprovalReady,
} from "./review-package-readiness.mjs";

/**
 * Adapt overview / mapOutput rows (or raw Airtable records) for the shared
 * Factory Needs eyes package gate. Home Awaiting Approval must use the same
 * predicate as the Factory lane the Overview link opens.
 */
export function homeMappedApprovalRecord(row) {
  if (!row) return null;
  if (row.fields && typeof row.fields === "object") return row;
  return {
    id: row.id,
    fields: {
      Output_Status: row.output_status,
      Review_Status: row.review_status,
      Publish_Status: row.publish_status,
      Render_Status: row.render_status,
      Do_Not_Publish: row.do_not_publish === true,
      Studio_Render_Review_Hold_Active: row.review_hold_active === true
        || row.studio_render_review_hold_active === true,
      Test_Run_ID: row.test_run_id,
      Published_At: row.published_at,
      Platform_Post_ID: row.platform_post_id,
      Platform_Post_URL: row.platform_post_url,
      Final_File_URL: row.final_file_url,
      Final_File_ID: row.final_file_id,
      Thumbnail_URL: row.thumbnail_url,
      Studio_Preview_URL: row.studio_preview_url,
      Output_Caption: row.output_caption,
      Studio_Output_Type: row.studio_output_type || row.format,
      Format: row.format,
      Platform: row.platform,
      Platform_Output_Type: row.platform_output_type,
      Selected_Clip_Count: row.selected_clip_count,
      Selected_Assets_JSON: row.selected_assets_json || row.selected_assets,
      "Carousel Slides": row.carousel_slides || row.carousel_slide_links || row.carousel_slide_ids,
      Remotion_Job_ID: row.remotion_job_id,
      Output_Notes: row.output_notes,
      Production_Notes: row.production_notes,
    },
  };
}

/** True when Overview should count this output as Awaiting Approval (= Factory Needs eyes). */
export function homeAwaitingApprovalVisible(row) {
  if (!row) return false;
  // Prefer the Factory-computed gate when present (ops queue cards).
  if (row.review_package_ready === false) return false;
  if (row.review_package_ready === true && row.kind === "output") {
    // Still honor terminal / AZ exclusions below via formal visibility.
  }
  const notes = `${row.output_notes || ""}\n${row.production_notes || ""}`;
  if (/origin=az-finished-video/i.test(notes)) return false;
  if (/az-auto-queue=1/i.test(notes) && /ez-input=finished-video/i.test(notes)) return false;
  const record = homeMappedApprovalRecord(row);
  if (!record) return false;
  const readiness = evaluateReviewPackage(record);
  // Approve-ready package (same as Factory Approve eligibility). Do not require
  // studio_state === Ready for Review — Overview lean maps often label complete
  // RFR rows as Preparing Assets when CDN fields are projected lightly.
  if (formalFactoryApprovalReady(record, readiness)) return true;
  const studioState = String(row.studio_state || "").trim() || "Ready for Review";
  const creativeAvailable = row.creative_available !== false;
  // Also count Needs eyes held / hold-release rows Factory still shows.
  return factoryReviewVisibility(record, readiness, studioState, creativeAvailable).visible === true;
}

export const HOME_PLATFORMS = Object.freeze(["Facebook", "Instagram", "TikTok", "YouTube"]);
export const HOME_METRIC_KEYS = Object.freeze([
  "manual_action_required", "failed_outputs", "awaiting_approval",
  "attention_outputs", "published_outputs", "active_outputs", "approved_unpublished", "overdue_unpublished",
  "platform_outputs", "ideas_not_in_production", "ideas", "approved_missing_date",
]);

export function emptyHomeContribution() {
  return {
    scheduled: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 },
    awaiting_final_by_platform: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 },
    // Record-level metadata: used by the indexed V6 approved calendar query.
    calendar_platform: "",
    manual_action_required: 0, failed_outputs: 0, awaiting_approval: 0,
    attention_outputs: 0, published_outputs: 0, active_outputs: 0,
    platform_outputs: 0, ideas_not_in_production: 0, ideas: 0, approved_unpublished: 0, overdue_unpublished: 0,
    approved_missing_date: 0,
  };
}

/**
 * Canonical record-level output classification for Home and autonomous refill.
 * Input is the EXISTING mapOutput() shape; never infer Scheduled from a date
 * alone or Ready for Review from Studio_State alone.
 */
/** Uploaded public YouTube id is a receipt. A private upload id is not. */
export function youtubePublicUploadReceipt(row) {
  if (String(row?.platform || "").trim() !== "YouTube") return false;
  if (!String(row.youtube_video_id || "").trim()) return false;
  const upload = String(row.youtube_upload_status || "").trim().toLowerCase();
  const privacy = String(row.youtube_privacy_status || "").trim().toLowerCase();
  return upload === "uploaded" && privacy === "public";
}

/** Graph 368 is a timed cooldown. It is not an unpublished failure or a past-due approval. */
export function facebookGraphCooldown(row) {
  if (String(row?.platform || "").trim() !== "Facebook") return false;
  if (row.published_at || row.platform_post_url || row.manual_published_url) return false;
  const stage = String(row.publish_error_stage || "").trim();
  return /^(FACEBOOK_STORY_RATE_LIMIT_368|FBS3_RATE_LIMIT|FB_GRAPH_RATE_LIMIT)$/i.test(stage);
}

/** Approved, auto-publish off, never dispatched. That is a manual send, not a late job. */
export function homeManualPublishHold(row) {
  if (!row || row.do_not_publish || row.auto_publish_enabled !== false) return false;
  if (String(row.review_status || "").trim().toLowerCase() !== "approved") return false;
  if (row.published_at || row.platform_post_url || row.manual_published_url) return false;
  return Number(row.studio_publish_dispatch_count || 0) <= 0;
}

/** Error text left on a row that is still queued. Terminal Failed/render status is not this. */
export function homeNonterminalPublishError(row) {
  if (!row || row.published_at || row.platform_post_url || row.manual_published_url) return false;
  const publish = String(row.publish_status || "").trim().toLowerCase();
  const output = String(row.output_status || "").trim().toLowerCase();
  const render = String(row.render_status || "").trim().toLowerCase();
  if (publish === "failed" || output === "failed" || render === "failed") return false;
  const text = [
    row.publish_error_message,
    row.ig_carousel_error_message,
    row.studio_publish_dispatch_note,
    row.publish_error_stage,
  ].map((value) => String(value || "")).join(" ");
  return /image_url is required|slide-set mismatch|skipped:/i.test(text)
    || String(row.publish_error_stage || "").trim() === "RESCUE_SKIP"
    || String(row.studio_state || "").trim().toLowerCase() === "retry pending";
}

/**
 * Return the scheduled timestamp if an approved output is not yet published.
 * This clock-independent candidate supports indexed live overdue evaluation in
 * SQLite even if no Airtable status changes when the deadline passes.
 */
export function homeOverdueDueAt(row) {
  if (!row || row.do_not_publish || isTikTokEmailedManualHandoff(row)) return 0;
  if (youtubePublicUploadReceipt(row) || facebookGraphCooldown(row)) return 0;
  if (homeManualPublishHold(row) || homeNonterminalPublishError(row)) return 0;
  const review = String(row.review_status || "").trim().toLowerCase();
  const output = String(row.output_status || "").trim().toLowerCase();
  if (review && review !== "approved") return 0;
  if (!(review === "approved" || output === "approved" || output.includes("approved for publishing"))) return 0;
  const scheduled = row.scheduled_at || row.scheduled_post_date || row.youtube_scheduled_publish_at;
  const when = Date.parse(String(scheduled || ""));
  if (!Number.isFinite(when) || when <= 0) return 0;
  const state = String(row.studio_state || "").trim().toLowerCase();
  const publish = String(row.publish_status || "").trim().toLowerCase();
  const platformPublish = String(row.platform_publish_status || "").trim().toLowerCase();
  const manual = String(row.manual_completion_status || "").trim().toLowerCase();
  if (publish === "failed" || output === "failed" || state === "failed") return 0;
  if (/published|posted/.test(state)) return 0;
  if (/published|posted|publish complete|publish succeeded/.test(publish)
    || // "Published Pending Finalize" does not prove public publication.
    /^(published|posted|publish complete|publish succeeded)$/.test(platformPublish)) return 0;
  if (/^(published|posted|completed)$/.test(manual)) return 0;
  if (row.published_at || row.platform_post_url || row.manual_published_url) return 0;
  return when;
}

/**
 * Scheduled-date diagnostic retained for legacy ledger metadata.
 * NOT used by the approved-but-unpublished Home parentheses.
 */
export function homeApprovedUpcomingAt(row) {
  // V6 indexed calendar dates must use the same manual-handoff rule as Home and QA.
  // Otherwise the immutable date index keeps counting emailed drafts as overdue.
  if (!row || !HOME_PLATFORMS.includes(row.platform) || !homeApprovedUnpublished(row)
      || isTikTokEmailedManualHandoff(row)) return 0;
  const when = Date.parse(String(row.scheduled_post_date || ""));
  if (!Number.isFinite(when) || when <= 0) return 0;
  const state = String(row.studio_state || "").trim().toLowerCase();
  const publish = String(row.publish_status || "").trim().toLowerCase();
  const platformPublish = String(row.platform_publish_status || "").trim().toLowerCase();
  const manual = String(row.manual_completion_status || "").trim().toLowerCase();
  if (/published|posted/.test(state)
    || /published|posted|publish complete|publish succeeded/.test(publish)
    || /^(published|posted|publish complete|publish succeeded)$/.test(platformPublish)
    || /^(published|posted|completed)$/.test(manual)
    || row.published_at || row.platform_post_url || row.manual_published_url) return 0;
  return when;
}

/**
 * Parenthesized Home tally: final-approved outputs that have NOT been published.
 * Future, overdue, and temporarily unscheduled approved outputs all remain
 * counted; date passage or draft delivery is never publication evidence.
 * A rejected, skipped or do-not-publish output cannot contribute.
 */
export function homeApprovedUnpublished(row, _now = Date.now()) {
  if (!row || row.do_not_publish) return false;
  // Only authoritative final approval, not provisional output status.
  if (String(row.review_status || "").trim().toLowerCase() !== "approved") return false;
  if (youtubePublicUploadReceipt(row) || facebookGraphCooldown(row)) return false;
  const state = String(row.studio_state || "").trim().toLowerCase();
  const publish = String(row.publish_status || "").trim().toLowerCase();
  const platformPublish = String(row.platform_publish_status || "").trim().toLowerCase();
  const manual = String(row.manual_completion_status || "").trim().toLowerCase();
  if (String(row.output_status || "").trim().toLowerCase() === "failed"
    || publish === "failed" || state === "failed") return false;
  if (/published|posted/.test(state)
    || /published|posted|publish complete|publish succeeded/.test(publish)
    || /^(published|posted|publish complete|publish succeeded)$/.test(platformPublish)
    || /^(published|posted|completed)$/.test(manual)
    || row.published_at || row.platform_post_url || row.manual_published_url) return false;
  return true;
}

/**
 * The exact Home buckets used for both overview counts and Pipeline drill-down.
 * Approved failed outputs belong only to the Quality Agent failure count.
 */
export function homeApprovedExceptionKind(row, now = Date.now()) {
  if (!row || !HOME_PLATFORMS.includes(row.platform) || !homeApprovedUnpublished(row)) return "";
  if (isTikTokEmailedManualHandoff(row) || homeManualPublishHold(row) || homeNonterminalPublishError(row)) return "";
  const due = Date.parse(String(row.scheduled_post_date || ""));
  if (!Number.isFinite(due) || due <= 0) return "approved_missing_date";
  return due <= now ? "approved_past_due" : "";
}

export function homeIsUnpublishedFailure(row) {
  if (!row || facebookGraphCooldown(row) || homeNonterminalPublishError(row)) return false;
  if (row.published_at || row.platform_post_url || row.manual_published_url) return false;
  const publish = String(row.publish_status || "").trim().toLowerCase();
  const output = String(row.output_status || "").trim().toLowerCase();
  const render = String(row.render_status || "").trim().toLowerCase();
  const state = String(row.studio_state || "").trim().toLowerCase();
  return publish === "failed" || output === "failed" || render === "failed" || state === "failed";
}

export function homeOutputContribution(row, now = Date.now()) {
  const result = emptyHomeContribution();
  if (!row) return result;
  result.platform_outputs = 1;
  const knownPlatform = HOME_PLATFORMS.includes(row.platform);
  result.calendar_platform = knownPlatform ? row.platform : "";
  result.approved_unpublished = Number(homeApprovedUnpublished(row, now));
  // A completed emailed TikTok handoff has a real scheduled date and belongs in
  // Manual Needed; excluding its V6 calendar slot must NOT relabel it missing-date.
  result.approved_missing_date = Number(knownPlatform && result.approved_unpublished
    && !homeApprovedUpcomingAt(row) && !isTikTokEmailedManualHandoff(row));
  const dueAt = homeOverdueDueAt(row);
  result.overdue_unpublished = Number(dueAt > 0 && dueAt <= now);
  const state = String(row.studio_state || "").trim();
  result.manual_action_required = Number(state === "Manual Action Required");
  // Failed and the Historical Pipeline drill-down share one predicate.
  const failed = homeIsUnpublishedFailure(row);
  result.failed_outputs = Number(failed);
  result.attention_outputs = Number(failed || ["Retry Pending", "Manual Action Required"].includes(state));
  result.published_outputs = Number(state === "Published");
  result.active_outputs = Number(!failed && !["Published", "Skipped"].includes(state));
  if (isQueuedForPlatformDispatch(row)) result.scheduled[row.platform] = 1;

  // Awaiting Approval must equal Factory Needs eyes: package-complete outputs
  // Joseph can open from the Overview link and Approve. Incomplete Ready for
  // Review status alone belongs in Repair, not this count.
  if (!homeAwaitingApprovalVisible(row)) return result;
  result.awaiting_approval = 1;
  if (knownPlatform) result.awaiting_final_by_platform[row.platform] = 1;
  return result;
}

export function homeIdeaContribution(row) {
  const result = emptyHomeContribution();
  if (!row) return result;
  result.ideas = 1;
  // Match Ideas-page ideaIsPromoted: status Promoted OR promotion links.
  // Home must not count historical idea_candidates that only look open because
  // Supabase payload promotion keys are missing or stale.
  result.ideas_not_in_production = Number(!(
    String(row.status || "").trim() === "Promoted"
    || Boolean(row.promoted_content_record_id)
    || (Array.isArray(row.content_item_links) && row.content_item_links.length > 0)
  ));
  return result;
}

export function combineHomeContributions(rows) {
  const total = emptyHomeContribution();
  for (const row of rows || []) {
    if (!row) continue;
    for (const platform of HOME_PLATFORMS) {
      total.scheduled[platform] += Number(row.scheduled?.[platform]) || 0;
      total.awaiting_final_by_platform[platform] += Number(row.awaiting_final_by_platform?.[platform]) || 0;
    }
    for (const key of HOME_METRIC_KEYS) total[key] += Number(row[key]) || 0;
  }
  return total;
}

export function homeContributionDelta(oldContribution, newContribution) {
  const a = oldContribution || emptyHomeContribution();
  const b = newContribution || emptyHomeContribution();
  const delta = emptyHomeContribution();
  for (const platform of HOME_PLATFORMS) {
    delta.scheduled[platform] = (Number(b.scheduled?.[platform]) || 0) - (Number(a.scheduled?.[platform]) || 0);
    delta.awaiting_final_by_platform[platform] = (Number(b.awaiting_final_by_platform?.[platform]) || 0) - (Number(a.awaiting_final_by_platform?.[platform]) || 0);
  }
  for (const key of HOME_METRIC_KEYS) delta[key] = (Number(b[key]) || 0) - (Number(a[key]) || 0);
  return delta;
}

export function contributionEqual(a, b) {
  return JSON.stringify(a || emptyHomeContribution()) === JSON.stringify(b || emptyHomeContribution());
}
