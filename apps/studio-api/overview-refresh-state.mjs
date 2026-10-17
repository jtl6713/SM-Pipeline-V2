export const OVERVIEW_REFRESH_STATE_KEY = "studio/state/profiles-overview-refresh-v1.json";
export const OVERVIEW_REFRESH_LOCK_KEY = "studio/state/profiles-overview-refresh-lock-v1.json";
export const OVERVIEW_REFRESH_COOLDOWN_MS = 15 * 1000;
export const OVERVIEW_REFRESH_STALE_MS = 90 * 1000;

export function normalizeOverviewRefreshState(value = {}) {
  const status = ["idle", "refreshing", "completed", "failed", "cooling_down"].includes(String(value?.status || ""))
    ? String(value.status)
    : "idle";
  return {
    status,
    operation_id: String(value?.operation_id || ""),
    requested_at: String(value?.requested_at || ""),
    started_at: String(value?.started_at || ""),
    updated_at: String(value?.updated_at || ""),
    completed_at: String(value?.completed_at || ""),
    failed_at: String(value?.failed_at || ""),
    cooldown_until: String(value?.cooldown_until || ""),
    previous_snapshot_at: Number(value?.previous_snapshot_at || 0) || 0,
    previous_snapshot_generation: String(value?.previous_snapshot_generation || ""),
    snapshot_at: Number(value?.snapshot_at || 0) || 0,
    snapshot_generation: String(value?.snapshot_generation || ""),
    duration_ms: Number(value?.duration_ms || 0) || 0,
    reason: String(value?.reason || ""),
    component: String(value?.component || ""),
    source: String(value?.source || ""),
    ideas_at: Number(value?.ideas_at || 0) || 0,
  };
}

export function overviewRefreshIsActive(state, now = Date.now()) {
  const normalized = normalizeOverviewRefreshState(state);
  if (normalized.status !== "refreshing") return false;
  const updated = Date.parse(normalized.updated_at || normalized.started_at || normalized.requested_at || "");
  if (!Number.isFinite(updated)) return false;
  return Number(now) - updated < OVERVIEW_REFRESH_STALE_MS;
}

export function overviewRefreshIsStale(state, now = Date.now()) {
  const normalized = normalizeOverviewRefreshState(state);
  if (normalized.status !== "refreshing") return false;
  return !overviewRefreshIsActive(normalized, now);
}

export function overviewRefreshCooldownRemainingMs(state, now = Date.now()) {
  const normalized = normalizeOverviewRefreshState(state);
  const until = Date.parse(normalized.cooldown_until || "");
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - Number(now));
}

export function nextOverviewSnapshotGeneration(previousGeneration = "", now = Date.now()) {
  const previous = Number(String(previousGeneration || "").split("-")[0]) || 0;
  const stamp = Math.max(Number(now) || Date.now(), previous + 1);
  return String(stamp);
}

export function publicOverviewRefreshState(state, snapshot = null, now = Date.now()) {
  const normalized = normalizeOverviewRefreshState(state);
  const stale = overviewRefreshIsStale(normalized, now);
  const status = stale ? "failed" : normalized.status;
  const snapshotAt = Number(snapshot?.at || normalized.snapshot_at || 0) || 0;
  const snapshotGeneration = String(snapshot?.generation || normalized.snapshot_generation || "");
  return {
    status,
    requested_at: normalized.requested_at || null,
    started_at: normalized.started_at || null,
    completed_at: normalized.completed_at || null,
    failed_at: stale ? (normalized.updated_at || normalized.started_at || normalized.requested_at || null) : (normalized.failed_at || null),
    cooldown_until: normalized.cooldown_until || null,
    snapshot_at: snapshotAt || null,
    snapshot_generation: snapshotGeneration || null,
    previous_snapshot_at: normalized.previous_snapshot_at || null,
    previous_snapshot_generation: normalized.previous_snapshot_generation || null,
    duration_ms: normalized.duration_ms || null,
    source: String(snapshot?.readSource || normalized.source || "") || null,
    ideas_at: Number(snapshot?.ideasAt || normalized.ideas_at || 0) || null,
    fresh: Boolean(snapshotAt && Date.now() - snapshotAt < 60_000),
    stale: Boolean(stale),
    reason: stale ? "The prior refresh did not complete. Start Refresh again to retry." : (normalized.reason || null),
    component: normalized.component || null,
  };
}

export function overviewRefreshFailureComponent(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("idea")) return "ideas";
  if (message.includes("output") || message.includes("scheduled")) return "outputs";
  if (message.includes("profile")) return "profiles";
  if (message.includes("snapshot") || message.includes("r2")) return "snapshot";
  return "overview";
}
