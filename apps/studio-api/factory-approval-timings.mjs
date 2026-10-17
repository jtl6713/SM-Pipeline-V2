/**
 * Pure, bounded timing analysis for durable Factory approval stages.
 * Timings are measurements of backend work, NOT the future posting date.
 * Older jobs without a stage timeline remain "unmeasured" rather than
 * receiving invented timestamps.
 */
export const FACTORY_APPROVAL_TARGET_MS = 60_000;
export const FACTORY_APPROVAL_TIMING_PAIRS = Object.freeze([
  ["queue_wait", "queued", "processing"],
  ["preflight_airtable_fetch", "preflight_fetch_started", "preflight_fetch_finished"],
  ["profile_ownership_check", "ownership_check_started", "ownership_check_finished"],
  ["canonical_approval", "approval_started", "approval_finished"],
  ["approval_lease_wait", "approval_lease_wait_started", "approval_lease_acquired"],
  ["schedule_slot_selection", "slot_search_started", "slot_search_finished"],
  ["airtable_schedule_commit", "schedule_write_started", "schedule_write_finished"],
  ["schedule_verification", "schedule_verify_started", "schedule_verify_finished"],
  ["supabase_sync", "supabase_sync_started", "supabase_sync_finished"],
]);

const millis = value => {
  const number = Date.parse(String(value || ""));
  return Number.isFinite(number) ? number : null;
};
const delta = (a, b) => {
  const start = millis(a), end = millis(b);
  return start === null || end === null || end < start ? null : end - start;
};
function positiveNumber(value) { return Number.isFinite(value) && value >= 0; }
function percentile(sorted, proportion) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * proportion) - 1)] : null;
}
export function factoryApprovalItemTiming(item = {}) {
  const timeline = Array.isArray(item?.timeline) ? item.timeline.slice(-180) : [];
  if (!timeline.length) return null;
  const events = timeline.map((entry, index) => ({
    state: String(entry?.state || "").slice(0, 64),
    at: String(entry?.at || ""),
    attempt: Number(entry?.attempt) || 0,
    since_previous_ms: index ? delta(timeline[index - 1]?.at, entry?.at) : null,
  }));
  const attempts = [...new Set(events.map(entry => entry.attempt).filter(x => x > 0))];
  const durations_ms = {};
  for (const [metric, start, end] of FACTORY_APPROVAL_TIMING_PAIRS) {
    let total = 0, count = 0;
    for (const attempt of metric === "queue_wait" ? [0] : attempts) {
      const begin = metric === "queue_wait"
        ? events.find(entry => entry.state === "queued")
        : events.find(entry => entry.attempt === attempt && entry.state === start);
      const finish = metric === "queue_wait"
        ? events.find(entry => entry.state === "processing")
        : events.find(entry => entry.attempt === attempt && entry.state === end);
      const measured = delta(begin?.at, finish?.at);
      if (measured !== null) { total += measured; count++; }
    }
    if (count) durations_ms[metric] = total;
  }
  // Sum completed processing attempts, excluding idle intervals between
  // bounded retries. An interrupted worker has a start but no end.
  let processingMs = 0, processingCount = 0;
  let longestAttempt = 0;
  for (const attempt of attempts) {
    const begin = events.find(e => e.attempt === attempt && e.state === "processing");
    const finish = events.find(e => e.attempt === attempt
      && ["approved", "already_satisfied", "failed", "pending"].includes(e.state));
    const d = delta(begin?.at, finish?.at);
    if (d !== null) { processingMs += d; processingCount++; longestAttempt = Math.max(longestAttempt, d); }
  }
  if (processingCount) {
    durations_ms.worker_processing = processingMs;
    durations_ms.max_single_attempt_processing = longestAttempt;
  }
  const queued = events.find(e => e.state === "queued");
  const terminal = events.findLast(e => ["approved", "already_satisfied", "failed"].includes(e.state));
  const total = delta(queued?.at, terminal?.at);
  if (total !== null) {
    durations_ms.enqueue_to_terminal = total;
    if (processingCount) durations_ms.waiting_and_retry = Math.max(0,total-processingMs);
  }
  return {
    events, durations_ms,
    attempts_observed: attempts.length, complete: Boolean(terminal),
    performance_budget: {
      target_ms: FACTORY_APPROVAL_TARGET_MS,
      worker_processing_pass: processingCount ? longestAttempt <= FACTORY_APPROVAL_TARGET_MS : null,
      end_to_end_pass: total !== null ? total <= FACTORY_APPROVAL_TARGET_MS : null,
    },
  };
}
export function factoryApprovalTimingReport(items = []) {
  const measurements = (items || []).map(factoryApprovalItemTiming).filter(Boolean);
  const keys = ["queue_wait", "preflight_airtable_fetch", "profile_ownership_check",
    "canonical_approval", "approval_lease_wait", "schedule_slot_selection",
    "airtable_schedule_commit", "schedule_verification", "supabase_sync",
    "worker_processing", "max_single_attempt_processing",
    "waiting_and_retry", "enqueue_to_terminal"];
  const metrics = {};
  for (const name of keys) {
    const values = measurements.map(item => item.durations_ms[name]).filter(positiveNumber).sort((a,b) => a-b);
    if (!values.length) continue;
    metrics[name] = {
      count: values.length,
      mean_ms: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      p50_ms: percentile(values, 0.5),
      p95_ms: percentile(values, 0.95),
      p99_ms: percentile(values, 0.99),
      max_ms: values.at(-1),
      over_target_count: values.filter(value => value > FACTORY_APPROVAL_TARGET_MS).length,
    };
  }
  return {
    schema: "studio.factory-approval-timing.1",
    items: items.length,
    instrumented: measurements.length,
    completed_timelines: measurements.filter(item => item.complete).length,
    performance_budget: {
      target_ms: FACTORY_APPROVAL_TARGET_MS,
      measured_end_to_end: metrics.enqueue_to_terminal?.count || 0,
      end_to_end_over_target: metrics.enqueue_to_terminal?.over_target_count || 0,
      measured_attempt_processing: metrics.max_single_attempt_processing?.count || 0,
      attempt_processing_over_target: metrics.max_single_attempt_processing?.over_target_count || 0,
    },
    metrics,
  };
}
