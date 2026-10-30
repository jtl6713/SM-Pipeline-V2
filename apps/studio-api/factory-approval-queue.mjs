import { factoryApprovalItemTiming, factoryApprovalTimingReport } from "./factory-approval-timings.mjs";

/**
 * Durable Factory approval batches: R2 CAS per request + a CAS profile mutex.
 * Browser-independent: HTTP waitUntil starts work, cron reclaims pending jobs.
 */
export const FACTORY_BATCH_PREFIX = "studio/state/factory-approvals/v2";
export const FACTORY_BATCH_LEASE_MS = 12 * 60 * 1000;
const ID = /^rec[A-Za-z0-9]+$/;
const RID = /^[A-Za-z0-9_-]{12,128}$/;
const done = new Set(["approved", "already_satisfied", "skipped_removed", "failed"]);

function assertBucket(bucket) {
  if (!bucket?.put || !bucket?.get || !bucket?.list) throw Error("STUDIO_MEDIA R2 storage required");
}
export function factoryBatchKey(profileId, requestId) {
  if (!ID.test(String(profileId || "")) || !RID.test(String(requestId || ""))) throw Error("Invalid batch identity");
  return FACTORY_BATCH_PREFIX + "/jobs/" + profileId + "/" + requestId + ".json";
}
export function factoryBatchLockKey(profileId) {
  if (!ID.test(String(profileId || ""))) throw Error("Invalid profile");
  return FACTORY_BATCH_PREFIX + "/locks/" + profileId + ".json";
}
export function factoryBatchCounts(job) {
  const items = Array.isArray(job?.items) ? job.items : [];
  const result = { total: items.length, approved_count: 0, skipped_count: 0, failed_count: 0, pending_count: 0 };
  for (const item of items) {
    if (item.status === "approved") result.approved_count++;
    else if (item.status === "already_satisfied" || item.status === "skipped_removed") result.skipped_count++;
    else if (item.status === "failed") result.failed_count++;
    else result.pending_count++;
  }
  return { ...result, done_count: result.approved_count + result.skipped_count + result.failed_count };
}
/** A failed row leaves the active desk only AFTER an external exception audit is
 * durably saved and independently verified. Failed status/error are retained. */
