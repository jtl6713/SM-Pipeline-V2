import test from "node:test";
import assert from "node:assert/strict";
import {
  factoryBatchCounts,
  factoryBatchNeedsAttention,
  factoryBatchCronSelectJobs,
  factoryBatchQualitySignals,
  factoryBatchSummary,
} from "./factory-approval-queue.mjs";

test("redundant submission can be completed without asserting that any output was removed", () => {
  const job = {
    id: "fb_duplicate", profile_id: "recF7UAn0LkMZZrWZ",
    request_id: "duplicate_request_20261030",
    created_at: "2026-10-30T14:16:49.497Z",
    updated_at: "2026-10-30T14:24:00.000Z",
    status: "completed",
    items: [
      {id:"rec1iMqQsYRbkypOg",output_id:9380,status:"superseded_duplicate"},
      {id:"rec4D0lWietBvtbEh",output_id:9377,status:"already_satisfied"},
      {id:"recJiWbghQ0dfkr4u",output_id:9378,status:"approved"},
    ],
  };
  const counts = factoryBatchCounts(job);
  assert.deepEqual(counts, {total:3,approved_count:1,skipped_count:2,
    failed_count:0,pending_count:0,done_count:3});
  assert.equal(factoryBatchNeedsAttention(job),false);
  assert.deepEqual(factoryBatchQualitySignals(job),[]);
  assert.equal(factoryBatchSummary(job).items[0].status,"superseded_duplicate");
  assert.deepEqual(factoryBatchCronSelectJobs([{profileId:job.profile_id,requestId:job.request_id,job}]),[]);
});

test("original matching batch retains its pending approvals and remains actionable", () => {
  const original = {
    id:"fb_primary",profile_id:"recF7UAn0LkMZZrWZ",request_id:"primary_request_20261030",
    created_at:"2026-10-30T14:16:07.738Z",updated_at:"2026-10-30T14:24:00.000Z",
    status:"running",items:[
      {id:"rec1iMqQsYRbkypOg",output_id:9380,status:"pending",next_attempt_ms:0},
      {id:"recJiWbghQ0dfkr4u",output_id:9378,status:"approved"},
    ],
  };
  assert.equal(factoryBatchCounts(original).pending_count,1);
  assert.equal(factoryBatchNeedsAttention(original),true);
  assert.equal(factoryBatchCronSelectJobs([{profileId:original.profile_id,
    requestId:original.request_id,job:original}],{nowMs:Date.parse("2026-10-30T14:25:00Z")}).length,1);
});
