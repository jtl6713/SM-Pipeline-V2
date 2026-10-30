/**
 * Factory submission deduplication independent of the browser's request_id.
 *
 * R2 conditional writes serialize each profile's output-ID claims. Claims are
 * deliberately sticky: a timed-out submit must not silently become available
 * for another device's newly generated request ID. A later approval of the
 * same Airtable output requires an explicit audited claim transition (e.g. a
 * genuinely new revision), not a second click.
 *
 * Legacy per-profile batch ledgers are indexed on first use. An incomplete
 * migration fails closed, never silently treating an old approved output as new.
 */
import { FACTORY_BATCH_PREFIX } from "./factory-approval-queue.mjs";

export const FACTORY_OUTPUT_CLAIMS_PREFIX = FACTORY_BATCH_PREFIX + "/output-claims-v1";
const ID = /^rec[A-Za-z0-9]+$/;
const RID = /^[A-Za-z0-9_-]{12,128}$/;
const SCHEMA = "studio.factory-output-claims.1";
const MAX_LEGACY_JOBS = 4000;

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
  for (const job of jobs) {
    const owner = String(job.group_request_id || job.request_id || "");
    if (!RID.test(owner)) continue;
    for (const item of job.items || []) {
      if (!ID.test(String(item.id || "")) ||
          ["superseded_duplicate", "skipped_removed"].includes(item.status)) continue;
      if (!outputs[item.id]) {
        outputs[item.id] = { request_id: owner, source: "legacy", at: job.created_at || null };
      }
    }
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
