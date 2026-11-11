/**
 * Factory submission deduplication independent of the browser's request_id.
 *
 * R2 conditional writes serialize each profile's output-ID claims. Claims are
 * deliberately sticky while a submission may still be committing: a timed-out
 * POST must not silently become available for another device's newly generated
 * request ID during the grace window.
 *
 * After grace, claims with no parent group and no profile-local job are
 * stranded reservations (crash between claim and enqueue, or a lost browser
 * request ID). Those may be transferred by an audited reclaim. Terminal child
 * ledgers whose conflicting items are only failed/skipped may likewise move.
 *
 * Completed ledgers that no longer need Activity attention (all conflicting
 * items terminal, no pending/running work) also transfer: otherwise a sticky
 * approved/already_satisfied claim blocks Ready-for-Review resubmit while
 * Active Approvals correctly shows "All clear." Live pending/enqueuing work
 * stays fail-closed.
 *
 * Legacy per-profile batch ledgers are indexed on first use. An incomplete
 * migration fails closed, never silently treating an old approved output as new.
 */
import {
  FACTORY_BATCH_PREFIX, factoryBatchRead, factoryBatchNeedsAttention,
} from "./factory-approval-queue.mjs";
import { factoryApprovalGroupRead } from "./factory-approval-groups.mjs";

export const FACTORY_OUTPUT_CLAIMS_PREFIX = FACTORY_BATCH_PREFIX + "/output-claims-v1";
export const FACTORY_UNBACKED_CLAIM_GRACE_MS = 90 * 1000;
const ID = /^rec[A-Za-z0-9]+$/;
const RID = /^[A-Za-z0-9_-]{12,128}$/;
const SCHEMA = "studio.factory-output-claims.1";
const MAX_LEGACY_JOBS = 4000;
const RECLAIMABLE_ITEM = new Set(["failed", "skipped_removed", "superseded_duplicate"]);
const TERMINAL_ITEM = new Set([
  "approved", "already_satisfied", "failed", "skipped_removed", "superseded_duplicate",
]);

function assertInput(bucket, profileId, requestId, ids) {
  if (!bucket?.get || !bucket?.put || !bucket?.list) throw Error("Durable R2 claims require read/write/list");
  if (!ID.test(String(profileId || "")) || !RID.test(String(requestId || ""))) {
    throw Error("Invalid Factory claim identity");
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
      ids.some(id => !ID.test(String(id)))) throw Error("Invalid Factory output claim IDs");
}

function key(profileId) { return FACTORY_OUTPUT_CLAIMS_PREFIX + "/" + profileId + ".json"; }
async function read(bucket, path) {
  const object = await bucket.get(path);
  return object ? { value: JSON.parse(await object.text()), etag: object.etag } : null;
}
async function conditionalPut(bucket, path, value, etag = null) {
  return bucket.put(path, JSON.stringify(value), {
    onlyIf: etag ? { etagMatches: etag } : new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
  });
}

