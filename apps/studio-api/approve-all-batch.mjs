/** Durable Approve All batch job helpers (Pipeline Settings JSON store). */

export const APPROVE_ALL_JOBS_SETTING = "APPROVE_ALL_JOBS_V1";
export const APPROVE_ALL_BATCH_SIZE = 3;
export const APPROVE_ALL_MAX_SLICES_PER_INVOKE = 8;
export const APPROVE_ALL_JOB_TTL_MS = 24 * 60 * 60 * 1000;
/** Airtable long text rejects Setting_Value above 100,000 characters. */
export const APPROVE_ALL_STORE_CHAR_BUDGET = 80000;
export const APPROVE_ALL_MAX_TERMINAL_JOBS = 3;

export function newApproveAllJobId() {
  return `aj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyApproveAllJobStore() {
  return { schema_version: 1, jobs: {}, active_by_profile: {} };
}

export function parseApproveAllJobStore(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      return emptyApproveAllJobStore();
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyApproveAllJobStore();
  }
  const jobs = parsed.jobs && typeof parsed.jobs === "object" && !Array.isArray(parsed.jobs)
    ? parsed.jobs
    : {};
  const active = parsed.active_by_profile && typeof parsed.active_by_profile === "object" && !Array.isArray(parsed.active_by_profile)
    ? parsed.active_by_profile
    : {};
  return {
    schema_version: 1,
    jobs: { ...jobs },
    active_by_profile: { ...active },
  };
}

/** Keep only schedule keys for this job's output record ids (Pipeline used to POST every row). */
export function slimApproveAllJobSchedules(job) {
  if (!job || typeof job !== "object") return job;
  const itemIds = new Set(
    (Array.isArray(job.items) ? job.items : [])
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean),
  );
  const schedules = job.schedules && typeof job.schedules === "object" && !Array.isArray(job.schedules)
    ? job.schedules
    : {};
  const slim = {};
  for (const id of itemIds) {
    const value = schedules[id];
    if (value != null && String(value).trim()) slim[id] = value;
  }
  return { ...job, schedules: slim };
}

export function pruneApproveAllJobStore(store, nowMs = Date.now(), limits = {}) {
  const maxChars = Number(limits.maxChars) > 0 ? Number(limits.maxChars) : APPROVE_ALL_STORE_CHAR_BUDGET;
  const maxTerminal = Number(limits.maxTerminalJobs) > 0
    ? Number(limits.maxTerminalJobs)
    : APPROVE_ALL_MAX_TERMINAL_JOBS;
  const next = parseApproveAllJobStore(store);
  for (const [id, job] of Object.entries(next.jobs)) {
    next.jobs[id] = slimApproveAllJobSchedules(job);
  }
  for (const [id, job] of Object.entries(next.jobs)) {
    const updated = Date.parse(job?.updated_at || job?.created_at || "") || 0;
    const terminal = job?.status === "completed" || job?.status === "failed";
    if (terminal && updated && nowMs - updated > APPROVE_ALL_JOB_TTL_MS) {
      delete next.jobs[id];
    }
  }
  const terminalIds = Object.entries(next.jobs)
    .filter(([, job]) => job?.status === "completed" || job?.status === "failed")
    .sort((a, b) => {
      const aMs = Date.parse(a[1]?.updated_at || a[1]?.created_at || "") || 0;
      const bMs = Date.parse(b[1]?.updated_at || b[1]?.created_at || "") || 0;
      return bMs - aMs;
    })
    .map(([id]) => id);
  for (const id of terminalIds.slice(maxTerminal)) {
    delete next.jobs[id];
  }
  const pack = () => JSON.stringify(next);
  while (pack().length > maxChars) {
    const drop = Object.entries(next.jobs)
      .filter(([, job]) => job?.status === "completed" || job?.status === "failed")
      .sort((a, b) => {
        const aMs = Date.parse(a[1]?.updated_at || a[1]?.created_at || "") || 0;
        const bMs = Date.parse(b[1]?.updated_at || b[1]?.created_at || "") || 0;
        return aMs - bMs;
      });
    if (!drop.length) break;
    delete next.jobs[drop[0][0]];
  }
  // Last resort: drop oldest non-active running/queued jobs if still over budget.
  while (pack().length > maxChars) {
    const drop = Object.entries(next.jobs)
      .filter(([id]) => !Object.values(next.active_by_profile).includes(id))
      .sort((a, b) => {
        const aMs = Date.parse(a[1]?.updated_at || a[1]?.created_at || "") || 0;
        const bMs = Date.parse(b[1]?.updated_at || b[1]?.created_at || "") || 0;
        return aMs - bMs;
      });
    if (!drop.length) break;
    delete next.jobs[drop[0][0]];
  }
  for (const [profileId, jobId] of Object.entries(next.active_by_profile)) {
    const job = next.jobs[jobId];
    if (!job || job.status === "completed" || job.status === "failed") {
      delete next.active_by_profile[profileId];
    }
  }
  return next;
}

export function approveAllJobCounts(job) {
  const items = Array.isArray(job?.items) ? job.items : [];
  let approved = 0;
  let failed = 0;
  let pending = 0;
  let skipped = 0;
  for (const item of items) {
    const status = String(item?.status || "");
    if (status === "approved") approved += 1;
    else if (status === "failed") failed += 1;
    else if (status === "skipped") skipped += 1;
    else pending += 1;
  }
  return {
    total: items.length,
    approved_count: approved,
    failed_count: failed,
    pending_count: pending,
    skipped_count: skipped,
    done_count: approved + failed + skipped,
  };
}

export function approveAllProgressMessage(job) {
  const counts = approveAllJobCounts(job);
  const status = String(job?.status || "");
  if (status === "queued") {
    return `Approve All queued · ${counts.total} output${counts.total === 1 ? "" : "s"}`;
  }
  if (status === "running" || status === "queued") {
    return `${counts.approved_count} of ${counts.total} approved · ${counts.failed_count} failed`;
  }
  if (status === "completed") {
    if (counts.failed_count) {
      return `Approve All finished · ${counts.approved_count} of ${counts.total} approved · ${counts.failed_count} failed`;
    }
    return `Approve All finished · ${counts.approved_count} of ${counts.total} approved`;
  }
  if (status === "failed") {
    return `Approve All stopped · ${counts.approved_count} of ${counts.total} approved · ${counts.failed_count} failed`;
  }
  return `${counts.approved_count} of ${counts.total} approved · ${counts.failed_count} failed`;
}

export function summarizeApproveAllJob(job) {
  if (!job || typeof job !== "object") return null;
  const counts = approveAllJobCounts(job);
  const failed = (Array.isArray(job.items) ? job.items : [])
    .filter((item) => item?.status === "failed")
    .map((item) => ({
      id: item.id,
      output_id: item.output_id || null,
      platform: item.platform || null,
      format: item.format || null,
      error: item.error || "Approval failed",
    }));
  const approved = (Array.isArray(job.items) ? job.items : [])
    .filter((item) => item?.status === "approved")
    .map((item) => ({
      id: item.id,
      output_id: item.output_id || null,
      platform: item.platform || null,
      format: item.format || null,
    }));
  return {
    ok: true,
    action: "approve_all_for_publishing",
    job_id: job.id,
    status: job.status,
    batch: true,
    dispatch_deferred: true,
    profile_id: job.profile_id || null,
    created_at: job.created_at || null,
    updated_at: job.updated_at || null,
    total: counts.total,
    approved_count: counts.approved_count,
    failed_count: counts.failed_count,
    pending_count: counts.pending_count,
    skipped_count: counts.skipped_count,
    done_count: counts.done_count,
    can_retry: counts.failed_count > 0 && (job.status === "completed" || job.status === "failed"),
    message: approveAllProgressMessage(job),
    approved,
    failed,
  };
}

export function buildApproveAllJob({
  jobId,
  profileId,
  note,
  schedules,
  records,
  stamp,
}) {
  const items = (records || []).map((record) => ({
    id: record.id,
    output_id: record.output_id || null,
    platform: record.platform || null,
    format: record.format || null,
    status: "pending",
    error: null,
  }));
  const itemIds = new Set(items.map((item) => item.id).filter(Boolean));
  const incoming = schedules && typeof schedules === "object" && !Array.isArray(schedules)
    ? schedules
    : {};
  const slimSchedules = {};
  for (const id of itemIds) {
    const value = incoming[id];
    if (value != null && String(value).trim()) slimSchedules[id] = value;
  }
  return {
    id: jobId,
    status: "queued",
    profile_id: profileId || null,
    notes: note || "",
    schedules: slimSchedules,
    items,
    created_at: stamp,
    updated_at: stamp,
    batch_size: APPROVE_ALL_BATCH_SIZE,
  };
}

export function resetFailedApproveAllItems(job, stamp) {
  const next = { ...job, items: (job.items || []).map((item) => ({ ...item })) };
  for (const item of next.items) {
    if (item.status === "failed") {
      item.status = "pending";
      item.error = null;
    }
  }
  next.status = "queued";
  next.updated_at = stamp;
  return next;
}

export function nextPendingApproveAllItems(job, limit = APPROVE_ALL_BATCH_SIZE) {
  const max = Math.max(1, Math.min(12, Number(limit) || APPROVE_ALL_BATCH_SIZE));
  return (job.items || []).filter((item) => item.status === "pending").slice(0, max);
}

export function finalizeApproveAllJobStatus(job, stamp) {
  const counts = approveAllJobCounts(job);
  const next = { ...job, updated_at: stamp || new Date().toISOString() };
  if (counts.pending_count > 0) {
    next.status = "running";
    return next;
  }
  next.status = counts.failed_count > 0 && counts.approved_count === 0 ? "failed" : "completed";
  return next;
}