export function factoryBatchFailureRouted(item) {
  const audit = item?.exception_recovery;
  return item?.status === "failed" && audit?.state === "routed" &&
    typeof audit.event_key === "string" && audit.event_key.length > 0 &&
    typeof audit.reason === "string" && audit.reason.length > 0 &&
    Number.isFinite(Date.parse(audit.at));
}
/** One explicitly requested retry of a terminal failed row; no broad replay. */
export function factoryBatchRetryEligible(item) {
  return item?.status === "failed" && !factoryBatchFailureRouted(item) &&
    Number(item.manual_retry_count || 0) + Number(item.auto_retry_count || 0) < 1;
}
/** Only unresolved failures and live work belong on the active Factory desk. */
export function factoryBatchNeedsAttention(job) {
  if (!job) return false;
  const counts = factoryBatchCounts(job);
  return counts.pending_count > 0 ||
    (job.items || []).some(item => item.status === "failed" && !factoryBatchFailureRouted(item)) ||
    !["completed", "failed"].includes(job.status);
}
export function factoryBatchSummary(job) {
  if (!job) return { ok: true, batch: true, status: "idle", job_id: null, items: [] };
  const counts = factoryBatchCounts(job);
  const timing_report = factoryApprovalTimingReport(job.items || []);
  return {
    ok: true, batch: true, job_id: job.id, profile_id: job.profile_id,
    request_id: job.request_id, created_at: job.created_at, updated_at: job.updated_at,
    status: job.status, ...counts, timing_report,
    can_retry: ["completed", "failed"].includes(job.status) && job.items.some(factoryBatchRetryEligible),
    items: job.items.map(item => ({
      id: item.id, output_id: item.output_id, platform: item.platform,
      format: item.format, title: item.title || null, content_id: item.content_id || null,
      status: item.status, error: item.error || null,
      exception_recovery: item.exception_recovery || null,
      manual_retry_count: Number(item.manual_retry_count || 0),
      timing: factoryApprovalItemTiming(item),
    })),
  };
}
export function factoryBatchBuild({ profileId, requestId, records, note = "", groupRequestId = null, now = new Date().toISOString() }) {
  factoryBatchKey(profileId, requestId);
  if (groupRequestId !== null && !/^[A-Za-z0-9_-]{12,128}$/.test(String(groupRequestId))) throw Error("Invalid parent group request ID");
  if (!Array.isArray(records) || !records.length || records.length > 100) throw Error("Select 1–100 output records");
  const seen = new Set(), items = [];
  for (const record of records) {
    const id = String(record?.id || "").trim();
    if (!ID.test(id)) throw Error("Invalid output record ID");
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id, output_id: record.output_id || null, platform: record.platform || null,
      format: record.format || null,
      title: String(record.title || "").slice(0, 180) || null,
      content_id: record.content_id || null,
      status: "pending", error: null,
      attempts: 0, total_attempts: 0, next_attempt_ms: 0,
      timeline: [{ state: "queued", at: now, attempt: 0 }],
    });
  }
  return {
    schema: "studio.factory-batch.2", id: "fb_" + requestId, request_id: requestId,
    profile_id: profileId, group_request_id: groupRequestId, status: "queued", created_at: now, updated_at: now,
    notes: String(note || "").slice(0, 3000), items,
  };
}
async function get(bucket, key) {
  const obj = await bucket.get(key);
  return obj ? { value: JSON.parse(await obj.text()), etag: obj.etag } : null;
}
async function putAbsent(bucket, key, value) {
  return bucket.put(key, JSON.stringify(value), {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
    customMetadata: { factory_status: String(value.status || ""), factory_failed: String(factoryBatchCounts(value).failed_count), factory_active: String(factoryBatchNeedsAttention(value)), factory_group: String(value.group_request_id || "") },
  });
}
async function putMatch(bucket, key, value, etag) {
  return bucket.put(key, JSON.stringify(value), {
    onlyIf: { etagMatches: etag },
    httpMetadata: { contentType: "application/json" },
    customMetadata: { factory_status: String(value.status || ""), factory_failed: String(factoryBatchCounts(value).failed_count), factory_active: String(factoryBatchNeedsAttention(value)), factory_group: String(value.group_request_id || "") },
  });
}
async function cas(bucket, key, fn, max = 8) {
  for (let i = 0; i < max; i++) {
    const old = await get(bucket, key);
    if (!old) throw Error("Factory batch record disappeared");
    const next = fn(old.value);
    if (!next) return old.value;
    if (await putMatch(bucket, key, next, old.etag)) return next;
  }
  throw Error("Concurrent batch update; retry after reading current status");
}
export async function factoryBatchEnqueue(bucket, options) {
  assertBucket(bucket);
  const job = factoryBatchBuild(options);
  const key = factoryBatchKey(job.profile_id, job.request_id);
  const written = await putAbsent(bucket, key, job);
  if (written) return { job, already_submitted: false };
  const prior = await get(bucket, key);
  if (!prior) throw Error("Submission still committing; inspect activity status");
  const previousIds = prior.value.items.map(x => x.id).join(",");
  if (previousIds !== job.items.map(x => x.id).join(",") ||
      (prior.value.group_request_id || null) !== (job.group_request_id || null)) {
    throw Error("request_id already bound to different outputs or parent group");
  }
  return { job: prior.value, already_submitted: true };
}
export async function factoryBatchRead(bucket, profileId, requestId) {
  assertBucket(bucket);
  return (await get(bucket, factoryBatchKey(profileId, requestId)))?.value || null;
}
export async function factoryBatchList(bucket, profileId, { limit = 40, maxScan = 2000 } = {}) {
  assertBucket(bucket);
  if (!ID.test(String(profileId || ""))) throw Error("Missing profile");
  const prefix = FACTORY_BATCH_PREFIX + "/jobs/" + profileId + "/";
  const meta = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    meta.push(...(page.objects || []));
    cursor = page.truncated ? page.cursor : null;
  } while (cursor && meta.length < maxScan);
  // R2 lists lexicographically by opaque request ID, NOT by recency.
  // Compare object upload dates first to avoid showing a random historic job
  // when more than one page of prior batches exists.
  meta.sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0));
  const latest = meta.slice(0, Math.max(1, Math.min(limit, 40)));
  const rows = await Promise.all(latest.map(row => get(bucket, row.key)));
  return rows.filter(row => row?.value?.schema === "studio.factory-batch.2")
    .map(row => row.value)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
