/**
 * Phase 5 only: cross-isolate R2 CAS lease for the expensive Airtable -> Supabase sweep.
 * Kept independent of the authoritative MAE scheduling reservation system.
 * Fail closed if R2 is unavailable; do not execute an uncoordinated sweep.
 */
export const PHASE5_SYNC_LEASE_KEY = "studio/state/phase5-sync-lease.json";
export const PHASE5_SYNC_LEASE_TTL_MS = 20 * 60 * 1000;

async function readLease(bucket) {
  const object = await bucket.get(PHASE5_SYNC_LEASE_KEY);
  if (!object) return null;
  const value = await object.json();
  if (!value || typeof value !== "object" || !object.etag) {
    throw new Error("Phase 5 sync lease is malformed; refusing an unsafe acquisition");
  }
  return { ...value, etag: object.etag };
}

export async function acquirePhase5SyncLease(bucket, {
  owner = crypto.randomUUID(),
  now = Date.now(),
  ttlMs = PHASE5_SYNC_LEASE_TTL_MS,
} = {}) {
  if (!bucket?.get || !bucket?.put) throw new Error("Phase 5 sync requires STUDIO_MEDIA R2 CAS binding");
  const current = await readLease(bucket);
  if (current && Number(current.expires_at || 0) > now) {
    return { acquired: false, reason: "sync_already_running", expires_at: current.expires_at };
  }
  const value = { owner, acquired_at: now, renewed_at: now, expires_at: now + ttlMs };
  const written = await bucket.put(PHASE5_SYNC_LEASE_KEY, JSON.stringify(value), {
    onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  if (!written) return { acquired: false, reason: "sync_lease_contended" };
  return { acquired: true, ...value };
}

export async function verifyPhase5SyncLease(bucket, owner, now = Date.now()) {
  const current = await readLease(bucket);
  if (!current || current.owner !== owner || Number(current.expires_at || 0) <= now) {
    throw new Error("Phase 5 sync lost lease ownership");
  }
  return current;
}

export async function renewPhase5SyncLease(bucket, owner, {
  now = Date.now(),
  ttlMs = PHASE5_SYNC_LEASE_TTL_MS,
} = {}) {
  const current = await verifyPhase5SyncLease(bucket, owner, now);
  const updated = await bucket.put(PHASE5_SYNC_LEASE_KEY, JSON.stringify({
    owner,
    acquired_at: current.acquired_at,
    renewed_at: now,
    expires_at: now + ttlMs,
  }), {
    onlyIf: { etagMatches: current.etag },
    httpMetadata: { contentType: "application/json" },
  });
  if (!updated) throw new Error("Phase 5 sync lease renewal lost CAS race");
}

export async function releasePhase5SyncLease(bucket, owner, now = Date.now()) {
  const current = await readLease(bucket);
  if (!current || current.owner !== owner) return false;
  // Do not delete: an unconditional R2 DELETE could remove a newer owner's lock.
  const updated = await bucket.put(PHASE5_SYNC_LEASE_KEY, JSON.stringify({
    owner, acquired_at: current.acquired_at, renewed_at: now, expires_at: 0,
  }), {
    onlyIf: { etagMatches: current.etag },
    httpMetadata: { contentType: "application/json" },
  });
  return Boolean(updated);
}

export async function withPhase5SyncLease(bucket, run, {
  ttlMs = PHASE5_SYNC_LEASE_TTL_MS,
  heartbeatMs = 60 * 1000,
} = {}) {
  const acquired = await acquirePhase5SyncLease(bucket, { ttlMs });
  if (!acquired.acquired) return { skipped: true, reason: acquired.reason, expires_at: acquired.expires_at || null };
  let failure = null;
  let heartbeatBusy = false;
  let heartbeatPromise = null;
  const assertOwned = async () => {
    if (failure) throw failure;
    await verifyPhase5SyncLease(bucket, acquired.owner);
  };
  const timer = setInterval(() => {
    if (heartbeatBusy || failure) return;
    heartbeatBusy = true;
    heartbeatPromise = renewPhase5SyncLease(bucket, acquired.owner, { ttlMs })
      .catch((error) => { failure = error; })
      .finally(() => { heartbeatBusy = false; });
  }, heartbeatMs);
  if (typeof timer?.unref === "function") timer.unref();
  try {
    const result = await run({ assertOwned });
    await assertOwned();
    return result;
  } finally {
    clearInterval(timer);
    if (heartbeatPromise) await heartbeatPromise;
    try {
      await releasePhase5SyncLease(bucket, acquired.owner);
    } catch (error) {
      console.warn("Phase 5 sync lease release deferred to expiry", error);
    }
  }
}
