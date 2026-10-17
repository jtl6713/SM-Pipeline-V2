import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireOutputApprovalLock, releaseOutputApprovalLock, withOutputApprovalLock,
  OUTPUT_APPROVAL_LOCK_MS,
} from "./output-approval-lease.mjs";

class MemoryR2 {
  constructor() { this.objects = new Map(); this.version = 0; }
  async get(key) {
    const object = this.objects.get(key);
    return object ? { etag: object.etag, text: async () => JSON.stringify(object.data) } : null;
  }
  async put(key, raw, options = {}) {
    const old = this.objects.get(key);
    if (options.onlyIf instanceof Headers
      && options.onlyIf.get("If-None-Match") === "*" && old) return null;
    if (options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
    const object = { data: JSON.parse(raw), etag: String(++this.version) };
    this.objects.set(key, object);
    return { etag: object.etag };
  }
}

test("canonical output approval lease serializes Factory versus Pipeline", async () => {
  const bucket = new MemoryR2();
  let started = false, unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const first = withOutputApprovalLock(bucket, "recOutput123", async () => {
    started = true;
    await gate;
    return "approved";
  }, { owner: "factory" });
  while (!started) await Promise.resolve();
  await assert.rejects(
    () => withOutputApprovalLock(bucket, "recOutput123", async () => "duplicate", { owner: "pipeline" }),
    e => e.status === 409 && /already in progress/.test(e.message),
  );
  unblock();
  assert.equal(await first, "approved");
  assert.equal(await withOutputApprovalLock(bucket, "recOutput123", async () => "already-approved", { owner: "next" }), "already-approved");
});

test("an expired lock can be reclaimed after a worker crash", async () => {
  const bucket = new MemoryR2();
  const before = await acquireOutputApprovalLock(bucket, "recOutput456", "dead-worker", 1000);
  await assert.rejects(
    () => acquireOutputApprovalLock(bucket, "recOutput456", "premature", 1001),
    e => e.status === 409,
  );
  const after = await acquireOutputApprovalLock(bucket, "recOutput456", "recovered", 1000 + OUTPUT_APPROVAL_LOCK_MS + 1);
  await releaseOutputApprovalLock(bucket, before); // stale owner cannot release newer owner's lease
  await assert.rejects(
    () => acquireOutputApprovalLock(bucket, "recOutput456", "third", 1000 + OUTPUT_APPROVAL_LOCK_MS + 2),
    e => e.status === 409,
  );
  await releaseOutputApprovalLock(bucket, after);
  await acquireOutputApprovalLock(bucket, "recOutput456", "third", 1000 + OUTPUT_APPROVAL_LOCK_MS + 3);
});