/**
 * Read-only global Factory activity. Scan R2's canonical batch prefix (not the
 * selected Studio profile). Reads a bounded recent window, never rewrites jobs.
 * If the history is too large for the scan budget, explicitly mark it partial.
 * This is a recent-activity window; the number of old batches is not fabricated.
 */
export async function factoryBatchListGlobal(bucket, {
  profileId = "", limit = 30, maxScan = 2000, mode = "all", offset = 0,
} = {}) {
  assertBucket(bucket);
  if (profileId && !ID.test(String(profileId))) throw Error("Invalid Factory filter");
  if (!["all", "active", "completed"].includes(mode)) throw Error("Invalid Factory activity mode");
  const prefix = FACTORY_BATCH_PREFIX + "/jobs/";
  const budget = Math.max(1, Math.min(10000, Math.floor(Number(maxScan) || 2000)));
  const take = Math.max(1, Math.min(500, Math.floor(Number(limit) || 30)));
  const skip = Math.max(0, Math.min(1000, Math.floor(Number(offset) || 0)));
  const objects = [];
  let cursor;
  let complete = true;
  do {
    const remaining = budget - objects.length;
    if (remaining <= 0) { complete = false; break; }
    const page = await bucket.list({
      prefix, limit: Math.min(1000, remaining), include: ["customMetadata"],
      ...(cursor ? { cursor } : {}),
    });
    objects.push(...(page.objects || []));
    if (!page.truncated) { cursor = null; break; }
    if (!page.cursor || page.cursor === cursor) throw Error("Factory global batch cursor stalled");
    cursor = page.cursor;
  } while (cursor);
  if (cursor) complete = false;
  const match = /^studio\/state\/factory-approvals\/v2\/jobs\/(rec[A-Za-z0-9]+)\/([A-Za-z0-9_-]{12,128})\.json$/;
  const matching = objects.filter(row => {
    const parts = String(row.key || "").match(match);
    return parts && (!profileId || parts[1] === profileId);
  }).sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0));
  const candidates = matching.filter(row => {
    const meta = row.customMetadata || {};
    if (mode !== "all" && meta.factory_group) return false;
    if (!meta.factory_status || mode === "all") return true; // legacy jobs require a read
    const attention = meta.factory_active === "true" ? true : meta.factory_active === "false" ? false
      : meta.factory_status !== "completed" || Number(meta.factory_failed || 0) > 0;
    return mode === "active" ? attention : !attention;
  });
  const qualified = [];
  const needed = skip + take + 1;
  // Read only metadata-matching jobs. The legacy metadata-less records are
  // examined for correctness, but never fetched on the usual fast path again.
  for (let index = 0; index < candidates.length && qualified.length < needed; index += 25) {
    const loaded = await Promise.all(candidates.slice(index, index + 25).map(row => get(bucket, row.key)));
    for (const entry of loaded) {
      const job = entry?.value;
      if (job?.schema !== "studio.factory-batch.2") continue;
      if (mode !== "all" && job.group_request_id) continue;
      if (mode === "active" && !factoryBatchNeedsAttention(job)) continue;
      if (mode === "completed" && factoryBatchNeedsAttention(job)) continue;
      qualified.push(job);
    }
  }
  return {
    jobs: qualified.slice(skip, skip + take),
    has_more: qualified.length > skip + take,
    complete: complete && matching.length <= take && mode === "all",
    scanned: objects.length, matched: matching.length,
  };
}

/**
 * Durable rolling cron cursor. R2 lists jobs lexicographically, so scanning
 * only the first 200 on every tick indefinitely starves later profile keys.
 * This checkpoint makes progress through ALL pages across cron invocations.
 * All writes use CAS so overlapping scheduled runs cannot corrupt the cursor.
 * A full scan resets to the beginning so newly enqueued keys are discovered.
 */
