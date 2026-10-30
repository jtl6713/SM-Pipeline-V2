import test from "node:test";
import assert from "node:assert/strict";
import {
  factoryBatchEnqueue, factoryBatchRead, factoryBatchList,
  factoryBatchSummary, factoryBatchCounts, factoryBatchDrain,
  factoryBatchRetry, factoryBatchLockKey, factoryBatchCronScan,
  factoryBatchCronSelectJobs, factoryBatchListGlobal, factoryBatchNeedsAttention,
  factoryBatchBuild, factoryBatchQualitySignals, factoryBatchMarkRemoved,
  factoryBatchMarkExceptionRouted, factoryBatchFailureRouted, factoryBatchRetryEligible,
  factoryBatchRetryTransientOnce, factoryBatchMarkAlreadySatisfied,
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
    const next = { value: JSON.parse(body), etag: String(++this.version), customMetadata: options.customMetadata || {} };
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
      objects: page.map(key => ({ key, customMetadata: this.objects.get(key).customMetadata })) };
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

test("minute recovery chooses the oldest eligible child once per profile", () => {
  const now = Date.parse("2026-10-17T22:35:00Z");
  const child = (profileId, requestId, iso, status="pending", next_attempt_ms=0) => ({
    profileId, requestId,
    job: {
      status: "running", updated_at: iso,
      items: [{status, next_attempt_ms}],
    },
  });
  const rows = [
    child("recMiami", "miami_new", "2026-10-17T22:30:00Z"),
    child("recMiami", "miami_stale", "2026-10-17T21:45:00Z"),
    child("recMiami", "miami_backoff", "2026-10-17T21:30:00Z", "pending", now+120000),
    child("recMiami", "miami_complete", "2026-10-17T21:00:00Z", "approved"),
    child("recChicago", "chicago_ready", "2026-10-17T22:25:00Z"),
    child("recNewYork", "newyork_ready", "2026-10-17T22:33:00Z"),
  ];
  const chosen = factoryBatchCronSelectJobs(rows, {maxProfiles:5, nowMs:now});
  assert.deepEqual(chosen.map(x=>x.requestId), ["miami_stale","chicago_ready","newyork_ready"]);
  assert.equal(new Set(chosen.map(x=>x.profileId)).size, chosen.length);
  const after = rows.find(x=>x.requestId === "miami_stale");
  after.job.updated_at = "2026-10-17T22:34:00Z";
  assert.equal(factoryBatchCronSelectJobs(rows, {nowMs:now})[0].requestId,"chicago_ready");
  assert.ok(factoryBatchCronSelectJobs(rows, {nowMs:now}).some(x=>x.requestId==="miami_new"));
  assert.equal(factoryBatchCronSelectJobs(rows,{maxProfiles:1,nowMs:now}).length,1);
});

test("durable Factory timing measures queue, preflight, lease, schedule write and 60-second budget", async () => {
  const bucket = new FakeR2();
  const rid = "factory_latency_instrumented";
  let clockMs = 100000;
  await factoryBatchEnqueue(bucket, {
    profileId, requestId: rid, records: records.slice(0, 1),
    now: new Date(clockMs).toISOString(),
  });
  clockMs += 250;
  const finished = await factoryBatchDrain(bucket, {
    profileId, requestId: rid, now: () => clockMs, makeOwner: () => "timed",
    approve: async (_id, _job, checkpoint) => {
      checkpoint("preflight_fetch_started");
      clockMs += 40;
      checkpoint("preflight_fetch_finished");
      checkpoint("ownership_check_started");
      clockMs += 60;
      checkpoint("ownership_check_finished");
      checkpoint("approval_started");
      checkpoint("approval_lease_wait_started");
      clockMs += 15;
      checkpoint("approval_lease_acquired");
      checkpoint("slot_search_started");
      clockMs += 120;
      checkpoint("slot_search_finished");
      checkpoint("schedule_write_started");
      clockMs += 80;
      checkpoint("schedule_write_finished");
      checkpoint("schedule_verify_started");
      clockMs += 30;
      checkpoint("schedule_verify_finished");
      checkpoint("supabase_sync_started");
      clockMs += 20;
      checkpoint("supabase_sync_finished");
      checkpoint("approval_finished");
    },
  });
  const summary = factoryBatchSummary(finished.job);
  const metrics = summary.timing_report.metrics;
  assert.equal(metrics.queue_wait.p50_ms, 250);
  assert.equal(metrics.preflight_airtable_fetch.p50_ms, 40);
  assert.equal(metrics.profile_ownership_check.p50_ms, 60);
  assert.equal(metrics.approval_lease_wait.p50_ms, 15);
  assert.equal(metrics.schedule_slot_selection.p50_ms, 120);
  assert.equal(metrics.airtable_schedule_commit.p50_ms, 80);
  assert.equal(metrics.schedule_verification.p50_ms, 30);
  assert.equal(metrics.canonical_approval.p50_ms, 265);
  assert.equal(metrics.max_single_attempt_processing.p99_ms, 365);
  assert.equal(metrics.enqueue_to_terminal.p95_ms, 615);
  assert.equal(metrics.enqueue_to_terminal.over_target_count, 0);
  assert.equal(summary.timing_report.performance_budget.target_ms, 60000);
  assert.equal(summary.items[0].timing.events.at(-1).state, "approved");
});

