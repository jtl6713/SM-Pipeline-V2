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
/**
 * Interleave R4 candidate profiles while preserving FIFO inside each profile.
 * The last *confirmed* rendered profile is persisted outside this pure helper.
 * Live operator priorities always override automatic fairness.
 */
export function fairR4ProfileOrder(records, lastProfile, controls = null,
  field = (row, name) => row?.fields?.[name]) {
  const entries = Array.isArray(records) ? records : [];
  const liveIds = new Set(entries.map(row => String(row?.id || "")));
  if (Array.isArray(controls?.render_priority) &&
      controls.render_priority.some(id => liveIds.has(String(id)))) return entries;
  const groups = new Map();
  const keyFor = (row) => {
    const linked = field(row, "Content_Profile");
    const value = Array.isArray(linked) ? linked[0] : linked;
    const id = value && typeof value === "object" ? value.id : value;
    return String(id || "").trim() || "__unscoped__";
  };
  for (const row of entries) {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  if (groups.size < 2) return entries;
  const profiles = [...groups.keys()];
  const lastIndex = profiles.indexOf(String(lastProfile || "").trim());
  const start = lastIndex < 0 ? 0 : (lastIndex + 1) % profiles.length;
  const order = [...profiles.slice(start), ...profiles.slice(0, start)];
  const result = [];
  const maxLength = Math.max(...order.map(key => groups.get(key).length));
  for (let i = 0; i < maxLength; i++) {
    for (const profile of order) {
      const candidate = groups.get(profile)[i];
      if (candidate) result.push(candidate);
    }
  }
  return result;
}


/**
 * R4 uses Supabase end-to-end only when the actual output write selector and
 * its connection are both live. Historical Airtable cooldown is irrelevant in
 * that case. Preserve the legacy cooldown fence otherwise; the R4 dispatcher
 * still performs its own one-slot/lease and provider safety checks.
 */
export function r4CronAdmissionAllowed({ writeSource, supabaseConfigured, airtableCooldownMs, failFastMs } = {}) {
  if (writeSource === "supabase" && supabaseConfigured === true) return true;
  return Number(airtableCooldownMs) <= Number(failFastMs);
}
