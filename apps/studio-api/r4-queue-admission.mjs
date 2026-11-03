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
export function hasEligibleManualRenderPriority(records, controls = null) {
  const eligible = new Set((Array.isArray(records) ? records : []).map(row => String(row?.id || "")).filter(Boolean));
  return Array.isArray(controls?.render_priority) &&
    controls.render_priority.some(id => eligible.has(String(id || "")));
}

export function rotateR4CandidatesAfterCursor(records, cursor, controls = null) {
  const entries = Array.isArray(records) ? records : [];
  // R2 may retain priorities of outputs already rendered or published. Those
  // are NOT active operator overrides and must never disable queue fairness.
  if (!entries.length || hasEligibleManualRenderPriority(entries, controls)) return entries;
  const index = entries.findIndex((row) => row?.id === cursor);
  if (index < 0) return entries;
  return [...entries.slice(index + 1), ...entries.slice(0, index + 1)];
}