test("older Factory batches show missing timings rather than invented history", async () => {
  const bucket = new FakeR2();
  const rid = "factory_latency_legacy_job";
  const job = (await factoryBatchEnqueue(bucket, {
    profileId, requestId: rid, records: records.slice(0, 1),
  })).job;
  delete job.items[0].timeline;
  const summary = factoryBatchSummary(job);
  assert.equal(summary.timing_report.instrumented, 0);
  assert.deepEqual(summary.timing_report.metrics, {});
  assert.equal(summary.items[0].timing, null);
});

test("Factory timing retains distinct attempt history after failed-only retry", async () => {
  const bucket = new FakeR2();
  const rid = "factory_latency_retry_cycle";
  await factoryBatchEnqueue(bucket, {profileId, requestId: rid, records: records.slice(0, 1)});
  let nowMs = 100000;
  const first = await factoryBatchDrain(bucket, {
    profileId,requestId:rid,now:()=>nowMs,makeOwner:()=>"first",
    approve:async ()=>{nowMs+=80;throw new Error("persistent test failure");},
  });
  assert.equal(first.job.items[0].status, "failed");
  const reset = await factoryBatchRetry(bucket,profileId,rid);
  assert.equal(reset.items[0].attempts,0);
  const second = await factoryBatchDrain(bucket,{
    profileId,requestId:rid,now:()=>nowMs+120,
    makeOwner:()=>"second",approve:async ()=>{nowMs+=20;},
  });
  assert.equal(second.job.items[0].total_attempts,2);
  const timeline = factoryBatchSummary(second.job).items[0].timing;
  const starts = timeline.events.filter(x=>x.state==="processing").map(x=>x.attempt);
  assert.deepEqual(starts,[1,2]);
});

test("Factory activity separates actionable, failed, and completed jobs on the server", async () => {
  const bucket = new FakeR2();
  const jobs = ["factory_activity_running_0001", "factory_activity_completed_0002", "factory_activity_failed_0003"];
  for (const requestId of jobs) await factoryBatchEnqueue(bucket, {
    ...opts, requestId, records: [records[0]],
  });
  await factoryBatchDrain(bucket, {profileId, requestId: jobs[1], approve: async () => {}});
  await factoryBatchDrain(bucket, {profileId, requestId: jobs[2],
    approve: async () => { throw Error("requires manual review"); },
    maxItems: 1, now: () => 1700000000000,
  });
  const active = await factoryBatchListGlobal(bucket, {mode: "active"});
  const completed = await factoryBatchListGlobal(bucket, {mode: "completed"});
  assert.deepEqual(new Set(active.jobs.map(j => j.request_id)),
    new Set([jobs[0], jobs[2]]), "failed items must remain actionable");
  assert.deepEqual(completed.jobs.map(j => j.request_id), [jobs[1]]);
  assert.equal(factoryBatchNeedsAttention(active.jobs.find(j => j.request_id === jobs[2])), true);
  assert.equal(factoryBatchNeedsAttention(completed.jobs[0]), false);
  assert.equal(active.jobs.some(j => j.request_id === jobs[1]), false);
  assert.equal(completed.jobs.some(j => j.request_id === jobs[0]), false);
});

