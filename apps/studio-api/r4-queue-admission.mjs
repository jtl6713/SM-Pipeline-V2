/**
 * Only an authoritative Python R4 launch with a saved Remotion job is an
 * admission. StageResult(status="skipped") is HTTP 200 but NOT success.
 */
export function r4StartConfirmed(payload) {
  const run = payload?.details?.run;
  return payload?.stage === "r4" &&
    payload?.status === "ok" &&
    run?.processed === true &&
    Boolean(String(run?.job_id || "").trim());
}

/**
 * Yield to younger queue work after a skipped head without changing an
 * output's approval, schedule or media. Explicit operator priorities win.
 */
export function rotateR4CandidatesAfterCursor(records, cursor, controls = null) {
  const entries = Array.isArray(records) ? records : [];
  // Only priority IDs that are still eligible R4 candidates may disable the
  // fairness cursor. Published/rendered IDs can persist in the R2 controls
  // and must not permanently serialize the queue behind one skipped head.
  const eligibleIds = new Set(entries.map(row => String(row?.id || "")));
  const hasLivePriority = Array.isArray(controls?.render_priority) &&
    controls.render_priority.some(id => eligibleIds.has(String(id)));
  if (!entries.length || hasLivePriority) return entries;
  const index = entries.findIndex((row) => row?.id === cursor);
  if (index < 0) return entries;
  return [...entries.slice(index + 1), ...entries.slice(0, index + 1)];
}
