/** Durable Pipeline calendar schedule-regeneration job helpers. */

import { maeSortRegenCombinations } from "./mae-schedule.mjs";

export const SCHEDULE_REGEN_JOBS_SETTING = "SCHEDULE_REGEN_JOBS_V1";
export const SCHEDULE_REGEN_JOB_TTL_MS = 24 * 60 * 60 * 1000;
export const SCHEDULE_REGEN_STORE_CHAR_BUDGET = 80000;
export const SCHEDULE_REGEN_MAX_TERMINAL_JOBS = 3;

export const SCHEDULE_REGEN_STATUS = Object.freeze({
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
});

export function newScheduleRegenJobId() {
  return `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyScheduleRegenJobStore() {
  return { schema_version: 1, jobs: {}, active_by_scope: {} };
}

export function parseScheduleRegenJobStore(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      return emptyScheduleRegenJobStore();
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyScheduleRegenJobStore();
  }
  const jobs = parsed.jobs && typeof parsed.jobs === "object" && !Array.isArray(parsed.jobs)
    ? parsed.jobs
    : {};
  const active = parsed.active_by_scope && typeof parsed.active_by_scope === "object" && !Array.isArray(parsed.active_by_scope)
    ? parsed.active_by_scope
    : {};
  return {
    schema_version: 1,
    jobs: { ...jobs },
    active_by_scope: { ...active },
  };
}

export function scheduleRegenCombinationKey(combo) {
  const platform = String(combo?.platform || "").trim().toLowerCase();
  const outputType = String(combo?.output_type || combo?.outputType || "").trim().toLowerCase();
  const profileId = String(combo?.profile_id || combo?.profileId || "").trim();
  const profile = String(combo?.profile || combo?.profile_name || "").trim().toLowerCase();
  return `${profileId || profile}::${platform}::${outputType}`;
}

export function pruneScheduleRegenJobStore(store, nowMs = Date.now(), limits = {}) {
  const maxChars = Number(limits.maxChars) > 0 ? Number(limits.maxChars) : SCHEDULE_REGEN_STORE_CHAR_BUDGET;
  const maxTerminal = Number(limits.maxTerminalJobs) > 0
    ? Number(limits.maxTerminalJobs)
    : SCHEDULE_REGEN_MAX_TERMINAL_JOBS;
  const next = parseScheduleRegenJobStore(store);
  for (const [id, job] of Object.entries(next.jobs)) {
    const updated = Date.parse(job?.updated_at || job?.created_at || "") || 0;
    const terminal = job?.status === "completed" || job?.status === "failed";
    if (terminal && updated && nowMs - updated > SCHEDULE_REGEN_JOB_TTL_MS) {
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
  for (const [scope, jobId] of Object.entries(next.active_by_scope)) {
    const job = next.jobs[jobId];
    if (!job || job.status === "completed" || job.status === "failed") {
      delete next.active_by_scope[scope];
    }
  }
  return next;
}

export function buildScheduleRegenCombinations({
  profiles = [],
  platforms = [],
  outputTypes = [],
} = {}) {
  const combos = [];
  for (const profile of profiles.length ? profiles : [{ id: "", name: "" }]) {
    for (const platform of platforms) {
      for (const outputType of outputTypes) {
        combos.push({
          profile_id: String(profile?.id || "").trim(),
          profile: String(profile?.name || profile?.profile || "").trim(),
          platform: String(platform || "").trim(),
          output_type: String(outputType || "").trim(),
          status: SCHEDULE_REGEN_STATUS.PENDING,
          completed_posts: 0,
          total_posts: 0,
          rescheduled: 0,
          error: "",
        });
      }
    }
  }
  return maeSortRegenCombinations(combos);
}

export function scheduleRegenJobCounts(job) {
  const combos = Array.isArray(job?.combinations) ? job.combinations : [];
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let processing = 0;
  let rescheduled = 0;
  for (const combo of combos) {
    const status = String(combo?.status || "");
    if (status === SCHEDULE_REGEN_STATUS.COMPLETED) completed += 1;
    else if (status === SCHEDULE_REGEN_STATUS.FAILED) failed += 1;
    else if (status === SCHEDULE_REGEN_STATUS.PROCESSING) processing += 1;
    else pending += 1;
    rescheduled += Number(combo?.rescheduled || 0) || 0;
  }
  const total = combos.length;
  const done = completed + failed;
  const overallPct = total ? Math.round((done / total) * 100) : 0;
  const active = combos.find((combo) => combo?.status === SCHEDULE_REGEN_STATUS.PROCESSING) || null;
  const activeTotal = Number(active?.total_posts || 0) || 0;
  const activeDone = Number(active?.completed_posts || 0) || 0;
  const activePct = activeTotal ? Math.round((activeDone / activeTotal) * 100) : (active ? 0 : 100);
  return {
    total_combinations: total,
    completed_combinations: completed,
    failed_combinations: failed,
    pending_combinations: pending,
    processing_combinations: processing,
    done_combinations: done,
    overall_percent: overallPct,
    active_percent: activePct,
    posts_rescheduled: rescheduled,
    current_platform: active?.platform || "",
    current_output_type: active?.output_type || "",
    current_profile: active?.profile || "",
  };
}

export function scheduleRegenProgressMessage(job) {
  const counts = scheduleRegenJobCounts(job);
  const status = String(job?.status || "");
  if (status === "queued") {
    return `Schedule regeneration queued · ${counts.total_combinations} combination${counts.total_combinations === 1 ? "" : "s"}`;
  }
  if (status === "running") {
    const current = counts.current_platform
      ? `${counts.current_platform} → ${counts.current_output_type}${counts.current_profile ? ` (${counts.current_profile})` : ""}`
      : "next combination";
    return `Schedule regeneration ${counts.done_combinations} of ${counts.total_combinations} · currently ${current} · ${counts.active_percent}%`;
  }
  if (status === "completed") {
    if (counts.failed_combinations) {
      return `Schedule regeneration finished · ${counts.completed_combinations} of ${counts.total_combinations} succeeded · ${counts.failed_combinations} failed · ${counts.posts_rescheduled} posts rescheduled`;
    }
    return `Schedule regeneration finished · ${counts.completed_combinations} combination${counts.completed_combinations === 1 ? "" : "s"} · ${counts.posts_rescheduled} posts rescheduled`;
  }
  if (status === "failed") {
    return `Schedule regeneration stopped · ${counts.completed_combinations} completed · ${counts.failed_combinations} failed`;
  }
  return `Schedule regeneration ${counts.done_combinations} of ${counts.total_combinations}`;
}

export function summarizeScheduleRegenJob(job) {
  if (!job || typeof job !== "object") return null;
  const counts = scheduleRegenJobCounts(job);
  return {
    id: job.id,
    status: job.status,
    created_at: job.created_at || null,
    updated_at: job.updated_at || null,
    horizon_days: job.horizon_days || null,
    message: scheduleRegenProgressMessage(job),
    counts,
    combinations: Array.isArray(job.combinations) ? job.combinations : [],
    summary: {
      total_combinations: counts.total_combinations,
      completed_combinations: counts.completed_combinations,
      failed_combinations: counts.failed_combinations,
      posts_rescheduled: counts.posts_rescheduled,
    },
  };
}

export function createScheduleRegenJob({
  profileId = "",
  profiles = [],
  platforms = [],
  outputTypes = [],
  horizonDays = 30,
  eligibleCount = 0,
} = {}) {
  const now = new Date().toISOString();
  const combinations = buildScheduleRegenCombinations({ profiles, platforms, outputTypes });
  return {
    id: newScheduleRegenJobId(),
    status: "queued",
    created_at: now,
    updated_at: now,
    profile_id: String(profileId || "").trim(),
    horizon_days: Number(horizonDays) || 30,
    eligible_count: Number(eligibleCount) || 0,
    combinations,
    cursor: 0,
  };
}