test("Factory completed history is page-scoped and does not appear in active list", async () => {
  const bucket = new FakeR2();
  const ids = Array.from({length: 5}, (_,i) => "factory_page_approval_" + String(i).padStart(4, "0"));
  for (const requestId of ids) {
    await factoryBatchEnqueue(bucket, {...opts, requestId, records: [records[0]]});
    await factoryBatchDrain(bucket, {profileId, requestId, approve: async () => {}});
  }
  assert.equal((await factoryBatchListGlobal(bucket,{mode:"active"})).jobs.length,0);
  const first = await factoryBatchListGlobal(bucket,{mode:"completed",limit:2,offset:0});
  const second = await factoryBatchListGlobal(bucket,{mode:"completed",limit:2,offset:2});
  assert.equal(first.jobs.length,2);
  assert.equal(second.jobs.length,2);
  assert.equal(first.has_more,true);
  assert.equal(second.has_more,true);
  assert.equal(new Set([...first.jobs,...second.jobs].map(x=>x.request_id)).size,4);
});

test("profile handoff chooses oldest eligible sibling after first child completes", async () => {
  const bucket = new FakeR2();
  const firstId = "handoff_first_child_20261018";
  const secondId = "handoff_second_child_20261018";
  await factoryBatchEnqueue(bucket, { profileId, requestId: firstId, records: records.slice(0, 6),
    now: "2026-10-18T10:00:00.000Z" });
  await factoryBatchEnqueue(bucket, { profileId, requestId: secondId, records: records.slice(6, 10),
    now: "2026-10-18T10:01:00.000Z" });
  const calls = new Map();
  const approve = async id => { calls.set(id, (calls.get(id) || 0) + 1); };
  const first = await factoryBatchDrain(bucket, { profileId, requestId: firstId, approve,
    maxItems: 25, makeOwner: () => "first-drain" });
  assert.equal(first.job.status, "completed");
  const siblings = await factoryBatchList(bucket, profileId, { limit: 40 });
  const next = factoryBatchCronSelectJobs(siblings.map(job => ({
    profileId, requestId: job.request_id, job,
  })), { maxProfiles: 1 })[0];
  assert.equal(next.requestId, secondId, "completed first child must hand off to pending sibling");
  const second = await factoryBatchDrain(bucket, { profileId, requestId: next.requestId, approve,
    maxItems: 25, makeOwner: () => "second-drain" });
  assert.equal(second.job.status, "completed");
  assert.equal(calls.size, 10);
  assert.ok([...calls.values()].every(n => n === 1));
});

test("Quality Agent measures successful approval silence, not retry heartbeats", () => {
  const now = Date.parse("2026-10-20T12:30:00Z");
  const job = factoryBatchBuild({profileId,requestId:"quality_stall_20261020",records:records.slice(0,2),now:"2026-10-20T12:00:00Z"});
  job.updated_at = "2026-10-20T12:29:00Z";
  job.items[0].status = "approved";
  job.items[0].timeline.push({state:"approved",at:"2026-10-20T12:14:00Z"});
  assert.ok(factoryBatchQualitySignals(job,now).some(s => s.code === "QA-FACTORY-BATCH-STALLED"));
  assert.ok(!factoryBatchQualitySignals(job,now).some(s => s.code === "QA-FACTORY-BATCH-RECOVERY-FAILED"));
  assert.ok(factoryBatchQualitySignals(job,now + 15*60*1000).some(s => s.code === "QA-FACTORY-BATCH-RECOVERY-FAILED"));
  job.items[1].timeline.push({state:"approved",at:"2026-10-20T12:28:00Z"});
  assert.ok(!factoryBatchQualitySignals(job,now).some(s => s.code === "QA-FACTORY-BATCH-STALLED"));
});


test("Factory Quality Agent identifies missing approval source from the durable item error only", () => {
  const job = factoryBatchBuild({
    profileId: "recChicago123456", requestId: "repair_7932_7934_20261021",
    records: [{ id: "recOutput1234567", output_id: 7932 },
              { id: "recOutput1234568", output_id: 7934 }],
  });
  job.status = "failed";
  job.items[0].status = "failed";
  job.items[0].error = "404 Record not found";
  job.items[1].status = "failed";
  job.items[1].error = "Approval rejected because schedule lane remains locked";
  const source = factoryBatchQualitySignals(job).find(
    row => row.code === "QA-FACTORY-APPROVAL-SOURCE-NOT-FOUND",
  );
  assert.ok(source);
  assert.deepEqual(source.output_ids, [7932]);
  assert.equal(source.safe_auto_recover, false);
  assert.match(source.detail, /Reread authoritative Airtable by record ID/);
  assert.ok(factoryBatchQualitySignals(job).some(
    row => row.code === "QA-FACTORY-BATCH-FAILED-ITEM",
  ));
});


