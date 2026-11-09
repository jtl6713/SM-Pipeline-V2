/**
 * Home All-Profiles column parity: Airtable remains the write source of truth.
 * When STUDIO_HOME_READ_SOURCE=supabase, force refresh compares the live
 * Supabase overview rows to a same-scope Airtable rebuild using the same
 * display math the Studio Home table uses, then reconciles mismatches to
 * Airtable — including calendar slots that drive Pipeline / Future / Past Due.
 */

export const HOME_OVERVIEW_PLATFORM_ORDER = Object.freeze([
  "Facebook",
  "Instagram",
  "TikTok",
  "YouTube",
]);

/**
 * Columns the All Profiles Home table actually shows (or derives for display).
 * Platform pipeline cells are Future + Review, not the legacy scheduled.* field.
 */
export const HOME_OVERVIEW_PARITY_COLUMNS = Object.freeze([
  "manual",
  "failed",
  "approval",
  "ideas",
  "approved_past_due",
  "approved_missing_date",
  "approved_future",
  "pipeline_total",
  "pipeline.Facebook",
  "pipeline.Instagram",
  "pipeline.TikTok",
  "pipeline.YouTube",
]);

/** @deprecated alias kept for older tests / call sites */
export const HOME_OVERVIEW_SCHEDULED_COLUMNS = Object.freeze(
  HOME_OVERVIEW_PLATFORM_ORDER.map((platform) => `scheduled.${platform}`),
);

