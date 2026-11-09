export const PROFILES_OVERVIEW_REFRESH_STATE_KEY = "studio/state/profiles-overview-refresh-v1.json";
export const PROFILES_OVERVIEW_REFRESH_COOLDOWN_MS = 15_000;
export const PROFILES_OVERVIEW_REFRESH_STALE_MS = 120_000;

function nowMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
}

function iso(ms = Date.now()) {
  return new Date(nowMs(ms)).toISOString();
}

function operationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `overview-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeProfilesOverviewRefreshState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    version: 1,
    status: String(state.status || "idle"),
    operation_id: String(state.operation_id || ""),
    revision: Number(state.revision || 0),
    requested_at: String(state.requested_at || ""),
    started_at: String(state.started_at || ""),
    completed_at: String(state.completed_at || ""),
    failed_at: String(state.failed_at || ""),
    baseline_snapshot_at: Number(state.baseline_snapshot_at || 0),
    baseline_generation: String(state.baseline_generation || ""),
    snapshot_at: Number(state.snapshot_at || 0),
    snapshot_generation: String(state.snapshot_generation || ""),
    ideas_at: Number(state.ideas_at || 0),
    read_source: String(state.read_source || ""),
    duration_ms: Number(state.duration_ms || 0),
    error: String(state.error || ""),
    component_status: state.component_status && typeof state.component_status === "object"
      ? { ...state.component_status }
      : {},
    home_parity: state.home_parity && typeof state.home_parity === "object"
      ? { ...state.home_parity }
      : null,
  };
}

export function profilesOverviewRefreshAgeMs(state, now = Date.now()) {
  const normalized = normalizeProfilesOverviewRefreshState(state);
  const stamp = Date.parse(
    normalized.completed_at
      || normalized.failed_at
      || normalized.started_at
      || normalized.requested_at
      || "",
  );
  if (!Number.isFinite(stamp)) return Infinity;
  return Math.max(0, nowMs(now) - stamp);
}

export function publicProfilesOverviewRefreshState(state, now = Date.now()) {
  const normalized = normalizeProfilesOverviewRefreshState(state);
  const ageMs = profilesOverviewRefreshAgeMs(normalized, now);
  const cooldownRemainingMs = normalized.status === "completed"
    ? Math.max(0, PROFILES_OVERVIEW_REFRESH_COOLDOWN_MS - ageMs)
    : 0;
  const stale = normalized.status === "refreshing" && ageMs >= PROFILES_OVERVIEW_REFRESH_STALE_MS;
  return {
    status: stale ? "failed" : normalized.status,
    operation_id: normalized.operation_id || null,
    revision: normalized.revision,
    requested_at: normalized.requested_at || null,
    started_at: normalized.started_at || null,
    completed_at: normalized.completed_at || null,
    failed_at: stale ? iso(now) : (normalized.failed_at || null),
    baseline_snapshot_at: normalized.baseline_snapshot_at || null,
    baseline_generation: normalized.baseline_generation || null,
    snapshot_at: normalized.snapshot_at || null,
    snapshot_generation: normalized.snapshot_generation || null,
    ideas_at: normalized.ideas_at || null,
    read_source: normalized.read_source || null,
    duration_ms: normalized.duration_ms || null,
    error: stale
      ? "Refresh operation expired before completion; the previous complete snapshot is still in use."
      : (normalized.error || null),
    component_status: normalized.component_status,
    home_parity: normalized.home_parity,
    cooldown_remaining_ms: cooldownRemainingMs,
    stale_operation: stale,
  };
}

export async function readProfilesOverviewRefreshStateRecord(env) {
  if (!env?.STUDIO_MEDIA?.get) return { state: normalizeProfilesOverviewRefreshState(null), etag: "", httpEtag: "" };
  const object = await env.STUDIO_MEDIA.get(PROFILES_OVERVIEW_REFRESH_STATE_KEY);
  if (!object) return { state: normalizeProfilesOverviewRefreshState(null), etag: "", httpEtag: "" };
  let parsed = {};
  try {
    parsed = await object.json();
  } catch {
    parsed = {};
  }
  return {
    state: normalizeProfilesOverviewRefreshState(parsed),
    etag: String(object.etag || ""),
    httpEtag: String(object.httpEtag || ""),
  };
}

async function conditionalWriteProfilesOverviewRefreshState(env, state, record) {
  if (!env?.STUDIO_MEDIA?.put) throw new Error("STUDIO_MEDIA binding is not configured");
  const headers = new Headers();
  if (record?.etag) {
    headers.set("If-Match", record.httpEtag || `"${record.etag}"`);
  } else {
    headers.set("If-None-Match", "*");
  }
  const saved = await env.STUDIO_MEDIA.put(
    PROFILES_OVERVIEW_REFRESH_STATE_KEY,
    JSON.stringify(normalizeProfilesOverviewRefreshState(state)),
    {
      onlyIf: headers,
      httpMetadata: { contentType: "application/json" },
    },
  );
  return saved || null;
}

export async function claimProfilesOverviewRefresh(env, options = {}) {
  const now = nowMs(options.now);
  const cooldownMs = Math.max(0, Number(options.cooldownMs ?? PROFILES_OVERVIEW_REFRESH_COOLDOWN_MS));
  const staleMs = Math.max(10_000, Number(options.staleMs ?? PROFILES_OVERVIEW_REFRESH_STALE_MS));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const record = await readProfilesOverviewRefreshStateRecord(env);
    const current = record.state;
    const ageMs = profilesOverviewRefreshAgeMs(current, now);

    if (current.status === "refreshing" && ageMs < staleMs) {
      return { claimed: false, reason: "in_progress", state: publicProfilesOverviewRefreshState(current, now) };
    }
    if (current.status === "completed" && ageMs < cooldownMs) {
      return {
        claimed: false,
        reason: "cooldown",
        state: {
          ...publicProfilesOverviewRefreshState(current, now),
          status: "cooling_down",
          cooldown_remaining_ms: Math.max(0, cooldownMs - ageMs),
        },
      };
    }
    if (current.status === "failed" && ageMs < Math.min(cooldownMs, 5_000)) {
      return {
        claimed: false,
        reason: "cooldown",
        state: {
          ...publicProfilesOverviewRefreshState(current, now),
          status: "cooling_down",
          cooldown_remaining_ms: Math.max(0, Math.min(cooldownMs, 5_000) - ageMs),
        },
      };
    }

    const next = normalizeProfilesOverviewRefreshState({
      status: "refreshing",
      operation_id: operationId(),
      revision: current.revision + 1,
      requested_at: iso(now),
      started_at: "",
      completed_at: "",
      failed_at: "",
      baseline_snapshot_at: Number(options.baselineSnapshotAt || 0),
      baseline_generation: String(options.baselineGeneration || ""),
      snapshot_at: 0,
      snapshot_generation: "",
      ideas_at: 0,
      read_source: "",
      duration_ms: 0,
      error: "",
      component_status: { outputs: "refreshing", ideas: "refreshing" },
    });
    const saved = await conditionalWriteProfilesOverviewRefreshState(env, next, record);
    if (saved) return { claimed: true, reason: "claimed", state: publicProfilesOverviewRefreshState(next, now) };
  }
  const latest = await readProfilesOverviewRefreshStateRecord(env);
  return { claimed: false, reason: "in_progress", state: publicProfilesOverviewRefreshState(latest.state, now) };
}

export async function patchProfilesOverviewRefreshState(env, operationIdValue, patch = {}, options = {}) {
  const expected = String(operationIdValue || "");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const record = await readProfilesOverviewRefreshStateRecord(env);
    const current = record.state;
    if (!expected || current.operation_id !== expected) {
      return { updated: false, state: publicProfilesOverviewRefreshState(current, options.now) };
    }
    const next = normalizeProfilesOverviewRefreshState({
      ...current,
      ...patch,
      operation_id: current.operation_id,
      revision: current.revision,
    });
    const saved = await conditionalWriteProfilesOverviewRefreshState(env, next, record);
    if (saved) return { updated: true, state: publicProfilesOverviewRefreshState(next, options.now) };
  }
  const latest = await readProfilesOverviewRefreshStateRecord(env);
  return { updated: false, state: publicProfilesOverviewRefreshState(latest.state, options.now) };
}