test("Deleted Factory approval is reconciled by exact output identity without approval", async () => {
  const bucket = new FakeR2();
  const profileId = "recT2rbKX3MF7cVFU";
  const requestId = "factory_removed_7932_7934";
  const output1 = "recDeletedApproval01";
  const output2 = "recDeletedApproval02";
  await factoryBatchEnqueue(bucket, {
    profileId, requestId,
    records: [{id:output1,output_id:7932},{id:output2,output_id:7934}],
  });
  const key = "studio/state/factory-approvals/v2/jobs/"+profileId+"/"+requestId+".json";
  const payload = bucket.objects.get(key).value;
  payload.status = "failed";
  for (const item of payload.items) { item.status = "failed"; item.error = "404 Record not found"; }
  let verifications = 0;
  const verifyAbsent = async (id, n) => {
    verifications++;
    return (id === output1 && n === 7932) || (id === output2 && n === 7934);
  };
  const opts = {profileId,requestId,verifyAbsent,reason:"Airtable verified removed; original row not restored"};
  const first = await factoryBatchMarkRemoved(bucket,{...opts,recordId:output1,outputId:7932});
  assert.equal(first.items[0].status,"skipped_removed");
  assert.equal(first.items[1].status,"failed");
  assert.equal(factoryBatchCounts(first).skipped_count,1);
  assert.equal(factoryBatchNeedsAttention(first),true);
  assert.match(first.items[0].removed_reason,/Airtable verified/);
  const repeated = await factoryBatchMarkRemoved(bucket,{...opts,recordId:output1,outputId:7932});
  assert.equal(verifications,1);
  assert.equal(repeated.items[0].timeline.length,first.items[0].timeline.length);
  const done = await factoryBatchMarkRemoved(bucket,{...opts,recordId:output2,outputId:7934});
  assert.equal(done.status,"completed");
  assert.equal(factoryBatchNeedsAttention(done),false);
  assert.equal(factoryBatchCounts(done).skipped_count,2);
  assert.equal(factoryBatchCounts(done).approved_count,0);
  assert.equal(factoryBatchCounts(done).failed_count,0);
  assert.equal(factoryBatchSummary(done).can_retry,false);
  const retry = await factoryBatchRetry(bucket,profileId,requestId);
  assert.deepEqual(retry,done); // no removed item is ever re-approved
});

test("Deleted Factory reconciliation refuses ambiguous or unverified records", async () => {
  const bucket = new FakeR2();
  const profileId = "recT2rbKX3MF7cVFU", requestId="factory_no_unsafe_delete";
  const id="recDeletedApproval01";
  await factoryBatchEnqueue(bucket,{profileId,requestId,records:[{id,output_id:7932}]});
  const key="studio/state/factory-approvals/v2/jobs/"+profileId+"/"+requestId+".json";
  const state=bucket.objects.get(key).value;state.status="failed";state.items[0].status="failed";
  const base={profileId,requestId,recordId:id,outputId:7932,reason:"Missing in Airtable"};
  await assert.rejects(() => factoryBatchMarkRemoved(bucket,{...base,verifyAbsent:async()=>false}),/absence not confirmed/);
  await assert.rejects(() => factoryBatchMarkRemoved(bucket,{...base,outputId:7934,verifyAbsent:async()=>true}),/Exact Factory ledger item not found/);
  await assert.rejects(() => factoryBatchMarkRemoved(bucket,{...base,verifyAbsent:async()=>{throw Error("Airtable unavailable")}}),/Airtable unavailable/);
  state.items[0].status="approved";
  await assert.rejects(() => factoryBatchMarkRemoved(bucket,{...base,verifyAbsent:async()=>true}),/Only failed/);
  assert.equal(factoryBatchCounts(state).approved_count,1);
});


