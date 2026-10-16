/** Durable Pipeline calendar schedule-regeneration job helpers. */

import { maeSortRegenCombinations } from "./mae-schedule.mjs";

export const SCHEDULE_REGEN_JOBS_SETTING = "SCHEDULE_REGEN_JOBS_V1";
/** One-shot overnight enqueue: `{ "enabled": true, "day": "YYYY-MM-DD" }`. */
export const SCHEDULE_REGEN_OVERNIGHT_SETTING = "SCHEDULE_REGEN_OVERNIGHT_V1";
/** Platforms used when overnight cron fans out all-profile calendar regen. */
export const SCHEDULE_REGEN_OVERNIGHT_PLATFORMS = Object.freeze([
  "Facebook",
  "Instagram",
  "TikTok",
  "YouTube",
]);
/** Allowlisted output types for overnight fanout (matches UI/Worker canonicalize). */
export const SCHEDULE_REGEN_OVERNIGHT_OUTPUT_TYPES = Object.freeze([
  "Reel",
  "Story",
  "Carousel",
  "Short",
  "Multi-Image Post",
  "Multi-Photo",
  "Single Image",
  "Single Photo",
  "Slideshow Video",
]);
export const SCHEDULE_REGEN_JOB_TTL_MS = 24 * 60 * 60 * 1000;
export const SCHEDULE_REGEN_STORE_CHAR_BUDGET = 80000;
export const SCHEDULE_REGEN_MAX_TERMINAL_JOBS = 1;
/** A Processing combo older than this is treated as crashed; GET/POST may resume or reclaim. */
export const SCHEDULE_REGEN_STALE_PROCESSING_MS = 20 * 1000;
/**
 * Soft lease for status GET: only treat Processing as "live" while updated_at is this fresh.
 * Longer gaps mean waitUntil died after a plan/apply checkpoint — resume immediately.
 */
export const SCHEDULE_REGEN_LIVE_LEASE_MS = 20 * 1000;
/** Max Airtable/Supabase schedule writes per Worker slice so a 50+ Story lane cannot hang Regenerating… forever. */
export const SCHEDULE_REGEN_POSTS_PER_SLICE = 15;
/** Max MAE plan slots to compute per slice before persisting (plan must finish before apply). */
export const SCHEDULE_REGEN_PLAN_SLOTS_PER_SLICE = 25;
/** Max slices to chain inside one waitUntil / drain invocation. */
export const SCHEDULE_REGEN_MAX_SLICES_PER_DRAIN = 16;

const CANONICAL_PLATFORMS = Object.freeze({
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
});

/**
 * Calendar regen only schedules real publish lanes. UI used to forward every distinct
 * Studio_Output_Type on the grid (Video Draft, Multi-Photo aliases, …), which created
 * dozens of empty combinations and stuck Chicago on Facebook Carousel 0/0 forever.
 */
export const SCHEDULE_REGEN_OUTPUT_TYPE_ALLOWLIST = Object.freeze(new Set([
  "reel",
  "story",
  "carousel",
  "short",
  "multi-image post",
  "multi-photo",
  "single image",
  "single photo",
  "slideshow video",
  "slideshow reel",
]));

/** Pipeline calendar sends lowercase keys; Airtable Platform is title case. */
export function canonicalizeScheduleRegenPlatform(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hit = CANONICAL_PLATFORMS[raw.toLowerCase()];
  if (hit) return hit;
  return raw[0].toUpperCase() + raw.slice(1);
}

export function canonicalizeScheduleRegenOutputType(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!SCHEDULE_REGEN_OUTPUT_TYPE_ALLOWLIST.has(raw.toLowerCase())) return "";
  // Preserve common Airtable casing.
  if (raw === "Reel" || raw === "Story" || raw === "Carousel" || raw === "Short") return raw;
  if (/^multi-image post$/i.test(raw)) return "Multi-Image Post";
  if (/^multi-photo$/i.test(raw)) return "Multi-Photo";
  if (/^single image$/i.test(raw)) return "Single Image";
  if (/^single photo$/i.test(raw)) return "Single Photo";
  if (/^slideshow video$/i.test(raw)) return "Slideshow Video";
  if (/^slideshow reel$/i.test(raw)) return "Slideshow Reel";
  return raw[0].toUpperCase() + raw.slice(1);
}

