/**
 * Durable Ready-to-produce dispatcher state.
 *
 * Airtable remains authoritative for idea/request/output state. R2 stores only
 * idempotency, leases, retry timing and progress so overlapping cron isolates
 * cannot start the same idea twice.
 */

export const READY_PRODUCTION_PREFIX = "studio/state/ready-production/v1";
export const READY_PRODUCTION_SCHEMA = "studio.ready-production.1";
export const READY_PRODUCTION_LEASE_MS = 5 * 60 * 1000;
export const READY_PRODUCTION_MAX_CONCURRENCY = 2;
export const READY_PRODUCTION_MAX_PER_PROFILE = 1;
export const READY_PRODUCTION_RETRY_BASE_MS = 60 * 1000;
export const READY_PRODUCTION_RETRY_MAX_MS = 30 * 60 * 1000;

const ID = /^rec[A-Za-z0-9]+$/;
const ACTIVE = new Set(["queued", "retry_wait", "running", "awaiting_review"]);

function assertBucket(bucket) {
  if (!bucket?.get || !bucket?.put || !bucket?.list) {
    throw Error("STUDIO_MEDIA R2 storage required for Ready-to-produce dispatch");
  }
}

export function readyProductionJobKey(ideaId) {
  const id = String(ideaId || "").trim();
  if (!ID.test(id)) throw Error("Invalid Ready-to-produce idea ID");
  return `${READY_PRODUCTION_PREFIX}/jobs/${id}.json`;
}

async function read(bucket, key) {
  const object = await bucket.get(key);
  return object ? { value: JSON.parse(await object.text()), etag: object.etag } : null;
}

async function putAbsent(bucket, key, value) {
  return bucket.put(key, JSON.stringify(value), {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      ready_status: String(value.status || ""),
      ready_profile: String(value.profile_id || ""),
    },
  });
}

async function putMatch(bucket, key, value, etag) {
  return bucket.put(key, JSON.stringify(value), {
    onlyIf: { etagMatches: etag },
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      ready_status: String(value.status || ""),
      ready_profile: String(value.profile_id || ""),
    },
  });
}

async function cas(bucket, key, update, max = 8) {
  for (let attempt = 0; attempt < max; attempt += 1) {
    const old = await read(bucket, key);
    if (!old) throw Error("Ready-to-produce job disappeared");
    const next = update(old.value);
    if (!next) return old.value;
    if (await putMatch(bucket, key, next, old.etag)) return next;
  }
  throw Error("Concurrent Ready-to-produce update; retry on the next cron tick");
}

export function readyProductionBuildJob({ ideaId, profileId = null, createdAt = null, now = new Date().toISOString() }) {
  const id = String(ideaId || "").trim();
  const profile = String(profileId || "").trim() || null;
  readyProductionJobKey(id);
  if (profile && !ID.test(profile)) throw Error("Invalid Ready-to-produce profile ID");
  return {
    schema: READY_PRODUCTION_SCHEMA,
    idea_id: id,
    profile_id: profile,
    status: "queued",
    stage: "discovered",
    production_request_id: null,
    attempts: 0,
    next_attempt_ms: 0,
    owner: null,
    lease_expires_ms: 0,
    created_at: createdAt || now,
    updated_at: now,
    last_error: null,
    completed_reason: null,
  };
}