export const FACTORY_BATCH_CRON_CURSOR_KEY = FACTORY_BATCH_PREFIX + "/cron/scan-v1.json";
export async function factoryBatchCronScan(bucket, { maxScan = 200, pageSize = 100 } = {}) {
  assertBucket(bucket);
  const prefix = FACTORY_BATCH_PREFIX + "/jobs/";
  const size = Math.max(1, Math.min(1000, Math.floor(pageSize)));
  const budget = Math.max(1, Math.min(2000, Math.floor(maxScan)));
  let checkpoint = await get(bucket, FACTORY_BATCH_CRON_CURSOR_KEY);
  let cursor = checkpoint?.value?.cursor || undefined;
  let scanned = 0;
  const objects = [];
  while (scanned < budget) {
    const page = await bucket.list({
      prefix,
      limit: Math.min(size, budget - scanned),
      ...(cursor ? { cursor } : {}),
    });
    const entries = page.objects || [];
    objects.push(...entries);
    scanned += entries.length;
    if (!page.truncated) {
      cursor = undefined;
      break;
    }
    if (!page.cursor || page.cursor === cursor) {
      throw Error("R2 factory batch listing did not advance its cursor");
    }
    cursor = page.cursor;
  }
  const next = { cursor: cursor || null, updated_at: new Date().toISOString() };
  if (checkpoint) {
    await cas(bucket, FACTORY_BATCH_CRON_CURSOR_KEY, () => next);
  } else if (!await putAbsent(bucket, FACTORY_BATCH_CRON_CURSOR_KEY, next)) {
    await cas(bucket, FACTORY_BATCH_CRON_CURSOR_KEY, () => next);
  }
  return { objects, scanned, wrapped: !cursor, next_cursor: cursor || null };
}

/**
 * Schedule at most one child approval drain per Content Profile on each cron
 * tick. Multiple children of the same global Factory submission share the
 * per-profile R2 CAS lock: dispatching all of them simultaneously makes all
 * but one fail to claim and can starve an older child for many 5-minute ticks.
 * Oldest durable progress wins so active jobs rotate fairly between ticks.
 * Only jobs with an eligible nonterminal item consume a dispatch opportunity.
 */
export function factoryBatchCronSelectJobs(candidates = [], { maxProfiles = 5, nowMs = Date.now() } = {}) {
  const byProfile = new Map();
  for (const candidate of candidates) {
    const profileId = String(candidate?.profileId || "");
    const job = candidate?.job;
    if (!/^rec[A-Za-z0-9]+$/.test(profileId) || !job
      || !["queued", "running"].includes(job.status)) continue;
    const eligible = (job.items || []).some(item =>
      !done.has(item.status) && Number(item.next_attempt_ms || 0) <= nowMs
    );
    if (!eligible) continue;
    const timestamp = Date.parse(String(job.updated_at || job.created_at || ""));
    const orderMs = Number.isFinite(timestamp) ? timestamp : 0;
    const prior = byProfile.get(profileId);
    if (!prior || orderMs < prior.orderMs ||
        (orderMs === prior.orderMs && String(candidate.requestId) < String(prior.requestId))) {
      byProfile.set(profileId, { profileId, requestId: candidate.requestId, orderMs });
    }
  }
  return [...byProfile.values()]
    .sort((a, b) => a.orderMs - b.orderMs
      || a.profileId.localeCompare(b.profileId)
      || String(a.requestId).localeCompare(String(b.requestId)))
    .slice(0, Math.max(0, Math.min(5, Math.trunc(maxProfiles) || 0)));
}