async function seedLegacy(bucket, profileId) {
  const prefix = FACTORY_BATCH_PREFIX + "/jobs/" + profileId + "/";
  const objects = [];
  let cursor;
  do {
    const remaining = MAX_LEGACY_JOBS + 1 - objects.length;
    if (remaining < 1) throw Error("Factory legacy job history exceeds safe migration budget");
    const page = await bucket.list({
      prefix, limit: Math.min(1000, remaining),
      ...(cursor ? { cursor } : {}),
    });
    objects.push(...(page.objects || []));
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw Error("Factory claim migration cursor stalled");
    cursor = page.cursor;
  } while (true);
  if (objects.length > MAX_LEGACY_JOBS) {
    throw Error("Factory legacy job history exceeds safe migration budget");
  }
  // Parent ledgers can persist even if the Worker dies before child enqueue.
  // They must be included in first-use migration, not inferred from jobs alone.
  const groupObjects = [];
  let groupCursor;
  do {
    const remaining = MAX_LEGACY_JOBS + 1 - groupObjects.length;
    if (remaining < 1) throw Error("Factory parent migration exceeds safe budget");
    const page = await bucket.list({
      prefix: FACTORY_BATCH_PREFIX + "/groups/", limit: Math.min(1000, remaining),
      ...(groupCursor ? { cursor: groupCursor } : {}),
    });
    groupObjects.push(...(page.objects || []));
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === groupCursor) throw Error("Factory parent migration cursor stalled");
    groupCursor = page.cursor;
  } while (true);
  if (groupObjects.length > MAX_LEGACY_JOBS) throw Error("Factory parent migration exceeds safe budget");
  const parentClaims = [];
  for (let i = 0; i < groupObjects.length; i += 30) {
    const reads = await Promise.all(groupObjects.slice(i, i + 30).map(row => read(bucket, row.key)));
    for (const item of reads) {
      const parent = item?.value;
      if (!parent) continue;
      if (parent.schema !== "studio.factory-approval-group.1" ||
          !RID.test(String(parent.request_id || "")) || !Array.isArray(parent.records)) {
        throw Error("Unrecognized Factory parent ledger; refusing incomplete migration");
      }
      for (const row of parent.records) {
        if (row.profile_id === profileId && ID.test(String(row.id || ""))) {
          parentClaims.push({ id: row.id, owner: parent.request_id, at: parent.created_at || null });
        }
      }
    }
  }
  const jobs = [];
  for (let i = 0; i < objects.length; i += 30) {
    const reads = await Promise.all(objects.slice(i, i + 30).map(row => read(bucket, row.key)));
    for (const item of reads) {
      const value = item?.value;
      if (value?.schema === "studio.factory-batch.2" &&
          value.profile_id === profileId && RID.test(String(value.request_id || ""))) {
        jobs.push(value);
      } else if (item?.value) {
        throw Error("Unrecognized Factory legacy ledger; refusing incomplete claim migration");
      }
    }
  }
  // The first accepted owner wins for preexisting duplicate batches. A later
  // superseded_duplicate ledger never reclaims an older real approval.
  jobs.sort((a, b) => (Date.parse(a.created_at || 0) || 0) -
    (Date.parse(b.created_at || 0) || 0) || a.request_id.localeCompare(b.request_id));
  const outputs = {};
  const candidates = [
    ...parentClaims.map(row => ({ id: row.id, owner: row.owner, at: row.at })),
    ...jobs.flatMap(job => (job.items || [])
      .filter(item => ID.test(String(item.id || "")) &&
        !["superseded_duplicate", "skipped_removed"].includes(item.status))
      .map(item => ({ id: item.id,
        owner: String(job.group_request_id || job.request_id || ""),
        at: job.created_at || null }))),
  ].sort((a, b) => (Date.parse(a.at || 0) || 0) -
    (Date.parse(b.at || 0) || 0) || a.owner.localeCompare(b.owner));
  for (const row of candidates) {
    if (!RID.test(row.owner) || outputs[row.id]) continue;
    outputs[row.id] = { request_id: row.owner, source: "legacy", at: row.at };
  }
  const now = new Date().toISOString();
  return { schema: SCHEMA, profile_id: profileId, outputs,
    migration_job_count: jobs.length, created_at: now, updated_at: now };
}

async function ensureRegistry(bucket, profileId) {
  const path = key(profileId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await read(bucket, path);
    if (existing) {
      if (existing.value.schema !== SCHEMA ||
          existing.value.profile_id !== profileId || !existing.value.outputs ||
          typeof existing.value.outputs !== "object") {
        throw Error("Factory claims registry invalid; refuse submission");
      }
      return existing;
    }
    const initial = await seedLegacy(bucket, profileId);
    if (await conditionalPut(bucket, path, initial)) return await read(bucket, path);
  }
  throw Error("Concurrent Factory claim migration; retry with same request ID");
}

