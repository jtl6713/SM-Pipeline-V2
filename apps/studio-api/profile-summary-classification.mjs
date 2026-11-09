import { isQueuedForPlatformDispatch } from "./overview-dispatch-counts.mjs";
import { isTikTokEmailedManualHandoff } from "./tiktok-emailed-handoff.mjs";

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
/**
 * Return the scheduled timestamp if an approved output is not yet published.
 * This clock-independent candidate supports indexed live overdue evaluation in
 * SQLite even if no Airtable status changes when the deadline passes.
 */
export function homeOverdueDueAt(row) {
  if (!row || row.do_not_publish || isTikTokEmailedManualHandoff(row)) return 0;
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
  if (isTikTokEmailedManualHandoff(row)) return "";
  const due = Date.parse(String(row.scheduled_post_date || ""));
  if (!Number.isFinite(due) || due <= 0) return "approved_missing_date";
  return due <= now ? "approved_past_due" : "";
}

export function homeIsUnpublishedFailure(row) {
  if (!row) return false;
  const failed = String(row.studio_state || "").trim().toLowerCase() === "failed"
    || String(row.output_status || "").trim().toLowerCase() === "failed"
    || String(row.publish_status || "").trim().toLowerCase() === "failed";
  return failed && !row.published_at && !row.platform_post_url && !row.manual_published_url;
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

  if (state !== "Ready for Review" && state !== "Awaiting Approval") return result;
  const output = String(row.output_status || "").trim().toLowerCase();
  const render = String(row.render_status || "").trim().toLowerCase();
  const review = String(row.review_status || "").trim().toLowerCase();
  const publish = String(row.publish_status || "").trim().toLowerCase();
  if (["approved", "rejected", "skipped"].includes(review)) return result;
  if (["in production", "rendering", "ready for render", "approved", "approved for publishing", "published"].includes(output)) return result;
  if (/ready for render|waiting in render queue|rendering|queued|pending render|^processing$|^preparing$|^failed$|^blocked$/.test(render)) return result;
  if (/^(scheduled|published|uploading|platform processing|draft delivered)$/.test(publish)) return result;
  if (row.do_not_publish) return result;
  const notes = String(row.output_notes || "") + "\n" + String(row.production_notes || "");
  if (/origin=az-finished-video/i.test(notes)) return result;
  if (/az-auto-queue=1/i.test(notes) && /ez-input=finished-video/i.test(notes)) return result;
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