export async function factoryBatchLock(bucket, profileId, owner, nowMs, leaseMs = FACTORY_BATCH_LEASE_MS) {
  const key = factoryBatchLockKey(profileId);
  for (let i = 0; i < 8; i++) {
    const old = await get(bucket, key);
    if (old?.value?.owner && old.value.expires_ms > nowMs) return false;
    const value = { owner, expires_ms: nowMs + leaseMs };
    const result = old ? await putMatch(bucket, key, value, old.etag) : await putAbsent(bucket, key, value);
    if (result) return true;
  }
  return false;
}
export async function factoryBatchUnlock(bucket, profileId, owner) {
  await cas(bucket, factoryBatchLockKey(profileId), old => old.owner === owner
    ? { owner: null, expires_ms: 0 } : null).catch(() => {});
}
export function factoryBatchFailure(error) {
  const code = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || error || "Approval failed").slice(0, 450);
  const waitRender = /rendering is incomplete|waiting in render queue|still rendering/i.test(message);
  const transient = waitRender || [408, 429].includes(code) || code >= 500
    || /timeout|rate limit|temporarily unavailable|network error/i.test(message);
  return { message, transient, waitRender };
}
export async function factoryBatchDrain(bucket, options) {
  assertBucket(bucket);
  const { profileId, requestId, approve, maxItems = 6, maxElapsedMs = Infinity } = options;
  const now = options.now || (() => Date.now());
  const startedAt = now();
  const owner = (options.makeOwner || (() => crypto.randomUUID()))();
  const lock = await factoryBatchLock(bucket, profileId, owner, now());
  if (!lock) return { claimed: false, job: await factoryBatchRead(bucket, profileId, requestId) };
  let processed = 0, job;
  const key = factoryBatchKey(profileId, requestId);
  try {
    job = await factoryBatchRead(bucket, profileId, requestId);
    if (!job || ["completed", "failed"].includes(job.status)) return { claimed: true, processed, job };
    // A lock expires after an interrupted worker. Always reread canonical output
    // state in approve() before mutation on recovery.
    const sorted = job.items.filter(x => !/story/i.test(String(x.format || "")))
      .concat(job.items.filter(x => /story/i.test(String(x.format || ""))));
    for (const item of sorted) {
      // HTTP waitUntil has a bounded lifetime. Finish as many approvals as
      // the budget allows rather than hard-stopping after only five.
      // Remaining work stays durable for cron recovery after the client leaves.
      if (processed >= maxItems || (processed > 0 && now() - startedAt >= maxElapsedMs)) break;
      if (done.has(item.status) || item.next_attempt_ms > now()) continue;
      const stamp = new Date(now()).toISOString();
      job = await cas(bucket, key, value => ({
        ...value, status: "running", updated_at: stamp,
        items: value.items.map(row => row.id === item.id
          ? { ...row, status: "processing", attempts: (row.attempts || 0) + 1,
            total_attempts: (row.total_attempts || row.attempts || 0) + 1, error: null,
            timeline: [...(row.timeline || []), {
              state: "processing", at: stamp,
              attempt: (row.total_attempts || row.attempts || 0) + 1,
            }].slice(-180),
          }
          : row),
      }));
      processed++;
      const attempt = (item.total_attempts || item.attempts || 0) + 1;
      const events = [];
      const checkpoint = state => {
        if (typeof state !== "string" || !/^[a-z_]{3,64}$/.test(state) || events.length >= 64) return;
        events.push({ state, at: new Date(now()).toISOString(), attempt });
      };
      let outcome;
      try {
        const result = await approve(item.id, job, checkpoint);
        outcome = {
          status: result?.already_approved || result?.already_published ? "already_satisfied" : "approved",
          error: null, next_attempt_ms: 0,
        };
      } catch (error) {
        const failure = factoryBatchFailure(error);
        const attempts = job.items.find(x => x.id === item.id)?.attempts || 1;
        outcome = {
          status: failure.transient && !job.items.find(x => x.id === item.id)?.auto_retry_count
             && (failure.waitRender || attempts < 5) ? "pending" : "failed",
          error: failure.message,
          next_attempt_ms: failure.transient
            ? now() + (failure.waitRender ? 300000 : Math.min(600000, 30000 * Math.pow(2, attempts)))
            : 0,
        };
      }
      const completedAt = new Date(now()).toISOString();
      job = await cas(bucket, key, value => {
        const updated = {
          ...value, updated_at: completedAt,
          items: value.items.map(row => row.id === item.id ? {
            ...row, ...outcome,
            timeline: [...(row.timeline || []), ...events, {
              state: outcome.status, at: completedAt, attempt,
            }].slice(-180),
          } : row),
        };
        const counts = factoryBatchCounts(updated);
        updated.status = counts.pending_count ? "running"
          : counts.failed_count && !counts.approved_count && !counts.skipped_count ? "failed" : "completed";
        return updated;
      });
      // CAS heartbeat prevents a second worker from claiming this profile
      // while the canonical approval function is running.
      await cas(bucket, factoryBatchLockKey(profileId), value => value.owner === owner
        ? { ...value, expires_ms: now() + FACTORY_BATCH_LEASE_MS }
        : null);
    }
    return { claimed: true, processed, job };
  } finally {
    await factoryBatchUnlock(bucket, profileId, owner);
  }
}
export async function factoryBatchRetry(bucket, profileId, requestId) {
  assertBucket(bucket);
  const key = factoryBatchKey(profileId, requestId);
  return cas(bucket, key, job => {
    if (["queued", "running"].includes(job.status)) return null;
    if (!job.items.some(factoryBatchRetryEligible)) return null;
    return {
      ...job, status: "queued", updated_at: new Date().toISOString(),
      items: job.items.map(item => factoryBatchRetryEligible(item)
        ? { ...item, status: "pending", error: null, attempts: 0,
          manual_retry_count: Number(item.manual_retry_count || 0) + 1,
          failure_history: [...(item.failure_history || []), {
            at: new Date().toISOString(), error: item.error || null,
          }].slice(-10),
          next_attempt_ms: 0,
          timeline: [...(item.timeline || []), {
            state: "pending", at: new Date().toISOString(),
            attempt: item.total_attempts || 0, reason: "bounded_manual_retry",
          }].slice(-180),
        }
        : item),
    };
  });
}

