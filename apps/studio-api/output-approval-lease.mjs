/**
 * Canonical publishing-approval transaction mutex, shared by Factory,
 * Pipeline single-output and legacy Approve All entrypoints.
 * R2 conditional writes avoid simultaneous approval handoffs for one output.
 */
export const OUTPUT_APPROVAL_LOCK_PREFIX = "studio/state/output-approval-locks/v1";
export const OUTPUT_APPROVAL_LOCK_MS = 15 * 60 * 1000;
function approvalError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function lockKey(id) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(id || ""))) {
    throw approvalError(400, "Invalid output record ID");
  }
  return OUTPUT_APPROVAL_LOCK_PREFIX + "/" + id + ".json";
}
async function readLock(bucket, key) {
  const found = await bucket.get(key);
  if (!found) return null;
  return { data: JSON.parse(await found.text()), etag: found.etag };
}
export async function acquireOutputApprovalLock(bucket, id, owner, nowMs = Date.now()) {
  if (!bucket?.get || !bucket?.put) throw approvalError(503, "Approval lock store unavailable");
  const key = lockKey(id);
  for (let i = 0; i < 5; i++) {
    const old = await readLock(bucket, key);
    if (old?.data?.owner && Number(old.data.expires_ms) > nowMs) {
      throw approvalError(409, "Output approval already in progress; check its current status before retrying");
    }
    const value = { owner, expires_ms: nowMs + OUTPUT_APPROVAL_LOCK_MS };
    const result = await bucket.put(key, JSON.stringify(value), {
      onlyIf: old
        ? { etagMatches: old.etag }
        : new Headers({ "If-None-Match": "*" }),
      httpMetadata: { contentType: "application/json" },
    });
    if (result) return { key, owner };
  }
  throw approvalError(409, "Concurrent output approval; retry only after checking status");
}
export async function releaseOutputApprovalLock(bucket, lease) {
  if (!lease) return;
  for (let i = 0; i < 3; i++) {
    const old = await readLock(bucket, lease.key);
    if (!old || old.data?.owner !== lease.owner) return;
    const released = await bucket.put(lease.key, JSON.stringify({ owner: null, expires_ms: 0 }), {
      onlyIf: { etagMatches: old.etag },
      httpMetadata: { contentType: "application/json" },
    });
    if (released) return;
  }
}
export async function withOutputApprovalLock(bucket, id, execute, { owner = null, now = Date.now } = {}) {
  const token = owner || crypto.randomUUID();
  const lease = await acquireOutputApprovalLock(bucket, id, token, now());
  try {
    return await execute();
  } finally {
    await releaseOutputApprovalLock(bucket, lease).catch(error => {
      console.warn("Output approval lease release deferred to expiry", id, error);
    });
  }
}