/** CAS claim all outputs of one profile, or return a conflict without mutation. */
export async function factoryOutputClaimReserve(bucket, { profileId, requestId, ids }) {
  const unique = [...new Set(ids)];
  assertInput(bucket, profileId, requestId, unique);
  const path = key(profileId);
  for (let attempt = 0; attempt < 16; attempt++) {
    const current = await ensureRegistry(bucket, profileId);
    const outputs = current.value.outputs;
    const conflicts = unique
      .filter(id => outputs[id] && outputs[id].request_id !== requestId)
      .map(id => ({ id, request_id: outputs[id].request_id }));
    if (conflicts.length) return {
      ok: false, profile_id: profileId, request_id: requestId,
      conflicts, owners: [...new Set(conflicts.map(row => row.request_id))],
    };
    const unclaimed = unique.filter(id => !outputs[id]);
    if (!unclaimed.length) return { ok: true, already_reserved: true };
    const now = new Date().toISOString();
    const next = {
      ...current.value, updated_at: now,
      outputs: { ...outputs },
    };
    for (const id of unclaimed) {
      next.outputs[id] = { request_id: requestId, source: "submission", at: now };
    }
    if (await conditionalPut(bucket, path, next, current.etag)) {
      return { ok: true, already_reserved: false, claimed: unclaimed };
    }
  }
  throw Error("Concurrent Factory claims conflict; retry with original request ID");
}

/** Read-only conflict check. Includes complete legacy migration on first read. */
export async function factoryOutputClaimInspect(bucket, { profileId, requestId, ids }) {
  const unique = [...new Set(ids)];
  assertInput(bucket, profileId, requestId, unique);
  const current = await ensureRegistry(bucket, profileId);
  const conflicts = unique
    .filter(id => current.value.outputs[id] &&
      current.value.outputs[id].request_id !== requestId)
    .map(id => ({ id, request_id: current.value.outputs[id].request_id }));
  return { ok: conflicts.length === 0, conflicts,
    owners: [...new Set(conflicts.map(row => row.request_id))] };
}

async function claimOwnerLedgerState(bucket, profileId, ownerRequestId, conflictIds) {
  const group = await factoryApprovalGroupRead(bucket, ownerRequestId);
  if (group?.schema === "studio.factory-approval-group.1" && Array.isArray(group.children)) {
    const wanted = new Set(conflictIds);
    const statuses = [];
    const jobs = [];
    for (const child of group.children) {
      const job = await factoryBatchRead(bucket, child.profile_id, child.request_id);
      if (!job) {
        // Parent reserved but child never landed: treat as still committing when
        // the parent itself is fresh enough; otherwise allow reclaim below.
        return { kind: "group_incomplete", parent: group, statuses };
      }
      jobs.push(job);
      for (const item of job.items || []) {
        if (wanted.has(item.id)) statuses.push(String(item.status || "pending"));
      }
    }
    if (!statuses.length) return { kind: "group_incomplete", parent: group, statuses };
    if (statuses.every((status) => RECLAIMABLE_ITEM.has(status))) {
      return { kind: "terminal_reclaimable", parent: group, statuses };
    }
    const liveConflict = statuses.some((status) => !TERMINAL_ITEM.has(status));
    const activeChildren = jobs.some((job) => factoryBatchNeedsAttention(job));
    // Completed / routed ownership is invisible on Active Approvals. Keeping the
    // claim forever recreates "overlap" while Activity shows All clear.
    if (!liveConflict && !activeChildren) {
      return { kind: "terminal_inactive", parent: group, statuses };
    }
    return { kind: "blocking", parent: group, statuses };
  }
  const job = await factoryBatchRead(bucket, profileId, ownerRequestId);
  if (job?.schema === "studio.factory-batch.2" && Array.isArray(job.items)) {
    const wanted = new Set(conflictIds);
    const statuses = job.items
      .filter((item) => wanted.has(item.id))
      .map((item) => String(item.status || "pending"));
    if (!statuses.length) return { kind: "blocking", job, statuses };
    if (statuses.every((status) => RECLAIMABLE_ITEM.has(status))) {
      return { kind: "terminal_reclaimable", job, statuses };
    }
    const liveConflict = statuses.some((status) => !TERMINAL_ITEM.has(status));
    if (!liveConflict && !factoryBatchNeedsAttention(job)) {
      return { kind: "terminal_inactive", job, statuses };
    }
    return { kind: "blocking", job, statuses };
  }
  return { kind: "unbacked" };
}

