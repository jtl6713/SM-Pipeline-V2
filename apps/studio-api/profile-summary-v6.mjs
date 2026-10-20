import { HOME_PLATFORMS } from "./profile-summary-classification.mjs";

const zeros = () => Object.fromEntries(HOME_PLATFORMS.map((p) => [p, 0]));
const slotsEmpty = () => Object.fromEntries(HOME_PLATFORMS.map((p) => [p, []]));

/**
 * Assemble the complete V6 Home row from an additive per-profile ledger and
 * the indexed, timestamp-bearing approved records. No Airtable scan is needed.
 * The clock is supplied at read time: future/past-due counts never freeze.
 */
export function buildProfileSummaryV6Row(profile, counters, approvedEntries, now = Date.now()) {
  const c = counters || {};
  const slots = slotsEmpty();
  for (const entry of approvedEntries || []) {
    const stamp = Number(entry.approved_future_at || 0);
    if (!(stamp > 0) || !Number.isFinite(stamp)) throw new Error("Invalid approved calendar stamp");
    const contribution = typeof entry.contribution === "string"
      ? JSON.parse(entry.contribution) : entry.contribution;
    const platform = contribution?.calendar_platform;
    if (!HOME_PLATFORMS.includes(platform)) throw new Error("V6 calendar platform missing from ledger");
    slots[platform].push(stamp);
  }
  const futureByPlatform = zeros();
  const awaitingByPlatform = zeros();
  const pipelineByPlatform = zeros();
  let future = 0, pastDue = 0, awaiting = 0;
  for (const platform of HOME_PLATFORMS) {
    slots[platform].sort((a, b) => a - b);
    futureByPlatform[platform] = slots[platform].filter((stamp) => stamp > now).length;
    pastDue += slots[platform].length - futureByPlatform[platform];
    awaitingByPlatform[platform] = Number(c.awaiting_final_by_platform?.[platform] || 0);
    if (!Number.isInteger(awaitingByPlatform[platform]) || awaitingByPlatform[platform] < 0) {
      throw new Error("Invalid per-platform awaiting approval ledger");
    }
    pipelineByPlatform[platform] = futureByPlatform[platform] + awaitingByPlatform[platform];
    future += futureByPlatform[platform];
    awaiting += awaitingByPlatform[platform];
  }
  const missing = Number(c.approved_missing_date || 0);
  if (!Number.isInteger(missing) || missing < 0) throw new Error("Invalid missing-date ledger");
  const scheduled = Object.fromEntries(HOME_PLATFORMS.map((p) => [p, Number(c.scheduled?.[p] || 0)]));
  return {
    id: profile.id,
    name: profile.city_label,
    city_label: profile.city_label,
    scheduled,
    manual: Number(c.manual_action_required || 0),
    failed: Number(c.failed_outputs || 0),
    approval: awaiting,
    awaiting_final_by_platform: awaitingByPlatform,
    pipeline_by_platform: pipelineByPlatform,
    pipeline_total: future + awaiting,
    approved_unpublished: Number(c.approved_unpublished || 0),
    overdue_unpublished: Number(c.overdue_unpublished || 0),
    approved_future_by_platform: futureByPlatform,
    approved_future: future,
    approved_past_due: pastDue,
    approved_missing_date: missing,
    approved_calendar_slots: slots,
    ideas: Number(c.ideas_not_in_production || 0),
    ideas_source: "durable-profile-summary",
    metrics: c,
    read_source: "durable-profile-summary",
    version: Number(profile.version || 0),
  };
}

/** Clock-independent fields must exactly match the authoritative V6 rebuild. */
export function profileSummaryV6StaticParity(expected, actual) {
  const keys = [
    "scheduled", "manual", "failed", "approval", "ideas",
    "approved_unpublished", "approved_missing_date",
    "approved_calendar_slots", "awaiting_final_by_platform",
  ];
  return keys.every((key) => JSON.stringify(expected?.[key]) === JSON.stringify(actual?.[key]));
}

/** Fail closed before Home uses the incremental summary as a V6 source. */
export function validProfileSummaryV6Rows(rows) {
  if (!Array.isArray(rows) || rows.length !== 4) return false;
  const ids = new Set(), cities = new Set();
  const count = (value) => Number.isInteger(value) && value >= 0;
  for (const row of rows) {
    const id = String(row?.id || "");
    const city = String(row?.city_label || "").trim().toLowerCase();
    if (!/^rec[A-Za-z0-9]{14}$/.test(id) || !city || ids.has(id) || cities.has(city)) return false;
    ids.add(id); cities.add(city);
    for (const key of [
      "manual", "failed", "approval", "ideas", "approved_unpublished",
      "overdue_unpublished", "approved_future", "approved_past_due",
      "approved_missing_date", "pipeline_total",
    ]) if (!count(row[key])) return false;
    for (const platform of HOME_PLATFORMS) {
      if (!count(row.scheduled?.[platform])
        || !count(row.approved_future_by_platform?.[platform])
        || !count(row.awaiting_final_by_platform?.[platform])
        || !count(row.pipeline_by_platform?.[platform])
        || row.pipeline_by_platform[platform] !== row.approved_future_by_platform[platform]
          + row.awaiting_final_by_platform[platform]) return false;
      const dates = row.approved_calendar_slots?.[platform];
      if (!Array.isArray(dates)
        || dates.some((stamp) => !Number.isFinite(stamp) || stamp <= 0)
        || row.approved_future_by_platform[platform] > dates.length) return false;
    }
    const sum = (field) => HOME_PLATFORMS.reduce((n, p) => n + row[field][p], 0);
    const slotCount = HOME_PLATFORMS.reduce((n, p) => n + row.approved_calendar_slots[p].length, 0);
    if (sum("approved_future_by_platform") !== row.approved_future
      || sum("awaiting_final_by_platform") !== row.approval
      || sum("pipeline_by_platform") !== row.pipeline_total
      || row.approved_future + row.approved_past_due !== slotCount) return false;
  }
  return true;
}
