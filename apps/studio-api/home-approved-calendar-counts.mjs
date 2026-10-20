import { homeApprovedUnpublished, HOME_PLATFORMS } from "./profile-summary-classification.mjs";

// Calendar uses Scheduled_Post_Date, never dispatch status or provisional approval.
// Each mapped Platform Output is counted once, including Stories, Reels and carousels.
// Due timestamps are preserved so browser counts can cross the deadline without
// treating yesterday's durable Home snapshot as an eternally future schedule.
export function homeApprovedCalendarCounts(outputs, now = Date.now()) {
  const slots = Object.fromEntries(HOME_PLATFORMS.map((platform) => [platform, []]));
  let missing = 0;
  for (const row of outputs || []) {
    if (!HOME_PLATFORMS.includes(row?.platform) || !homeApprovedUnpublished(row)) continue;
    const stamp = Date.parse(String(row.scheduled_post_date || ""));
    if (!Number.isFinite(stamp) || stamp <= 0) {
      missing += 1;
      continue;
    }
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
  return { slots, future_by_platform, future, past_due, missing_date: missing };
}