/**
 * Recover one verified transient terminal failure with exactly ONE additional
 * approval attempt. No group-wide retry, no successful-item mutation, and the
 * original error remains in failure_history. Canonical approval still rereads
 * the Airtable record under the output lock; this does not publish.
 */
export async function factoryBatchRetryTransientOnce(bucket, {
  profileId, requestId, recordId, outputId,
} = {}) {
  assertBucket(bucket);
  if (!ID.test(String(recordId || "")) || !Number.isSafeInteger(Number(outputId)) ||
      Number(outputId) <= 0) throw Error("Exact retry identity required");
  return cas(bucket, factoryBatchKey(profileId, requestId), job => {
    if (!["completed", "failed"].includes(job.status) ||
        factoryBatchCounts(job).pending_count) return null;
    const found = job.items.filter(item =>
      item.id === recordId && Number(item.output_id) === Number(outputId));
    if (found.length !== 1) throw Error("Retry identity missing or ambiguous");
    const item = found[0];
    if (item.status !== "failed" || factoryBatchFailureRouted(item) ||
        Number(item.auto_retry_count || 0) >= 1 ||
        Number(item.manual_retry_count || 0) >= 1 ||
        !factoryBatchFailure(new Error(item.error || "")).transient) return null;
    const at = new Date().toISOString();
    return {...job, status: "queued", updated_at: at,
      items: job.items.map(row => row.id === recordId ? {
        ...row, status: "pending", error: null, attempts: 0,
        auto_retry_count: 1, next_attempt_ms: 0,
        failure_history: [...(row.failure_history || []), {
          at, error: row.error || null,
        }].slice(-10),
        timeline: [...(row.timeline || []), {
          state: "pending", at, attempt: row.total_attempts || 0,
          reason: "one_verified_transient_retry",
        }].slice(-180),
      } : row),
    };
  });
}

/**
 * Explicit Quality Agent batch signatures. These classify the authoritative
 * stored item ledger; derived counters cannot disagree unless the stored
 * snapshot contains contradictory legacy metadata.
 */