/** True when the eligible scan finished and this lane has nothing to reschedule. */
export function scheduleRegenComboIsEmptyLane(combo) {
  if (!combo || typeof combo !== "object") return false;
  const total = Math.max(0, Number(combo.total_posts) || 0);
  if (total > 0) return false;
  // eligible_ids present (even []) after a scan checkpoint — not a pre-scan orphan.
  if (!Object.prototype.hasOwnProperty.call(combo, "eligible_ids")) return false;
  return Array.isArray(combo.eligible_ids);
}

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

/** Higher score = more useful durable store (active work beats empty seed rows). */
export function scheduleRegenStoreActivityScore(store) {
  if (!store || typeof store !== "object") return -1;
  const jobs = Object.values(store.jobs || {});
  let score = 0;
  let newest = 0;
  for (const job of jobs) {
    const status = String(job?.status || "");
    if (status === "queued" || status === "running") score += 1000;
    else if (status === "completed" || status === "failed") score += 10;
    else score += 1;
    const updated = Date.parse(job?.updated_at || job?.created_at || "") || 0;
    if (updated > newest) newest = updated;
  }
  score += Object.keys(store.active_by_scope || {}).length * 100;
  // Tiny tie-breaker so a freshly written R2 store wins over a stale empty Airtable seed.
  score += Math.min(newest, 9_999_999_999_999) / 1e15;
  return score;
}

/**
 * Prefer the store with active/queued work. A seeded Airtable row with empty jobs{}
 * must not shadow an R2 write (that was the Miami "button snaps back" failure mode).
 * When scores tie, prefer `primary` (R2).
 */
export function preferScheduleRegenJobStore(primary, secondary) {
  const a = primary && typeof primary === "object" ? primary : null;
  const b = secondary && typeof secondary === "object" ? secondary : null;
  if (!a && !b) return emptyScheduleRegenJobStore();
  if (a && !b) return a;
  if (!a && b) return b;
  const aScore = scheduleRegenStoreActivityScore(a);
  const bScore = scheduleRegenStoreActivityScore(b);
  return bScore > aScore ? b : a;
}

export function scheduleRegenCombinationKey(combo) {
  const platform = String(combo?.platform || "").trim().toLowerCase();
  const outputType = String(combo?.output_type || combo?.outputType || "").trim().toLowerCase();
  const profileId = String(combo?.profile_id || combo?.profileId || "").trim();
  const profile = String(combo?.profile || combo?.profile_name || "").trim().toLowerCase();
  return `${profileId || profile}::${platform}::${outputType}`;
}

/** Drop bulky plan checkpoints from finished combinations so Airtable/R2 stay under budget. */
export function slimScheduleRegenCombination(combo, { keepPlacedIsos = false } = {}) {
  if (!combo || typeof combo !== "object") return combo;
  const status = String(combo.status || "");
  const finished = status === SCHEDULE_REGEN_STATUS.COMPLETED || status === SCHEDULE_REGEN_STATUS.FAILED;
  if (!finished) return combo;
  return {
    ...combo,
    plan: [],
    eligible_ids: [],
    lane_reserved_ms: [],
    platform_reserved_ms: [],
    placed_isos: keepPlacedIsos && Array.isArray(combo.placed_isos) ? combo.placed_isos : [],
  };
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
      continue;
    }
    // Running jobs keep placed_isos on completed lanes (Story after Reel). Terminal jobs drop them.
    job.combinations = (Array.isArray(job.combinations) ? job.combinations : []).map((combo) => (
      slimScheduleRegenCombination(combo, { keepPlacedIsos: !terminal })
    ));
    next.jobs[id] = job;
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

