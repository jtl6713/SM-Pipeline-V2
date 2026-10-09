import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVE_ALL_BATCH_SIZE,
  APPROVE_ALL_JOBS_SETTING,
  approveAllJobCounts,
  approveAllProgressMessage,
  buildApproveAllJob,
  finalizeApproveAllJobStatus,
  nextPendingApproveAllItems,
  parseApproveAllJobStore,
  pruneApproveAllJobStore,
  resetFailedApproveAllItems,
  summarizeApproveAllJob,
} from "./approve-all-batch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(__dirname, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("approve-all batch helpers track progress and retry failed only", () => {
  const job = buildApproveAllJob({
    jobId: "aj_test",
    profileId: "recProfile1",
    note: "test",
    schedules: { recA: "2026-10-10T12:00:00.000Z" },
    records: [
      { id: "recA", output_id: 1, platform: "Instagram", format: "Reel" },
      { id: "recB", output_id: 2, platform: "TikTok", format: "Video Draft" },
      { id: "recC", output_id: 3, platform: "YouTube", format: "Short" },
    ],
    stamp: "2026-10-09T00:00:00.000Z",
  });
  assert.equal(job.status, "queued");
  assert.equal(approveAllJobCounts(job).pending_count, 3);
  assert.equal(nextPendingApproveAllItems(job, 2).length, 2);

  job.items[0].status = "approved";
  job.items[1].status = "failed";
  job.items[1].error = "Airtable 422";
  job.status = "running";
  assert.match(approveAllProgressMessage(job), /1 of 3 approved · 1 failed/);

  const finalized = finalizeApproveAllJobStatus(job, "2026-10-09T00:01:00.000Z");
  assert.equal(finalized.status, "running");
  job.items[2].status = "approved";
  const done = finalizeApproveAllJobStatus(job, "2026-10-09T00:02:00.000Z");
  assert.equal(done.status, "completed");
  assert.equal(summarizeApproveAllJob(done).can_retry, true);

  const retried = resetFailedApproveAllItems(done, "2026-10-09T00:03:00.000Z");
  assert.equal(retried.items[1].status, "pending");
  assert.equal(retried.items[0].status, "approved");
  assert.equal(retried.items[2].status, "approved");
  assert.equal(approveAllJobCounts(retried).pending_count, 1);
});

test("approve-all job store prunes terminal jobs and active map", () => {
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const store = pruneApproveAllJobStore({
    jobs: {
      aj_old: { id: "aj_old", status: "completed", updated_at: old, items: [] },
      aj_live: { id: "aj_live", status: "running", updated_at: new Date().toISOString(), items: [] },
    },
    active_by_profile: { recP: "aj_old", recQ: "aj_live" },
  });
  assert.equal(Boolean(store.jobs.aj_old), false);
  assert.equal(Boolean(store.jobs.aj_live), true);
  assert.equal(store.active_by_profile.recP, undefined);
  assert.equal(store.active_by_profile.recQ, "aj_live");
  assert.deepEqual(parseApproveAllJobStore("not-json").jobs, {});
  assert.equal(APPROVE_ALL_BATCH_SIZE, 3);
  assert.equal(APPROVE_ALL_JOBS_SETTING, "APPROVE_ALL_JOBS_V1");
});

test("worker exposes durable approve-all batch routes and cron resume", () => {
  assert.match(worker, /from "\.\/approve-all-batch\.mjs"/);
  assert.match(worker, /studio_approve_all_batch_v1:\s*true/);
  assert.match(worker, /0\.10\.485-approve-all-batch/);
  assert.match(worker, /async function studioProcessApproveAllJobSlice/);
  assert.match(worker, /async function studioResumeApproveAllJobs/);
  assert.match(worker, /studioResumeApproveAllJobs\(env, ctx\)/);
  assert.match(worker, /action === "retry"/);
  assert.match(worker, /getApproveAllJobStatus/);
  assert.match(worker, /accepted: true/);
  assert.match(worker, /studioOccupiedSchedulesOrEmpty/);
});

test("Studio UI starts Approve All as a background job and polls progress", () => {
  assert.match(app, /item4-0\.6\.542-approve-all-batch/);
  assert.match(app, /startPipelineApproveAllJobWatch/);
  assert.match(app, /pollPipelineApproveAllJob/);
  assert.match(app, /Retry failed/);
  assert.match(app, /action: "retry"/);
  assert.match(app, /timeoutMs: 30000/);
  assert.match(app, /Approve All started/);
});
