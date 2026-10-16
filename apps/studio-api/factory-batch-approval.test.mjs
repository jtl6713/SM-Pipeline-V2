import test from "node:test";
import assert from "node:assert/strict";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import {
  buildApproveAllJob, summarizeApproveAllJob, approveAllJobCounts,
  resetFailedApproveAllItems, nextPendingApproveAllItems,
} from "./approve-all-batch.mjs";

const worker = readStudioWorkerSource();

test("Factory batch tracks all 20 items without a browser-owned job state", () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    id: `recBatch${i + 1000}`, output_id: i + 1000,
    platform: "Instagram", format: i % 2 ? "Story" : "Reel",
  }));
  const job = buildApproveAllJob({
    jobId: "aj_browser_close", requestId: "factory_browser_close_20",
    profileId: "recProfile123", records,
    stamp: "2026-10-16T12:00:00Z", note: "factory",
  });
  assert.equal(job.items.length, 20);
  assert.equal(job.request_id, "factory_browser_close_20");
  assert.equal(approveAllJobCounts(job).pending_count, 20);
  job.items[0].status = "approved";
  job.items[1].status = "failed";
  job.items[1].error = "upstream rejected";
  job.items[2].status = "skipped";
  const status = summarizeApproveAllJob(job);
  assert.equal(status.total, 20);
  assert.equal(status.pending_count, 17);
  assert.equal(status.failed_count, 1);
  assert.equal(status.approved_count + status.failed_count + status.skipped_count + status.pending_count, 20);
  assert.deepEqual(status.items.map(x => x.id), records.map(x => x.id));
  assert.equal(status.items[1].error, "upstream rejected");
  const retried = resetFailedApproveAllItems(job, "2026-10-16T12:01:00Z");
  assert.equal(retried.items[0].status, "approved");
  assert.equal(retried.items[1].status, "pending");
  assert.equal(retried.items[2].status, "skipped");
  assert.equal(nextPendingApproveAllItems(retried, 8).length, 8);
});

test("Factory status source restores last terminal job and rejects unnecessary retries", () => {
  assert.match(worker, /Factory must still show the latest completed batch/);
  assert.match(worker, /requestId.*entry\?\.request_id|entry\?\.request_id === requestId/s);
  assert.match(worker, /existing\.status === "queued" \|\| existing\.status === "running"/);
  assert.match(worker, /result\.approvedThisInvoke > 0/);
  assert.match(worker, /studioResumeApproveAllJobs\(env, ctx\)/);
  assert.match(worker, /approveOutputRecordForPublishing\(env, record/);
});

test("new Factory batch POST is default-off until explicit rollout flag", () => {
  assert.match(worker, /FACTORY_BATCH_APPROVALS_ENABLED/);
  assert.match(worker, /Factory batch approvals are not enabled/);
  const route = worker.indexOf("async function factoryBatchSubmitRoute(");
  const flag = worker.indexOf("FACTORY_BATCH_APPROVALS_ENABLED", route);
  const parse = worker.indexOf("request.json()", route);
  assert.ok(route >= 0 && flag > route && parse > flag,
    "Feature gate must reject writes before request processing");
  const status = worker.indexOf("async function factoryBatchStatusRoute(");
  assert.ok(status >= 0 && status < route,
    "Status endpoint must remain independently readable");
});
