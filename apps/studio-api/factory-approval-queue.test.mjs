import test from "node:test";
import assert from "node:assert/strict";
import {
  factoryBatchEnqueue, factoryBatchRead, factoryBatchList,
  factoryBatchSummary, factoryBatchCounts, factoryBatchDrain,
  factoryBatchRetry, factoryBatchLockKey, factoryBatchCronScan,
} from "./factory-approval-queue.mjs";

class FakeR2 {
  constructor() { this.objects = new Map(); this.version = 0; }
  async get(key) {
    const obj = this.objects.get(key);
    return obj ? { etag: obj.etag, text: async () => JSON.stringify(obj.value) } : null;
  }
  async put(key, body, options = {}) {
    const old = this.objects.get(key);
    const headers = options.onlyIf;
    if (headers instanceof Headers && headers.get("If-None-Match") === "*" && old) return null;
    if (headers?.etagMatches && old?.etag !== headers.etagMatches) return null;
    const next = { value: JSON.parse(body), etag: String(++this.version) };
    this.objects.set(key, next);
    return { etag: next.etag };
  }
  async list({ prefix, limit = 100, cursor }) {
    const keys = [...this.objects.keys()].filter(key => key.startsWith(prefix)).sort();
    const start = cursor ? keys.findIndex(key => key > cursor) : 0;
    const from = start < 0 ? keys.length : start;
    const page = keys.slice(from, from + limit);
    const truncated = from + limit < keys.length;
    return { truncated, cursor: truncated ? page.at(-1) : undefined,
      objects: page.map(key => ({ key })) };
  }
}
const profileId = "recProfileTest";
const requestId = "factory_test_request_20";
const records = Array.from({ length: 20 }, (_, i) => ({
  id: "recBatch" + (300 + i), output_id: i + 100,
  platform: "Instagram", format: i % 2 ? "Story" : "Reel",
}));
const opts = { profileId, requestId, records, note: "test" };

test("20 requests survive browser close, process via two independent workers, and show authoritative counts", async () => {
  const bucket = new FakeR2();
  const first = await factoryBatchEnqueue(bucket, opts);
  assert.equal(first.already_submitted, false);
  const retrySubmit = await factoryBatchEnqueue(bucket, opts);
  assert.equal(retrySubmit.already_submitted, true);
  assert.equal(bucket.objects.size, 1);
  let committed = 0;
  const approve = async () => { committed++; };
  const workerA = await factoryBatchDrain(bucket, { profileId, requestId, approve, maxItems: 8, makeOwner: () => "worker-a" });
  assert.equal(workerA.processed, 8);
  // A distinct worker/isolate owns subsequent work; no browser/global UI state.
  const workerB = await factoryBatchDrain(bucket, { profileId, requestId, approve, maxItems: 12, makeOwner: () => "worker-b" });
  assert.equal(workerB.processed, 12);
  const readBack = await factoryBatchRead(bucket, profileId, requestId);
  const status = factoryBatchSummary(readBack);
  assert.equal(status.status, "completed");
  assert.equal(status.approved_count, 20);
  assert.equal(status.done_count, 20);
  assert.equal(committed, 20);
  assert.equal(status.items.length, 20);
  assert.equal(factoryBatchCounts(readBack).pending_count, 0);
  assert.equal((await factoryBatchList(bucket, profileId))[0].id, readBack.id);
  const third = await factoryBatchDrain(bucket, { profileId, requestId, approve });
  assert.equal(third.processed, 0);
  assert.equal(committed, 20);
});

test("Atomic profile lock prevents concurrent submissions and prevents item overlap", async () => {
  const bucket = new FakeR2();
  await factoryBatchEnqueue(bucket, opts);
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let entered = 0;
  const first = factoryBatchDrain(bucket, {
    profileId, requestId, maxItems: 1, makeOwner: () => "first",
    approve: async () => { entered++; await blocked; },
  });
  // Force the approve callback to enter before attempting second claimant.
  while (entered === 0) await Promise.resolve();
  const second = await factoryBatchDrain(bucket, {
    profileId, requestId, maxItems: 1, makeOwner: () => "second",
    approve: async () => { entered++; },
  });
  assert.equal(second.claimed, false);
  assert.equal(entered, 1);
  release();
  const finished = await first;
  assert.equal(finished.processed, 1);
  assert.equal(factoryBatchCounts(finished.job).approved_count, 1);
});

test("Stale worker lease is reclaimed; canonical state check makes crash recovery idempotent", async () => {
  const bucket = new FakeR2();
  const old = await factoryBatchEnqueue(bucket, {
    profileId, requestId: "factory_reclaim_request",
    records: [records[0]],
  });
  // Simulate a crash after setting 'processing' and canonical commit.
  const jobKey = "studio/state/factory-approvals/v2/jobs/" + profileId + "/factory_reclaim_request.json";
  bucket.objects.get(jobKey).value.items[0].status = "processing";
  bucket.objects.get(jobKey).value.items[0].attempts = 1;
  const lock = factoryBatchLockKey(profileId);
  await bucket.put(lock, JSON.stringify({ owner: "dead-worker", expires_ms: 1000 }));
  let commits = 0;
  const recovered = await factoryBatchDrain(bucket, {
    profileId, requestId: "factory_reclaim_request", now: () => 2000000,
    makeOwner: () => "new-worker", approve: async () => {
      // The canonical approval endpoint discovers this output is already approved.
      return { already_approved: true };
    },
  });
  assert.equal(recovered.claimed, true);
  assert.equal(recovered.job.items[0].status, "already_satisfied");
  assert.equal(commits, 0);
  assert.equal(recovered.job.status, "completed");
});