export function factoryBatchQualitySignals(job, nowMs = Date.now()) {
  if (!job) return [];
  const signals = [];
  const counts = factoryBatchCounts(job);
  const ids = job.items.map(item => item.id);
  if (new Set(ids).size !== ids.length) {
    signals.push({ code: "QA-FACTORY-BATCH-DUPLICATE-ITEM", safe_auto_recover: false,
      detail: "Duplicate output IDs in batch ledger; prevent any further dispatch" });
  }
  if ((job.status === "completed" || job.status === "failed") && counts.pending_count) {
    signals.push({ code: "QA-FACTORY-BATCH-STATE-MISMATCH", safe_auto_recover: true,
      detail: "Terminal job still has pending/processing items" });
  }
  if ((job.status === "queued" || job.status === "running") && !counts.pending_count) {
    signals.push({ code: "QA-FACTORY-BATCH-STATE-MISMATCH", safe_auto_recover: true,
      detail: "Active job has only terminal items" });
  }
  // A transient retry or a lease heartbeat is not an approval. Watch actual
  // successful completions while work remains; existing cron safely reclaims
  // expired profile leases and resumes from the durable item ledger.
  const lastSuccess = Math.max(
    Date.parse(job.created_at || job.updated_at || "") || 0,
    ...(job.items || []).flatMap(item => (item.timeline || [])
      .filter(event => event.state === "approved" || event.state === "already_satisfied")
      .map(event => Date.parse(event.at || "") || 0)),
  );
  const approvalIdleMs = nowMs - lastSuccess;
  if (counts.pending_count && ["queued", "running"].includes(job.status) &&
      lastSuccess > 0 && approvalIdleMs >= 15 * 60 * 1000) {
    signals.push({ code: "QA-FACTORY-BATCH-STALLED", safe_auto_recover: true,
      detail: "Pending Factory approvals with no successful approval for 15 minutes; existing cron reclaims expired lease and resumes pending items" });
    if (approvalIdleMs >= 30 * 60 * 1000) {
      signals.push({ code: "QA-FACTORY-BATCH-RECOVERY-FAILED", safe_auto_recover: false,
        detail: "No successful Factory approval after an additional 15 minutes; operator attention required" });
    }
  }
  if (job.items.some(item => item.status === "pending" && Number(item.next_attempt_ms) > nowMs)) {
    signals.push({ code: "QA-FACTORY-BATCH-TRANSIENT-WAIT", safe_auto_recover: true,
      detail: "Transient item(s) are scheduled for bounded retry; do not dispatch before backoff expires" });
  }
  if ((job.items || []).some(item => item.status === "failed" && !factoryBatchFailureRouted(item))) {
    signals.push({ code: "QA-FACTORY-BATCH-FAILED-ITEM", safe_auto_recover: false,
      detail: "Failed outputs require inspection or Retry Failed; never retry successful rows" });
    // A Factory item may fail before Airtable has any Platform Output row.
    // The exact R2 job ledger is authoritative for the approval error; do not
    // classify a missing record from a UI display number alone.
    const sourceMissing = (job.items || []).filter(item => item.status === "failed" && !factoryBatchFailureRouted(item) &&
      /(?:404|422|not found|missing output|unknown record|record does not exist|invalid record)/i.test(String(item.error || "")));
    if (sourceMissing.length) {
      signals.push({
        code: "QA-FACTORY-APPROVAL-SOURCE-NOT-FOUND",
        safe_auto_recover: false,
        detail: "One or more failed Factory approval items report missing/invalid authority. Reread authoritative Airtable by record ID, inspect stored item error and timeline, and quarantine ambiguous writes; do not create or approve a substitute.",
        output_ids: sourceMissing.map(item => item.output_id).filter(Boolean),
      });
    }
  }
  return signals;
}
/**
 * Mark one precise R2 Factory item terminal when its authoritative Platform
 * Output has been independently verified absent. This is ledger reconciliation,
 * never an approval, content recreation or publish. The validation callback
 * must obtain a fresh *authoritative* Airtable result; an unavailable/timeout
 * response is NOT proof of absence.
 */
export async function factoryBatchMarkRemoved(
  bucket, {profileId, requestId, recordId, outputId, verifyAbsent, reason, verifiedBy = "quality-agent"} = {},
) {
  assertBucket(bucket);
  if (!ID.test(String(recordId || "")) || !Number.isSafeInteger(Number(outputId)) ||
      Number(outputId) <= 0 || typeof verifyAbsent !== "function" ||
      !String(reason || "").trim()) {
    throw Error("Exact record identity, output ID, verifier and reason required");
  }
  const snapshot = await factoryBatchRead(bucket, profileId, requestId);
  const item = snapshot?.items?.find(row => row.id === recordId && Number(row.output_id) === Number(outputId));
  if (!item) throw Error("Exact Factory ledger item not found; no reconciliation");
  if (item.status === "skipped_removed") return snapshot; // idempotent
  if (item.status !== "failed") throw Error("Only failed approval items can be reconciled as removed");
  const absent = await verifyAbsent(recordId, Number(outputId));
  if (absent !== true) throw Error("Authoritative Airtable absence not confirmed");
  const key = factoryBatchKey(profileId, requestId);
  return cas(bucket, key, job => {
    const matching = (job.items || []).filter(row =>
      row.id === recordId && Number(row.output_id) === Number(outputId));
    if (matching.length !== 1) throw Error("Factory ledger changed or identity ambiguous");
    if (matching[0].status === "skipped_removed") return null;
    if (matching[0].status !== "failed") throw Error("Factory item changed after verification");
    const at = new Date().toISOString();
    const items = job.items.map(row => row.id === recordId ? {
      ...row,
      status: "skipped_removed",
      removed_original_error: row.error || null,
      error: null,
      next_attempt_ms: 0,
      removed_reason: String(reason).slice(0, 500),
      removed_verified_by: String(verifiedBy).slice(0, 120),
      removed_verified_at: at,
      timeline: [...(row.timeline || []), {
        state: "skipped_removed", at, attempt: row.total_attempts || 0,
        reason: String(reason).slice(0, 500),
      }].slice(-180),
    } : row);
    const counts = factoryBatchCounts({...job,items});
    return {...job, items, updated_at: at,
      status: counts.pending_count ? "running" :
        counts.failed_count && !counts.approved_count && !counts.skipped_count ? "failed" : "completed"};
  });
}

