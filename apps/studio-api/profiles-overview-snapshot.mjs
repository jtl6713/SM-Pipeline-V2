/** Materialized All Profiles home overview (flat counts). */

export const STUDIO_PROFILES_OVERVIEW_SNAPSHOT_SETTING = "STUDIO_PROFILES_OVERVIEW_SNAPSHOT_V1";
/** Serve snapshot without rescanning Platform Outputs / Ideas. */
export const STUDIO_PROFILES_OVERVIEW_SNAPSHOT_FRESH_MS = 120 * 1000;
/** Background rebuild cadence target (heavy cron also refreshes). */
export const STUDIO_PROFILES_OVERVIEW_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;

export function emptyOverviewSnapshot(stamp = new Date().toISOString()) {
  return {
    schema_version: 1,
    updated_at: stamp,
    rows: [],
  };
}

export function parseOverviewSnapshot(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  return {
    schema_version: 1,
    updated_at: String(parsed.updated_at || "").trim() || null,
    rows: rows
      .filter((row) => row && typeof row === "object" && String(row.id || "").trim())
      .map((row) => ({
        id: String(row.id).trim(),
        name: String(row.name || row.city_label || row.id || "").trim(),
        city_label: String(row.city_label || "").trim(),
        scheduled: row.scheduled && typeof row.scheduled === "object" ? row.scheduled : {},
        manual: Number(row.manual) || 0,
        failed: Number(row.failed) || 0,
        approval: Number(row.approval) || 0,
        ideas: Number(row.ideas) || 0,
      })),
  };
}

export function isOverviewSnapshotFresh(snapshot, nowMs = Date.now(), freshMs = STUDIO_PROFILES_OVERVIEW_SNAPSHOT_FRESH_MS) {
  const updated = Date.parse(snapshot?.updated_at || "");
  if (!Number.isFinite(updated)) return false;
  return nowMs - updated <= Math.max(1000, Number(freshMs) || STUDIO_PROFILES_OVERVIEW_SNAPSHOT_FRESH_MS);
}

export function filterOverviewSnapshotRows(rows, authorizedProfileIds) {
  const ids = authorizedProfileIds instanceof Set
    ? authorizedProfileIds
    : new Set((authorizedProfileIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  if (!ids.size) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => ids.has(String(row?.id || "").trim()));
}

export function serializeOverviewSnapshot(snapshot) {
  const next = parseOverviewSnapshot(snapshot) || emptyOverviewSnapshot();
  return JSON.stringify(next);
}
