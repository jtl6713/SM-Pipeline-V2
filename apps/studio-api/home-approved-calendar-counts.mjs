import { homeApprovedUnpublished, homeApprovedExceptionKind, homeOutputContribution, HOME_PLATFORMS } from "./profile-summary-classification.mjs";
import { isTikTokEmailedManualHandoff } from "./tiktok-emailed-handoff.mjs";

// Calendar uses Scheduled_Post_Date, never dispatch status or provisional approval.
// Each mapped Platform Output is counted once, including Stories, Reels and carousels.
// Due timestamps are preserved so browser counts can cross the deadline without
// treating yesterday's durable Home snapshot as an eternally future schedule.
export function homeApprovedCalendarCounts(outputs, now = Date.now()) {
  const slots = Object.fromEntries(HOME_PLATFORMS.map((platform) => [platform, []]));
  const awaiting_by_platform = Object.fromEntries(HOME_PLATFORMS.map((platform) => [platform, 0]));
  let missing = 0;
  for (const row of outputs || []) {
    if (!HOME_PLATFORMS.includes(row?.platform)) continue;
    // Reuse exactly the production Awaiting Approval classifier: rendered and
    // waiting for a human, never queued for rendering or already approved.
    if (homeOutputContribution(row, now).awaiting_approval) {
      awaiting_by_platform[row.platform] += 1;
      continue;
    }
    if (!homeApprovedUnpublished(row)) continue;
    // Emailed TikTok drafts are tracked in Manual Needed, not calendar Past Due.
    // This is an operational handoff, not a public Published receipt.
    if (isTikTokEmailedManualHandoff(row)) continue;
    const kind = homeApprovedExceptionKind(row, now);
    if (kind === "approved_missing_date") {
      missing += 1;
      continue;
    }
    const stamp = Date.parse(String(row.scheduled_post_date || ""));
    if (!Number.isFinite(stamp) || stamp <= 0) continue;
    slots[row.platform].push(stamp);
  }
  for (const platform of HOME_PLATFORMS) slots[platform].sort((a, b) => a - b);
  const future_by_platform = Object.fromEntries(HOME_PLATFORMS.map((platform) => [
    platform, slots[platform].filter((stamp) => stamp > now).length,
  ]));
  const future = Object.values(future_by_platform).reduce((sum, count) => sum + count, 0);
  const past_due = Object.values(slots).reduce(
    (sum, dates) => sum + dates.filter((stamp) => stamp <= now).length, 0,
  );
  const awaiting = Object.values(awaiting_by_platform).reduce((sum, amount) => sum + amount, 0);
  const pipeline_by_platform = Object.fromEntries(HOME_PLATFORMS.map((platform) => [
    platform, future_by_platform[platform] + awaiting_by_platform[platform],
  ]));
  return {
    slots, future_by_platform, future, past_due, missing_date: missing,
    awaiting_by_platform, awaiting, pipeline_by_platform,
    pipeline_total: future + awaiting,
  };
}
