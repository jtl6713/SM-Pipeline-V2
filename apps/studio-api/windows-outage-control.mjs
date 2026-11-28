// Issue #3159: temporary, source-controlled emergency admission fence.
// Changing the recovery watermark requires the normal protected Worker release.
// Never infer permission to resume from an ISP or a healthy Worker alone.
export const WINDOWS_OUTAGE_STARTED_AT = "2026-11-26T09:00:00.000Z";
// Set only to a verified recovery instant after runner/media/DB/canary checks,
// interrupted attempt reconciliation and scheduler capacity validation.
export const WINDOWS_OUTAGE_RESUMED_AT = null;
// Stage 1: restore bounded nonpublishing work independently of the publication fence.
export const WINDOWS_OUTAGE_PRODUCTION_ENABLED = true;

export function windowsOutageProductionPaused(nowMs = Date.now(), resumedAt = WINDOWS_OUTAGE_RESUMED_AT, enabled = WINDOWS_OUTAGE_PRODUCTION_ENABLED) {
  return windowsOutageState(nowMs, resumedAt).active && enabled !== true;
}

export function windowsOutageCronInventoryAllowed(crons, nowMs = Date.now(), resumedAt = WINDOWS_OUTAGE_RESUMED_AT, enabled = WINDOWS_OUTAGE_PRODUCTION_ENABLED) {
  if (!Array.isArray(crons)) return false;
  if (!windowsOutageState(nowMs, resumedAt).active) return true;
  return crons.length === 0 || (enabled === true && crons.length === 1 && crons[0] === "* * * * *");
}

export function windowsOutageState(nowMs = Date.now(), resumedAt = WINDOWS_OUTAGE_RESUMED_AT) {
  const start = Date.parse(WINDOWS_OUTAGE_STARTED_AT);
  const resume = typeof resumedAt === "string" ? Date.parse(resumedAt) : NaN;
  const active = !Number.isFinite(nowMs) || !Number.isFinite(resume) ||
    resume < start || resume > nowMs;
  return { active, started_at: WINDOWS_OUTAGE_STARTED_AT,
    resumed_at: active ? null : new Date(resume).toISOString() };
}

// A missed reservation is not an authorization to catch up immediately.
// Preserve it for governed MAE rebooking; never touch provider receipts.
export function windowsOutagePublishBlock(dueMs, nowMs = Date.now(), resumedAt = WINDOWS_OUTAGE_RESUMED_AT) {
  const state = windowsOutageState(nowMs, resumedAt);
  if (state.active) return "windows_outage_paused";
  if (!Number.isFinite(dueMs)) return "schedule_required";
  if (dueMs <= Date.parse(state.resumed_at)) return "outage_overdue_requires_mae_reschedule";
  return null;
}