export async function readyProductionEnqueue(bucket, options) {
  assertBucket(bucket);
  const job = readyProductionBuildJob(options);
  const key = readyProductionJobKey(job.idea_id);
  if (await putAbsent(bucket, key, job)) return { job, created: true };
  const prior = await read(bucket, key);
  if (!prior) throw Error("Ready-to-produce enqueue is still committing");
  if (prior.value.schema !== READY_PRODUCTION_SCHEMA || prior.value.idea_id !== job.idea_id) {
    throw Error("Ready-to-produce key is bound to invalid state");
  }
  // Incident #907: the split Worker briefly omitted PR_PLATFORMS, giving every
  // planned claim a 30-minute permanent-error backoff. Once the deployment
  // contains the corrected import, the regular Airtable eligibility discovery
  // may release ONLY that exact obsolete error, with CAS and lease fencing.
  // All other retry delays and human gates remain untouched.
  if (prior.value.status === "retry_wait" && prior.value.last_error === "PR_PLATFORMS is not defined") {
    const recovered = await cas(bucket, key, (value) => {
      if (value.status !== "retry_wait" || value.last_error !== "PR_PLATFORMS is not defined"
          || (value.owner && Number(value.lease_expires_ms || 0) > Date.now())) return null;
      return {
        ...value,
        status: "queued",
        stage: "recovered_platform_registry",
        owner: null,
        lease_expires_ms: 0,
        next_attempt_ms: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
    });
    return { job: recovered, created: false, revived: recovered.status === "queued" && recovered.stage === "recovered_platform_registry" };
  }
  // P0 #907: recover the legacy "Ready but no output plan items" backoff
  // once after the Item4 destination/empty-plan fix. Persistent marker means
  // a newly failing plan won't be requeued every minute; CAS and owner lease
  // checks keep concurrent Worker ticks from duplicating claims.
  const obsoleteEmptyPlanError = "Build a complete platform output plan before preparing platform media";
  if (prior.value.status === "retry_wait"
      && prior.value.last_error === obsoleteEmptyPlanError
      && !prior.value.empty_plan_recovered_at) {
    const recovered = await cas(bucket, key, (value) => {
      if (value.status !== "retry_wait"
          || value.last_error !== obsoleteEmptyPlanError
          || value.empty_plan_recovered_at
          || (value.owner && Number(value.lease_expires_ms || 0) > Date.now())) return null;
      return {
        ...value,
        status: "queued",
        stage: "recovered_empty_item4_plan",
        owner: null,
        lease_expires_ms: 0,
        next_attempt_ms: 0,
        last_error: null,
        empty_plan_recovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });
    return {
      job: recovered,
      created: false,
      revived: recovered.status === "queued" && recovered.stage === "recovered_empty_item4_plan",
    };
  }
  // A prior nonterminal observation may have gone dormant (hold, missing assets,
  // etc.). Fresh Airtable eligibility revives it. Truly completed promoted work
  // never appears in the discovery query again.
  if (!ACTIVE.has(prior.value.status) && prior.value.completed_reason !== "awaiting_final_approval") {
    const revived = await cas(bucket, key, (value) => ({
      ...value,
      profile_id: job.profile_id || value.profile_id || null,
      status: "queued",
      stage: "rediscovered",
      next_attempt_ms: 0,
      owner: null,
      lease_expires_ms: 0,
      updated_at: job.updated_at,
      last_error: null,
      completed_reason: null,
    }));
    return { job: revived, created: false, revived: true };
  }
  return { job: prior.value, created: false };
}

export async function readyProductionRead(bucket, ideaId) {
  assertBucket(bucket);
  return (await read(bucket, readyProductionJobKey(ideaId)))?.value || null;
}

/**
 * Scan one bounded segment of the durable job index. A persistent cursor in the
 * dispatcher rotates segments between minutes; always reading the first 500
 * objects stranded jobs once the index grew beyond that size.
 */
export async function readyProductionListPage(bucket, { maxScan = 500, cursor = null } = {}) {
  assertBucket(bucket);
  const prefix = `${READY_PRODUCTION_PREFIX}/jobs/`;
  const jobs = [];
  const cap = Math.max(1, Math.min(1000, Math.trunc(Number(maxScan) || 500)));
  let scanCursor = String(cursor || "").trim() || null;
  let nextCursor = null;
  let scanned = 0;
  do {
    const page = await bucket.list({
      prefix,
      limit: Math.min(1000, cap - scanned),
      ...(scanCursor ? { cursor: scanCursor } : {}),
    });
    const objects = page.objects || [];
    scanned += objects.length;
    const loaded = await Promise.all(objects.map((object) => read(bucket, object.key)));
    for (const entry of loaded) {
      if (entry?.value?.schema === READY_PRODUCTION_SCHEMA) jobs.push(entry.value);
    }
    if (!page.truncated) {
      nextCursor = null; // Full pass completed; next minute starts at the head.
      break;
    }
    if (!page.cursor || page.cursor === scanCursor) {
      throw Error("Ready-to-produce R2 listing cursor stalled");
    }
    scanCursor = page.cursor;
    nextCursor = scanCursor;
  } while (scanned < cap);
  jobs.sort((left, right) => {
    const a = Date.parse(left.created_at || left.updated_at || "") || 0;
    const b = Date.parse(right.created_at || right.updated_at || "") || 0;
    return a - b || String(left.idea_id).localeCompare(String(right.idea_id));
  });
  return { jobs, nextCursor, scanned };
}

/** Backwards-compatible list for callers that need the first bounded page. */
export async function readyProductionList(bucket, options = {}) {
  return (await readyProductionListPage(bucket, options)).jobs;
}

export function readyProductionSelectJobs(jobs, {
  nowMs = Date.now(),
  maxConcurrency = READY_PRODUCTION_MAX_CONCURRENCY,
  maxPerProfile = READY_PRODUCTION_MAX_PER_PROFILE,
} = {}) {
  const selected = [];
  const perProfile = new Map();
  const cap = Math.max(0, Math.min(8, Math.trunc(maxConcurrency) || 0));
  const profileCap = Math.max(1, Math.min(4, Math.trunc(maxPerProfile) || 1));
  const available = (Array.isArray(jobs) ? jobs : []).filter((job) => {
    if (!ACTIVE.has(String(job?.status || ""))) return false;
    if (job.status === "running" && Number(job.lease_expires_ms || 0) > nowMs) return false;
    return Number(job.next_attempt_ms || 0) <= nowMs;
  });
  // Planning and rendering are separate lanes. Reserve one slot for a due
  // render/QA monitor, but never let oldest awaiting_review jobs consume both
  // global slots and block new photo-ready planning indefinitely.
  const planning = available.filter((job) => job.status !== "awaiting_review");
  const monitoring = available.filter((job) => job.status === "awaiting_review");
  const take = (candidates, quota) => {
    let taken = 0;
    for (const job of candidates) {
      if (selected.length >= cap || taken >= quota) break;
      const profile = String(job.profile_id || "unscoped");
      if ((perProfile.get(profile) || 0) >= profileCap) continue;
      selected.push(job);
      perProfile.set(profile, (perProfile.get(profile) || 0) + 1);
      taken += 1;
    }
  };
  if (planning.length && monitoring.length && cap >= 2) {
    take(planning, cap - 1);
    take(monitoring, 1);
    take(planning, cap);
    take(monitoring, cap);
  } else {
    take(planning, cap);
    take(monitoring, cap);
  }
  return selected;
}

export async function readyProductionClaim(bucket, ideaId, owner, nowMs = Date.now(), leaseMs = READY_PRODUCTION_LEASE_MS) {
  assertBucket(bucket);
  const key = readyProductionJobKey(ideaId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const old = await read(bucket, key);
    if (!old) return null;
    const value = old.value;
    if (!ACTIVE.has(String(value.status || ""))) return null;
    if (value.owner && Number(value.lease_expires_ms || 0) > nowMs) return null;
    if (Number(value.next_attempt_ms || 0) > nowMs) return null;
    const next = {
      ...value,
      status: "running",
      stage: value.stage || "claimed",
      attempts: Number(value.attempts || 0) + 1,
      owner,
      lease_expires_ms: nowMs + leaseMs,
      updated_at: new Date(nowMs).toISOString(),
    };
    if (await putMatch(bucket, key, next, old.etag)) return { key, owner, job: next };
  }
  return null;
}

export function readyProductionRetryDelayMs(attempts) {
  const exponent = Math.max(0, Math.min(10, Number(attempts || 1) - 1));
  return Math.min(READY_PRODUCTION_RETRY_MAX_MS, READY_PRODUCTION_RETRY_BASE_MS * (2 ** exponent));
}

export function readyProductionFailure(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || error || "Ready-to-produce dispatch failed").slice(0, 500);
  const transient = [408, 409, 425, 429].includes(status)
    || status >= 500
    || /timeout|rate limit|temporar|cooldown|prepar|render|queue|network|fetch|variant|awaiting/i.test(message);
  return { message, transient };
}

export async function readyProductionFinishClaim(bucket, lease, outcome = {}, nowMs = Date.now()) {
  if (!lease?.key || !lease?.owner) return null;
  const status = String(outcome.status || "retry_wait");
  return cas(bucket, lease.key, (value) => {
    if (value.owner !== lease.owner) return null;
    const retryDelay = status === "retry_wait"
      ? Number(outcome.retry_delay_ms || readyProductionRetryDelayMs(value.attempts))
      : status === "awaiting_review"
        ? Math.max(60 * 1000, Math.min(5 * 60 * 1000, Number(outcome.review_poll_delay_ms) || 3 * 60 * 1000))
        : 0;
    return {
      ...value,
      ...outcome,
      status,
      owner: null,
      lease_expires_ms: 0,
      next_attempt_ms: retryDelay > 0 ? nowMs + retryDelay : 0,
      updated_at: new Date(nowMs).toISOString(),
      last_error: outcome.last_error == null ? null : String(outcome.last_error).slice(0, 500),
    };
  });
}

/** Factory's human gate: every real output is Ready for Review and unapproved. */
export function readyProductionOutputsAwaitingFinalApproval(outputs) {
  const rows = Array.isArray(outputs) ? outputs.filter(Boolean) : [];
  if (!rows.length) return false;
  return rows.every((row) => {
    const fields = row.fields || row;
    const output = String(fields.Output_Status || fields.output_status || "").trim().toLowerCase();
    const review = String(fields.Review_Status || fields.review_status || "").trim().toLowerCase();
    const publish = String(fields.Publish_Status || fields.publish_status || "").trim().toLowerCase();
    const render = String(fields.Render_Status || fields.render_status || "").trim().toLowerCase();
    if (output !== "ready for review") return false;
    if (["approved", "rejected", "skipped"].includes(review)) return false;
    if (["approved for publishing", "scheduled", "publishing", "published"].includes(output)) return false;
    if (["ready to schedule", "ready to publish", "scheduled", "publishing", "published"].includes(publish)) return false;
    if (["ready for render", "ready to render", "waiting in render queue", "rendering"].includes(render)) return false;
    return true;
  });
}