/**
 * Close one terminal FAILED row on the active Factory desk only when a matching
 * exception-recovery event has already been persisted and independently read
 * back from Airtable. This does not change status, clear error, or approve.
 * verifyRouted must fail closed on missing, ambiguous or unavailable history.
 */
export async function factoryBatchMarkExceptionRouted(bucket, {
  profileId, requestId, recordId, outputId, eventKey, reason,
  verifyRouted, verifiedBy = "quality-agent",
} = {}) {
  assertBucket(bucket);
  if (!ID.test(String(recordId || "")) || !Number.isSafeInteger(Number(outputId)) ||
      Number(outputId) <= 0 || typeof verifyRouted !== "function" ||
      !/^[a-zA-Z0-9:_-]{12,180}$/.test(String(eventKey || "")) ||
      !String(reason || "").trim()) {
    throw Error("Exact failed row, verified exception audit and reason required");
  }
  const snapshot = await factoryBatchRead(bucket, profileId, requestId);
  const rows = (snapshot?.items || []).filter(item =>
    item.id === recordId && Number(item.output_id) === Number(outputId));
  if (rows.length !== 1) throw Error("Exact Factory failed row not found or ambiguous");
  if (factoryBatchFailureRouted(rows[0])) {
    if (rows[0].exception_recovery.event_key !== eventKey) throw Error("Exception audit identity conflict");
    return snapshot;
  }
  if (rows[0].status !== "failed") throw Error("Only terminal failed rows may be routed");
  const verified = await verifyRouted({
    profileId, requestId, recordId, outputId: Number(outputId), eventKey,
    error: rows[0].error || null,
  });
  if (verified !== true) throw Error("Matching persisted Airtable exception audit not verified");
  return cas(bucket, factoryBatchKey(profileId, requestId), job => {
    const current = (job.items || []).filter(item =>
      item.id === recordId && Number(item.output_id) === Number(outputId));
    if (current.length !== 1) throw Error("Factory failed row changed or ambiguous");
    if (factoryBatchFailureRouted(current[0])) {
      if (current[0].exception_recovery.event_key !== eventKey) throw Error("Exception audit identity conflict");
      return null;
    }
    if (current[0].status !== "failed") throw Error("Factory failed row changed after verification");
    const at = new Date().toISOString();
    const items = job.items.map(item => item.id === recordId ? {
      ...item, exception_recovery: {
        state: "routed", event_key: eventKey, reason: String(reason).slice(0, 500),
        at, verified_by: String(verifiedBy).slice(0, 120),
      },
      timeline: [...(item.timeline || []), {
        state: "exception_routed", at, attempt: item.total_attempts || 0,
        event_key: eventKey,
      }].slice(-180),
    } : item);
    return {...job, items, updated_at: at};
  });
}

export async function factoryBatchReconcile(bucket, profileId, requestId) {
  assertBucket(bucket);
  const key = factoryBatchKey(profileId, requestId);
  return cas(bucket, key, job => {
    if (new Set(job.items.map(item => item.id)).size !== job.items.length) return null;
    const counts = factoryBatchCounts(job);
    const expected = counts.pending_count ? "running"
      : counts.failed_count && !counts.approved_count && !counts.skipped_count ? "failed" : "completed";
    if (job.status === expected || (job.status === "queued" && counts.pending_count)) return null;
    return { ...job, status: expected, updated_at: new Date().toISOString() };
  });
}
