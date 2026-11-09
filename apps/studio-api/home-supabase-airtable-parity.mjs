/**
 * Home All-Profiles column parity: Airtable remains the write source of truth.
 * When STUDIO_HOME_READ_SOURCE=supabase, force refresh compares the live
 * Supabase overview rows to a same-scope Airtable rebuild and reconciles any
 * mismatched display columns to the Airtable values.
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
  "scheduled.Facebook",
  "scheduled.Instagram",
  "scheduled.TikTok",
  "scheduled.YouTube",
]);

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

export function homeOverviewParityMetric(row, column) {
  return nestedNumber(row, column);
}

function setNestedNumber(row, path, value) {
  const parts = String(path || "").split(".");
  if (parts.length === 1) {
    row[parts[0]] = value;
    return;
  }
  let cursor = row;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

export function compareHomeOverviewParity(airtableRows, supabaseRows, {
  columns = HOME_OVERVIEW_PARITY_COLUMNS,
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
      const airtableValue = homeOverviewParityMetric(airtable, column);
      const supabaseValue = homeOverviewParityMetric(supabase, column);
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
      ? "Airtable and Supabase Home overview columns agree for the compared profiles."
      : "Airtable is authoritative; mismatched Home columns should be reconciled to Airtable.",
  };
}

/**
 * Copy Airtable values onto Supabase rows for every mismatched column.
 * Unchanged columns keep the Supabase projection.
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
      scheduled: { ...(row.scheduled || {}) },
      metrics: { ...(row.metrics || {}) },
      parity_reconciled: true,
      parity_columns: diffs.map((diff) => diff.column),
    };
    for (const diff of diffs) {
      const value = homeOverviewParityMetric(airtable, diff.column);
      setNestedNumber(next, diff.column, value);
      if (diff.column === "ideas") {
        next.ideas_source = "airtable";
        next.metrics.ideas_not_in_production = value;
      }
      if (diff.column === "manual") next.metrics.manual_action_required = value;
      if (diff.column === "failed") next.metrics.failed_outputs = value;
      if (diff.column === "approval") next.metrics.awaiting_approval = value;
      if (diff.column === "approved_past_due") next.metrics.overdue_unpublished = value;
      if (diff.column === "approved_missing_date") next.metrics.approved_missing_date = value;
      if (diff.column === "approved_future") next.metrics.approved_unpublished = next.metrics.approved_unpublished;
    }
    next.read_source = "supabase_reconciled_airtable";
    return next;
  });
}