function nestedNumber(row, path) {
  const parts = String(path || "").split(".");
  let cursor = row;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") return 0;
    cursor = cursor[part];
  }
  const n = Number(cursor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Same display math as apps/studio-web/assets/all-profiles-overview-1007.js
 * approvedCalendarCounts(): Pipeline / Future / Past Due come from calendar
 * slots + awaiting_final, not from the stored rollup alone.
 */
export function homeOverviewDisplayMetrics(row, now = Date.now()) {
  const byPlatform = {};
  let future = 0;
  let pastDue = 0;
  for (const platform of HOME_OVERVIEW_PLATFORM_ORDER) {
    const slots = Array.isArray(row?.approved_calendar_slots?.[platform])
      ? row.approved_calendar_slots[platform]
      : [];
    const futureSlots = slots.filter((due) => Number(due) > now).length;
    byPlatform[platform] = futureSlots;
    future += futureSlots;
    pastDue += slots.length - futureSlots;
  }
  const awaitingByPlatform = row?.awaiting_final_by_platform || {};
  const pipelineByPlatform = Object.fromEntries(HOME_OVERVIEW_PLATFORM_ORDER.map((platform) => [
    platform,
    byPlatform[platform] + (Number(awaitingByPlatform[platform]) || 0),
  ]));
  const awaiting = HOME_OVERVIEW_PLATFORM_ORDER.reduce(
    (sum, platform) => sum + (Number(awaitingByPlatform[platform]) || 0),
    0,
  );
  const pipelineTotal = future + awaiting;
  return {
    manual: Number(row?.manual) || 0,
    failed: Number(row?.failed) || 0,
    // Home "Awaiting approval" cell uses the stored approval count.
    approval: Number(row?.approval) || 0,
    ideas: Number(row?.ideas) || 0,
    approved_past_due: pastDue,
    approved_missing_date: Number(row?.approved_missing_date) || 0,
    approved_future: future,
    pipeline_total: pipelineTotal,
    "pipeline.Facebook": pipelineByPlatform.Facebook,
    "pipeline.Instagram": pipelineByPlatform.Instagram,
    "pipeline.TikTok": pipelineByPlatform.TikTok,
    "pipeline.YouTube": pipelineByPlatform.YouTube,
  };
}

export function homeOverviewParityMetric(row, column, now = Date.now()) {
  const metrics = homeOverviewDisplayMetrics(row, now);
  if (Object.prototype.hasOwnProperty.call(metrics, column)) {
    return Number(metrics[column]) || 0;
  }
  // Fallback for legacy scheduled.* comparisons during transition.
  return nestedNumber(row, column);
}

function sortedSlotFingerprint(row) {
  const parts = [];
  for (const platform of HOME_OVERVIEW_PLATFORM_ORDER) {
    const slots = Array.isArray(row?.approved_calendar_slots?.[platform])
      ? row.approved_calendar_slots[platform].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      : [];
    const awaiting = Number(row?.awaiting_final_by_platform?.[platform]) || 0;
    parts.push(`${platform}:${slots.join(",")}|a${awaiting}`);
  }
  return parts.join(";");
}

export function compareHomeOverviewParity(airtableRows, supabaseRows, {
  columns = HOME_OVERVIEW_PARITY_COLUMNS,
  now = Date.now(),
} = {}) {
  const airtableById = new Map((airtableRows || []).map((row) => [String(row?.id || ""), row]));
  const supabaseById = new Map((supabaseRows || []).map((row) => [String(row?.id || ""), row]));
  const differences = [];
  const missingInSupabase = [];
  const missingInAirtable = [];

  for (const [id, airtable] of airtableById) {
    if (!id) continue;
    const supabase = supabaseById.get(id);
    if (!supabase) {
      missingInSupabase.push(id);
      continue;
    }
    for (const column of columns) {
      const airtableValue = homeOverviewParityMetric(airtable, column, now);
      const supabaseValue = homeOverviewParityMetric(supabase, column, now);
      if (airtableValue !== supabaseValue) {
        differences.push({
          profile_id: id,
          profile_name: String(airtable?.name || supabase?.name || id),
          column,
          airtable: airtableValue,
          supabase: supabaseValue,
        });
      }
    }
    // Calendar slots drive several Home cells; catch slot drift even when a
    // rollup happens to match at this instant.
    if (sortedSlotFingerprint(airtable) !== sortedSlotFingerprint(supabase)) {
      const already = differences.some(
        (diff) => diff.profile_id === id && String(diff.column).startsWith("pipeline."),
      );
      if (!already) {
        differences.push({
          profile_id: id,
          profile_name: String(airtable?.name || supabase?.name || id),
          column: "approved_calendar_slots",
          airtable: sortedSlotFingerprint(airtable),
          supabase: sortedSlotFingerprint(supabase),
        });
      }
    }
  }
  for (const id of supabaseById.keys()) {
    if (id && !airtableById.has(id)) missingInAirtable.push(id);
  }

  const status = differences.length
    ? "mismatch"
    : (missingInSupabase.length || missingInAirtable.length)
      ? "incomplete_profile_scope"
      : "counts_match";

  return {
    status,
    columns: [...columns],
    compared_profiles: [...airtableById.keys()].filter((id) => id && supabaseById.has(id)).length,
    differences,
    missing_in_supabase: missingInSupabase,
    missing_in_airtable: missingInAirtable,
    note: status === "counts_match"
      ? "Airtable and Supabase Home overview display columns agree for the compared profiles."
      : "Airtable is authoritative; mismatched Home display columns should be reconciled to Airtable.",
  };
}

/**
 * Replace Supabase Home display fields with the Airtable row for every
 * mismatched profile so the UI (which recomputes from calendar slots) matches.
 */
export function reconcileHomeOverviewWithAirtable(supabaseRows, airtableRows, parity) {
  const airtableById = new Map((airtableRows || []).map((row) => [String(row?.id || ""), row]));
  const byProfile = new Map();
  for (const diff of parity?.differences || []) {
    const id = String(diff?.profile_id || "");
    if (!id) continue;
    if (!byProfile.has(id)) byProfile.set(id, []);
    byProfile.get(id).push(diff);
  }

  return (supabaseRows || []).map((row) => {
    const id = String(row?.id || "");
    const airtable = airtableById.get(id);
    const diffs = byProfile.get(id) || [];
    if (!airtable || !diffs.length) return row;

    const next = {
      ...row,
      ...airtable,
      id: row.id,
      name: airtable.name || row.name,
      city_label: airtable.city_label || row.city_label,
      scheduled: { ...(airtable.scheduled || {}) },
      awaiting_final_by_platform: { ...(airtable.awaiting_final_by_platform || {}) },
      pipeline_by_platform: { ...(airtable.pipeline_by_platform || {}) },
      approved_future_by_platform: { ...(airtable.approved_future_by_platform || {}) },
      approved_calendar_slots: Object.fromEntries(
        HOME_OVERVIEW_PLATFORM_ORDER.map((platform) => [
          platform,
          [...(airtable.approved_calendar_slots?.[platform] || [])],
        ]),
      ),
      metrics: {
        ...(row.metrics || {}),
        ...(airtable.metrics || {}),
        ideas_not_in_production: Number(airtable.ideas) || 0,
        manual_action_required: Number(airtable.manual) || 0,
        failed_outputs: Number(airtable.failed) || 0,
        awaiting_approval: Number(airtable.approval) || 0,
        overdue_unpublished: Number(airtable.approved_past_due ?? airtable.overdue_unpublished) || 0,
        approved_missing_date: Number(airtable.approved_missing_date) || 0,
        approved_unpublished: Number(airtable.approved_unpublished ?? airtable.approved_future) || 0,
      },
      parity_reconciled: true,
      parity_columns: diffs.map((diff) => diff.column),
      ideas_source: airtable.ideas_source || "airtable",
      read_source: "supabase_reconciled_airtable",
    };
    return next;
  });
}