/**
 * Transfer safe conflicts onto requestId. Never steals live pending/enqueuing
 * ownership. Unbacked reservations require grace so an in-flight enqueue is
 * not raced. Inactive completed ownership may move so Activity-empty fences
 * cannot permanently block a Ready-for-Review resubmit.
 */
export async function factoryOutputClaimReclaimIfSafe(bucket, {
  profileId, requestId, ids,
  nowMs = Date.now(),
  graceMs = FACTORY_UNBACKED_CLAIM_GRACE_MS,
}) {
  const unique = [...new Set(ids)];
  assertInput(bucket, profileId, requestId, unique);
  const path = key(profileId);
  for (let attempt = 0; attempt < 16; attempt++) {
    const current = await ensureRegistry(bucket, profileId);
    const outputs = current.value.outputs;
    const hard = [];
    const reclaim = [];
    const ownerCache = new Map();
    for (const id of unique) {
      const claim = outputs[id];
      if (!claim || claim.request_id === requestId) continue;
      const owner = String(claim.request_id || "");
      if (!RID.test(owner)) {
        hard.push({ id, request_id: owner, reason: "invalid_owner" });
        continue;
      }
      let state = ownerCache.get(owner);
      if (!state) {
        const ownedIds = unique.filter((rowId) => outputs[rowId]?.request_id === owner);
        state = await claimOwnerLedgerState(bucket, profileId, owner, ownedIds);
        ownerCache.set(owner, state);
      }
      if (state.kind === "terminal_reclaimable") {
        reclaim.push({ id, request_id: owner, reason: "terminal_failed" });
        continue;
      }
      if (state.kind === "terminal_inactive") {
        reclaim.push({ id, request_id: owner, reason: "terminal_inactive" });
        continue;
      }
      if (state.kind === "unbacked") {
        const atMs = Date.parse(claim.at || "");
        const aged = Number.isFinite(atMs) && (nowMs - atMs) >= graceMs;
        if (!aged) {
          hard.push({ id, request_id: owner, reason: "unbacked_within_grace" });
          continue;
        }
        reclaim.push({ id, request_id: owner, reason: "unbacked" });
        continue;
      }
      if (state.kind === "group_incomplete") {
        const createdMs = Date.parse(state.parent?.created_at || claim.at || "");
        const aged = Number.isFinite(createdMs) && (nowMs - createdMs) >= graceMs;
        if (!aged) {
          hard.push({ id, request_id: owner, reason: "group_committing" });
          continue;
        }
        reclaim.push({ id, request_id: owner, reason: "group_incomplete" });
        continue;
      }
      hard.push({ id, request_id: owner, reason: "durable_active_work" });
    }
    if (hard.length) {
      return {
        ok: false, reclaimed: [],
        conflicts: hard,
        owners: [...new Set(hard.map((row) => row.request_id))],
      };
    }
    if (!reclaim.length) {
      return { ok: true, reclaimed: [], already_owned: true };
    }
    const now = new Date(nowMs).toISOString();
    const next = {
      ...current.value, updated_at: now,
      outputs: { ...outputs },
    };
    for (const row of reclaim) {
      next.outputs[row.id] = {
        request_id: requestId,
        source: "safe_reclaim",
        previous_request_id: row.request_id,
        previous_reason: row.reason,
        at: now,
      };
    }
    if (await conditionalPut(bucket, path, next, current.etag)) {
      return {
        ok: true,
        reclaimed: reclaim.map((row) => row.id),
        previous_owners: [...new Set(reclaim.map((row) => row.request_id))],
      };
    }
  }
  throw Error("Concurrent Factory claim reclaim; retry with the same request ID");
}