test("verified exception routing clears a mixed 42-success Factory batch without changing errors", async () => {
  const bucket = new FakeR2();
  const rid = "factory_verified_exception_42";
  const selected = Array.from({length:44},(_,i)=>({
    id: "recMix" + String(i).padStart(12,"0"), output_id:9000+i,
    platform:"Instagram",format:"Reel",
  }));
  await factoryBatchEnqueue(bucket,{profileId,requestId:rid,records:selected});
  const key = "studio/state/factory-approvals/v2/jobs/"+profileId+"/"+rid+".json";
  const stored = bucket.objects.get(key).value;
  stored.status = "completed";
  stored.items.forEach((item,i)=>{
    item.status = i < 42 ? "approved" : "failed";
    item.error = i < 42 ? null : "Nontransient scheduling conflict";
  });
  assert.equal(factoryBatchNeedsAttention(stored),true);
  let calls=0;
  const verifyRouted=async proof=>{
    calls++;
    assert.ok([9042,9043].includes(proof.outputId));
    assert.match(proof.error,/Nontransient/);
    return true;
  };
  const values={profileId,requestId:rid,reason:"Confirmed persisted Quality Agent exception",verifyRouted};
  const first=await factoryBatchMarkExceptionRouted(bucket,{
    ...values,recordId:selected[42].id,outputId:9042,eventKey:"factory-failed:event-9042",
  });
  assert.equal(factoryBatchNeedsAttention(first),true);
  const final=await factoryBatchMarkExceptionRouted(bucket,{
    ...values,recordId:selected[43].id,outputId:9043,eventKey:"factory-failed:event-9043",
  });
  assert.equal(factoryBatchNeedsAttention(final),false);
  assert.equal(factoryBatchCounts(final).approved_count,42);
  assert.equal(factoryBatchCounts(final).failed_count,2);
  assert.equal(final.items[42].status,"failed");
  assert.equal(final.items[42].error,"Nontransient scheduling conflict");
  assert.equal(factoryBatchSummary(final).can_retry,false);
  assert.equal(factoryBatchFailureRouted(final.items[42]),true);
  assert.equal((await factoryBatchListGlobal(bucket,{mode:"active"})).jobs.length,0);
  assert.equal((await factoryBatchListGlobal(bucket,{mode:"completed"})).jobs.length,1);
  const again=await factoryBatchMarkExceptionRouted(bucket,{
    ...values,recordId:selected[42].id,outputId:9042,eventKey:"factory-failed:event-9042",
  });
  assert.equal(calls,2,"idempotent replay must not issue another external audit check");
  assert.equal(again.items[42].timeline.length,first.items[42].timeline.length);
  assert.deepEqual(await factoryBatchRetry(bucket,profileId,rid),again,
    "resolved exceptions cannot be accidentally re-approved");
});

test("exception routing rejects absent, ambiguous, mismatched and unverified audit evidence", async()=>{
  const bucket=new FakeR2();
  const rid="factory_exception_failclosed_1";
  await factoryBatchEnqueue(bucket,{profileId,requestId:rid,records:[records[0]]});
  const key="studio/state/factory-approvals/v2/jobs/"+profileId+"/"+rid+".json";
  const stored=bucket.objects.get(key).value;
  stored.status="failed";
  stored.items[0].status="failed";
  stored.items[0].error="persistent error";
  const args={profileId,requestId:rid,recordId:records[0].id,
    outputId:records[0].output_id,eventKey:"factory-failed:case-1",reason:"Escalated"};
  await assert.rejects(()=>factoryBatchMarkExceptionRouted(bucket,{
    ...args,verifyRouted:async()=>false,
  }),/not verified/);
  await assert.rejects(()=>factoryBatchMarkExceptionRouted(bucket,{
    ...args,outputId:999999,verifyRouted:async()=>true,
  }),/not found/);
  await assert.rejects(()=>factoryBatchMarkExceptionRouted(bucket,{
    ...args,verifyRouted:async()=>{throw Error("Airtable unavailable");},
  }),/Airtable unavailable/);
  assert.equal(factoryBatchNeedsAttention(stored),true);
  assert.equal(factoryBatchFailureRouted(stored.items[0]),false);
  assert.equal(factoryBatchRetryEligible(stored.items[0]),true);
});

test("manual Retry Failed is a single bounded attempt with original error history",async()=>{
  const bucket=new FakeR2(),rid="factory_single_recovery_once";
  await factoryBatchEnqueue(bucket,{profileId,requestId:rid,records:[records[0]]});
  const key="studio/state/factory-approvals/v2/jobs/"+profileId+"/"+rid+".json";
  const stored=bucket.objects.get(key).value;
  stored.status="failed";stored.items[0].status="failed";stored.items[0].error="original-failure";
  const retry=await factoryBatchRetry(bucket,profileId,rid);
  assert.equal(retry.items[0].manual_retry_count,1);
  assert.equal(retry.items[0].failure_history[0].error,"original-failure");
  const secondFailure=await factoryBatchDrain(bucket,{profileId,requestId:rid,
    approve:async()=>{throw Error("unfixed failure")},maxItems:1});
  assert.equal(secondFailure.job.status,"failed");
  assert.equal(factoryBatchRetryEligible(secondFailure.job.items[0]),false);
  const noRetry=await factoryBatchRetry(bucket,profileId,rid);
  assert.deepEqual(noRetry,secondFailure.job);
  assert.equal(noRetry.items[0].failure_history[0].error,"original-failure");
});