export function scheduleRegenCandidateFilterFormula({
  nowMs = Date.now(),
  horizonDays = 30,
  profileFormula = "",
  platform = "",
  outputType = "",
} = {}) {
  const stamp = Number(nowMs);
  const startMs = Number.isFinite(stamp) ? stamp : Date.now();
  const days = Math.max(1, Math.floor(Number(horizonDays) || 30));
  const startIso = new Date(startMs).toISOString();
  const horizonIso = new Date(startMs + days * 24 * 60 * 60 * 1000).toISOString();
  const fields = ["Scheduled_Post_Date", "YouTube_Scheduled_Publish_At", "Studio_Scheduled_At"];
  const escaped = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const scheduleBlank = `AND(${fields.map((field) => `{${field}}=BLANK()`).join(",")})`;
  const scheduleFuture = fields.map((field) =>
    `AND({${field}}!="",IS_AFTER({${field}},DATETIME_PARSE("${startIso}")),IS_BEFORE({${field}},DATETIME_PARSE("${horizonIso}")))`
  ).join(",");
  const clauses = [
    "{Test_Run_ID}=BLANK()",
    "{Do_Not_Publish}=0",
    "{Published_At}=BLANK()",
    '{Publish_Status}!="Published"',
    '{Output_Status}!="Published"',
  ];
  const p = canonicalizeScheduleRegenPlatform(platform);
  // Case-insensitive: UI sends "instagram"; Airtable stores "Instagram".
  if (p) clauses.push(`LOWER({Platform})="${escaped(p.toLowerCase())}"`);
  const t = String(outputType || "").trim();
  if (t) clauses.push(`OR({Studio_Output_Type}="${escaped(t)}",{Format}="${escaped(t)}")`);
  clauses.push(`OR(${scheduleBlank},${scheduleFuture})`);
  const base = `AND(${clauses.join(",")})`;
  const scope = String(profileFormula || "").trim();
  return scope ? `AND(${scope},${base})` : base;
}

export function scheduleRegenJobIsStale(job, nowMs = Date.now(), staleMs = SCHEDULE_REGEN_STALE_PROCESSING_MS) {
  if (!job || typeof job !== "object") return false;
  const status = String(job.status || "");
  if (status !== "queued" && status !== "running") return false;
  const updated = Date.parse(job.updated_at || job.created_at || "") || 0;
  if (!updated) return true;
  const age = Math.max(0, Number(nowMs) || Date.now()) - updated;
  const hasProcessing = (job.combinations || []).some(
    (row) => String(row?.status || "") === SCHEDULE_REGEN_STATUS.PROCESSING,
  );
  if (hasProcessing && age >= Math.max(30_000, Number(staleMs) || SCHEDULE_REGEN_STALE_PROCESSING_MS)) {
    return true;
  }
  // Queued/running with no progress for a long time (store write may have died).
  if (!hasProcessing && age >= Math.max(5 * 60_000, Number(staleMs) || SCHEDULE_REGEN_STALE_PROCESSING_MS)) {
    return true;
  }
  return false;
}

/** True when MAE has assigned an iso for every eligible post (or the lane is empty). */
export function scheduleRegenComboPlanComplete(combo) {
  if (!combo || typeof combo !== "object") return false;
  if (scheduleRegenComboIsEmptyLane(combo)) return true;
  const total = Math.max(0, Number(combo.total_posts) || 0);
  const planLen = Array.isArray(combo.plan) ? combo.plan.length : 0;
  return total > 0 && planLen >= total;
}

/** True when a finished plan still has posts left to stamp in Airtable. */
export function scheduleRegenComboHasRemainingPlan(combo) {
  if (!scheduleRegenComboPlanComplete(combo)) return false;
  const plan = Array.isArray(combo.plan) ? combo.plan : [];
  const done = Math.max(0, Number(combo.completed_posts) || 0);
  return done < plan.length;
}

