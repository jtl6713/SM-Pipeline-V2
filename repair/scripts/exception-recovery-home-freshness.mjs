/**
 * Stage 3 audit-only Home freshness guard.
 * A refresh is an operator-authorized cache/summary rebuild, not an output,
 * schedule, provider, or Supabase write. Fail closed on incomplete generations.
 */
export function assessHomeRefresh(body, atMs = Date.now(), { maxAgeMs = 60000 } = {}) {
  const refresh = body?.refresh;
  if (!refresh || typeof refresh !== "object" || !Number.isFinite(atMs))
    return { status: "unavailable", reason: "home_refresh_status_unavailable" };
  const state = String(refresh.status || "");
  if (state === "refreshing") return { status: "building" };
  if (state === "cooling_down") return { status: "cooling_down",
    retry_after_ms: Number(refresh.retry_after_ms ?? refresh.cooldown_remaining_ms ?? 0) };
  if (state === "failed") return { status: "failed",
    reason: String(refresh.error || "home_refresh_failed").slice(0,160) };
  const at = Number(refresh.snapshot_at);
  const gen = String(refresh.snapshot_generation || "");
  const parts = refresh.component_status || {};
  const age = atMs - at;
  const complete = state === "completed" && gen
    && parts.outputs === "completed" && parts.ideas === "completed"
    && Number.isSafeInteger(at) && at > 0 && age >= 0;
  if (!complete) return { status: "needs_refresh", reason: "home_generation_incomplete_or_absent" };
  return {
    status: age <= maxAgeMs ? "fresh" : "needs_refresh",
    generation: gen, snapshot_at: at, age_ms: age,
    reason: age <= maxAgeMs ? null : "home_generation_too_old",
  };
}

export function verifyHomeOverviewGeneration(overview, assessment) {
  if (assessment?.status !== "fresh" || overview?.ok !== true
      || overview?.snapshot_generation !== assessment.generation
      || Number(overview?.snapshot_at) !== assessment.snapshot_at
      || !Array.isArray(overview.records) || overview.records.length !== 4)
    return false;
  return overview.records.every((x) => x && Number.isFinite(x.approved_past_due)
    && Number.isFinite(x.approved_missing_date) && Number.isFinite(x.failed));
}