test("automatic transient failure recovery permits one bounded retry, then escalates",async()=>{
  const bucket=new FakeR2(),rid="factory_auto_retry_once_1";
  await factoryBatchEnqueue(bucket,{profileId,requestId:rid,records:[records[0]]});
  const key="studio/state/factory-approvals/v2/jobs/"+profileId+"/"+rid+".json";
  const stored=bucket.objects.get(key).value;
  stored.status="failed";stored.items[0].status="failed";
  stored.items[0].error="503 temporarily unavailable";
  stored.items[0].total_attempts=5;
  const first=await factoryBatchRetryTransientOnce(bucket,{profileId,requestId:rid,
    recordId:records[0].id,outputId:records[0].output_id});
  assert.equal(first.status,"queued");
  assert.equal(first.items[0].auto_retry_count,1);
  assert.equal(first.items[0].failure_history[0].error,"503 temporarily unavailable");
  let attempted=0;
  const failedAgain=await factoryBatchDrain(bucket,{profileId,requestId:rid,
    approve:async()=>{attempted++;throw Error("503 temporarily unavailable");},maxItems:1});
  assert.equal(attempted,1);
  assert.equal(failedAgain.job.items[0].status,"failed",
    "second transient error must not launch five additional retries");
  const reread=await factoryBatchRetryTransientOnce(bucket,{profileId,requestId:rid,
    recordId:records[0].id,outputId:records[0].output_id});
  assert.deepEqual(reread,failedAgain.job);
  assert.equal(factoryBatchNeedsAttention(reread),true,
    "not yet routed to recovery history, so error remains actionable");
});


test("independently confirmed Airtable approval corrects failed bookkeeping without re-approving",async()=>{
  const bucket = new FakeR2();
  const rid="factory_approved_readback_1";
  await factoryBatchEnqueue(bucket,{profileId,requestId:rid,records:[records[0]]});
  const key="studio/state/factory-approvals/v2/jobs/"+profileId+"/"+rid+".json";
  const stored=bucket.objects.get(key).value;
  stored.status="failed";stored.items[0].status="failed";
  stored.items[0].error="Airtable write confirmed, postflight timed out";
  let checks=0;
  const opts={profileId,requestId:rid,recordId:records[0].id,
    outputId:records[0].output_id,verifySatisfied:async()=>{checks++;return true;}};
  const repaired=await factoryBatchMarkAlreadySatisfied(bucket,opts);
  assert.equal(repaired.items[0].status,"already_satisfied");
  assert.equal(repaired.items[0].previous_failure_error,"Airtable write confirmed, postflight timed out");
  assert.equal(repaired.status,"completed");
  assert.equal(factoryBatchNeedsAttention(repaired),false);
  const repeated=await factoryBatchMarkAlreadySatisfied(bucket,opts);
  assert.equal(checks,1,"replay must not call Airtable or approval again");
  assert.deepEqual(repeated,repaired);
  assert.equal((await factoryBatchListGlobal(bucket,{mode:"completed"})).jobs.length,1);
});
test("failed bookkeeping stays active when authoritative approval cannot be confirmed",async()=>{
  const bucket=new FakeR2(),rid="factory_approved_unverified_1";
  await factoryBatchEnqueue(bucket,{profileId,requestId:rid,records:[records[0]]});
  const key="studio/state/factory-approvals/v2/jobs/"+profileId+"/"+rid+".json";
  const item=bucket.objects.get(key).value;
  item.status="failed";item.items[0].status="failed";
  await assert.rejects(()=>factoryBatchMarkAlreadySatisfied(bucket,{
    profileId,requestId:rid,recordId:records[0].id,outputId:records[0].output_id,
    verifySatisfied:async()=>false,
  }),/not verified/);
  assert.equal(factoryBatchNeedsAttention(item),true);
});