test("Retry Failed never resets already-approved or already-satisfied items", async () => {
  const bucket = new FakeR2();
  const job = (await factoryBatchEnqueue(bucket, {
    profileId, requestId: "factory_retry_request",
    records: records.slice(0, 3),
  })).job;
  const key = "studio/state/factory-approvals/v2/jobs/" + profileId + "/factory_retry_request.json";
  const stored = bucket.objects.get(key);
  stored.value.items[0].status = "approved";
  stored.value.items[1].status = "already_satisfied";
  stored.value.items[2].status = "failed";
  stored.value.status = "completed";
  const retried = await factoryBatchRetry(bucket, profileId, "factory_retry_request");
  assert.deepEqual(retried.items.map(x => x.status), ["approved", "already_satisfied", "pending"]);
  assert.equal(retried.status, "queued");
});

test("cron recovery rotates across old R2 history beyond 200 jobs without starving new profiles", async () => {
  const bucket = new FakeR2();
  const base = "studio/state/factory-approvals/v2/jobs/";
  for (let i = 0; i < 307; i++) {
    const key = base + "rec" + String(i).padStart(5, "0") + "/factory_cron_" + String(i).padStart(5, "0") + ".json";
    await bucket.put(key, JSON.stringify({ status: i === 306 ? "queued" : "completed", items: [] }));
  }
  let foundLast = false;
  const pages = [];
  for (let scan = 0; scan < 3; scan++) {
    const result = await factoryBatchCronScan(bucket, { maxScan: 120, pageSize: 60 });
    pages.push(result);
    if (result.objects.some(row => row.key.includes("/rec00306/"))) foundLast = true;
  }
  assert.equal(foundLast, true, "Queued work behind first 200 keys must be seen");
  assert.equal(pages[0].scanned, 120);
  assert.equal(pages[1].scanned, 120);
  assert.equal(pages[2].scanned, 67);
  assert.equal(pages[2].wrapped, true);
  const wrapped = await factoryBatchCronScan(bucket, { maxScan: 120 });
  assert.ok(wrapped.objects.some(row => row.key.includes("/rec00000/")), "Full pass must restart to catch newly inserted keys");
});

test("bounded drain executes a useful chunk then safely leaves the remainder for cron", async () => {
  const bucket = new FakeR2();
  const rid = "bounded_factory_drain_20";
  await factoryBatchEnqueue(bucket, { profileId, requestId: rid, records });
  let clockMs = 100000;
  let calls = 0;
  const result = await factoryBatchDrain(bucket, {
    profileId, requestId: rid, maxItems: 20, maxElapsedMs: 15000,
    now: () => clockMs, makeOwner: () => "bounded-worker",
    approve: async () => { calls++; clockMs += 6000; },
  });
  assert.equal(result.processed, 3);
  assert.equal(result.job.status, "running");
  assert.equal(factoryBatchCounts(result.job).pending_count, 17);
  assert.equal(calls, 3);
  const resumed = await factoryBatchDrain(bucket, {
    profileId, requestId: rid, maxItems: 20, now: () => clockMs,
    makeOwner: () => "cron-worker", approve: async () => { calls++; },
  });
  assert.equal(resumed.job.status, "completed");
  assert.equal(resumed.job.items.filter(item => item.status === "approved").length, 20);
  assert.equal(calls, 20);
});

test("independent batch IDs for same outputs must use canonical state to skip duplicates", async () => {
  const bucket = new FakeR2();
  const firstRequest = "cross_job_first_20261016";
  const secondRequest = "cross_job_second_20261016";
  const selected = records.slice(0, 4);
  await factoryBatchEnqueue(bucket, { profileId, requestId: firstRequest, records: selected });
  await factoryBatchEnqueue(bucket, { profileId, requestId: secondRequest, records: selected });
  const previouslyApproved = new Set();
  let canonicalCommits = 0;
  const canonicalApproval = async id => {
    if (previouslyApproved.has(id)) return { already_approved: true };
    previouslyApproved.add(id);
    canonicalCommits++;
    return { id };
  };
  const initial = await factoryBatchDrain(bucket, {
    profileId, requestId: firstRequest, approve: canonicalApproval,
    maxItems: 10, makeOwner: () => "job-one",
  });
  const duplicate = await factoryBatchDrain(bucket, {
    profileId, requestId: secondRequest, approve: canonicalApproval,
    maxItems: 10, makeOwner: () => "job-two",
  });
  assert.equal(initial.job.items.filter(x => x.status === "approved").length, 4);
  assert.equal(duplicate.job.items.filter(x => x.status === "already_satisfied").length, 4);
  assert.equal(canonicalCommits, 4);
});
