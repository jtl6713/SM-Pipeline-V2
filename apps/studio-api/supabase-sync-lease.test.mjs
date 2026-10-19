import test from "node:test";
import assert from "node:assert/strict";
import {
  acquirePhase5SyncLease,
  renewPhase5SyncLease,
  releasePhase5SyncLease,
  verifyPhase5SyncLease,
  withPhase5SyncLease,
} from "./supabase-sync-lease.mjs";
import {
  syncAllProfilesPipelineToSupabase,
  noteSupabaseCircuitFailure,
  resetSupabaseCircuitForTests,
} from "./supabase-pipeline-reads.mjs";

class R2CASBucket {
  constructor() { this.current = null; this.version = 0; }
  async get() {
    const snapshot = this.current;
    if (!snapshot) return null;
    return { etag: snapshot.etag, json: async () => JSON.parse(snapshot.body) };
  }
  async put(_key, body, options = {}) {
    const condition = options.onlyIf || {};
    if ("etagMatches" in condition && this.current?.etag !== condition.etagMatches) return null;
    if ("etagDoesNotMatch" in condition && condition.etagDoesNotMatch === "*" && this.current) return null;
    const etag = String(++this.version);
    this.current = { body, etag };
    return { etag };
  }
}

test("Phase 5 CAS lease excludes overlapping Worker isolates", async () => {
  const bucket = new R2CASBucket();
  const result = await Promise.all([
    acquirePhase5SyncLease(bucket, { owner: "first", now: 100, ttlMs: 1000 }),
    acquirePhase5SyncLease(bucket, { owner: "second", now: 100, ttlMs: 1000 }),
  ]);
  assert.equal(result.filter((row) => row.acquired).length, 1);
  assert.equal(result.filter((row) => !row.acquired).length, 1);
});

test("Phase 5 lease recovers after expiry and fences stale release", async () => {
  const bucket = new R2CASBucket();
  assert.equal((await acquirePhase5SyncLease(bucket, { owner: "old", now: 100, ttlMs: 1000 })).acquired, true);
  assert.equal((await acquirePhase5SyncLease(bucket, { owner: "new", now: 1101, ttlMs: 1000 })).acquired, true);
  assert.equal(await releasePhase5SyncLease(bucket, "old", 1102), false);
  await assert.rejects(verifyPhase5SyncLease(bucket, "old", 1102), /lost lease/);
  await renewPhase5SyncLease(bucket, "new", { now: 1102, ttlMs: 1000 });
  assert.equal((await verifyPhase5SyncLease(bucket, "new", 1103)).owner, "new");
});

test("Phase 5 wrapper skips concurrent invocation then releases ownership", async () => {
  const bucket = new R2CASBucket();
  let unblock;
  const pending = new Promise((resolve) => { unblock = resolve; });
  let started;
  const active = new Promise((resolve) => { started = resolve; });
  const first = withPhase5SyncLease(bucket, async ({ assertOwned }) => {
    await assertOwned();
    started();
    await pending;
    return { ok: true };
  });
  await active;
  assert.equal((await withPhase5SyncLease(bucket, () => ({ ok: true }))).reason, "sync_already_running");
  unblock();
  assert.equal((await first).ok, true);
  assert.equal((await withPhase5SyncLease(bucket, () => ({ ok: true }))).ok, true);
});

test("Phase 5 sync reports partial failure rather than unconditional success", async () => {
  resetSupabaseCircuitForTests();
  const result = await syncAllProfilesPipelineToSupabase({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test",
  }, [{ id: "recProfile123", fields: { Active: true } }], {
    f: (row, field) => row.fields[field],
    listRecords: async () => [],
    contentProfileFilterFormula: () => "TRUE()",
    assertLease: async () => { throw new Error("lease check failed"); },
  });
  // Lease ownership failure must propagate rather than permit a second writer.
  assert.equal(result.ok, false);
  assert.equal(result.status, "partial");
  assert.match(result.results[0].error, /lease check failed/);
  resetSupabaseCircuitForTests();
});

test("Phase 5 circuit activation aborts remaining profiles and production requests", async () => {
  resetSupabaseCircuitForTests();
  const result = await syncAllProfilesPipelineToSupabase({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test",
  }, [{ id: "profile-1", fields: { Active: true } }, { id: "profile-2", fields: { Active: true } }], {
    f: (row, field) => row.fields[field],
    contentProfileFilterFormula: () => "TRUE()",
    assertLease: async () => {
      noteSupabaseCircuitFailure(new Error("PGRST003 pool timeout"));
      noteSupabaseCircuitFailure(new Error("57014 statement timeout"));
    },
  });
  assert.equal(result.status, "circuit_open");
  assert.equal(result.ok, false);
  assert.equal(result.results.length, 1);
  assert.equal(result.production_requests.reason, "supabase_circuit_open");
  resetSupabaseCircuitForTests();
});