/** True when eligible ids exist but the MAE plan is still incomplete. */
export function scheduleRegenComboNeedsPlanning(combo) {
  if (!combo || typeof combo !== "object") return false;
  const status = String(combo.status || "");
  if (status !== SCHEDULE_REGEN_STATUS.PENDING && status !== SCHEDULE_REGEN_STATUS.PROCESSING) {
    return false;
  }
  if (scheduleRegenComboIsEmptyLane(combo)) return false;
  if (scheduleRegenComboPlanComplete(combo)) return false;
  const eligible = Array.isArray(combo.eligible_ids) ? combo.eligible_ids : [];
  const total = Math.max(0, Number(combo.total_posts) || 0);
  if (eligible.length > 0 && total > 0) return true;
  return status === SCHEDULE_REGEN_STATUS.PENDING || status === SCHEDULE_REGEN_STATUS.PROCESSING;
}

/**
 * Pending work, mid-plan Processing, or orphan Processing (crash before plan
 * persisted). Orphans must not sit forever — that froze LA Facebook Story at 0/57.
 * Empty scanned lanes still need a slice so the Worker can mark them Completed
 * (otherwise Chicago Facebook Carousel 0/0 spins forever with needsWork=false).
 */
export function scheduleRegenComboNeedsWork(combo) {
  const status = String(combo?.status || "");
  if (status === SCHEDULE_REGEN_STATUS.PENDING) return true;
  if (status !== SCHEDULE_REGEN_STATUS.PROCESSING) return false;
  if (scheduleRegenComboIsEmptyLane(combo)) return true;
  return scheduleRegenComboNeedsPlanning(combo) || scheduleRegenComboHasRemainingPlan(combo);
}

/**
 * Processing with no durable plan/checkpoint is an orphan crash.
 * Mid-planning (eligible_ids present) is not an orphan — the next slice continues.
 * Scanned-empty lanes are not orphans either — they complete as 0/0.
 */
export function scheduleRegenComboIsOrphanProcessing(combo) {
  if (String(combo?.status || "") !== SCHEDULE_REGEN_STATUS.PROCESSING) return false;
  if (scheduleRegenComboIsEmptyLane(combo)) return false;
  if (scheduleRegenComboHasRemainingPlan(combo)) return false;
  if (scheduleRegenComboNeedsPlanning(combo)) {
    const eligible = Array.isArray(combo.eligible_ids) ? combo.eligible_ids : [];
    if (eligible.length > 0) return false;
  }
  return true;
}

/** Reset crashed Processing combos so a later slice can finish them (keep plan progress). */
export function reclaimStaleScheduleRegenJob(job, nowMs = Date.now()) {
  if (!job || typeof job !== "object") return job;
  if (!scheduleRegenJobIsStale(job, nowMs)) return job;
  const combinations = (Array.isArray(job.combinations) ? job.combinations : []).map((row) => {
    if (String(row?.status || "") !== SCHEDULE_REGEN_STATUS.PROCESSING) return row;
    // Keep plan + completed_posts so a 57-Story lane resumes mid-plan instead of re-planning.
    return {
      ...row,
      status: SCHEDULE_REGEN_STATUS.PENDING,
      error: "",
    };
  });
  const firstPending = combinations.findIndex((row) => String(row?.status || "") === SCHEDULE_REGEN_STATUS.PENDING);
  return {
    ...job,
    combinations,
    cursor: firstPending >= 0 ? firstPending : 0,
    status: firstPending >= 0 ? "running" : job.status,
    updated_at: new Date(nowMs).toISOString(),
  };
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
  const active = combos.find((combo) => combo?.status === SCHEDULE_REGEN_STATUS.PROCESSING)
    || combos.find((combo) => combo?.status === SCHEDULE_REGEN_STATUS.PENDING)
    || null;
  const activeTotal = Number(active?.total_posts || 0) || 0;
  const applied = Number(active?.completed_posts || 0) || 0;
  const planned = Array.isArray(active?.plan) ? active.plan.length : 0;
  // During MAE planning, completed_posts stays 0 — surface plan progress so Regenerating… is not stuck at 0%.
  const activeDone = Math.max(applied, scheduleRegenComboPlanComplete(active) ? applied : planned);
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
