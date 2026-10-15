import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  SCHEDULE_REGEN_JOBS_SETTING,
  SCHEDULE_REGEN_STATUS,
  buildScheduleRegenCombinations,
  createScheduleRegenJob,
  scheduleRegenJobCounts,
  scheduleRegenProgressMessage,
  summarizeScheduleRegenJob,
} from "./schedule-regen-batch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("combinations sort platform → output type → profile and start Pending", () => {
  const combos = buildScheduleRegenCombinations({
    profiles: [
      { id: "recB", name: "Chicago" },
      { id: "recA", name: "Atlanta" },
    ],
    platforms: ["Instagram", "Facebook"],
    outputTypes: ["Story", "Reel"],
  });
  assert.deepEqual(
    combos.map((row) => `${row.platform}/${row.output_type}/${row.profile}`),
    [
      "Facebook/Reel/Atlanta",
      "Facebook/Reel/Chicago",
      "Facebook/Story/Atlanta",
      "Facebook/Story/Chicago",
      "Instagram/Reel/Atlanta",
      "Instagram/Reel/Chicago",
      "Instagram/Story/Atlanta",
      "Instagram/Story/Chicago",
    ],
  );
  assert.ok(combos.every((row) => row.status === SCHEDULE_REGEN_STATUS.PENDING));
});

test("progress counts report actual combination completion", () => {
  const job = createScheduleRegenJob({
    profiles: [{ id: "rec1", name: "Chicago" }],
    platforms: ["Facebook", "Instagram"],
    outputTypes: ["Reel", "Story"],
    horizonDays: 30,
    eligibleCount: 12,
  });
  job.combinations[0].status = SCHEDULE_REGEN_STATUS.COMPLETED;
  job.combinations[0].rescheduled = 4;
  job.combinations[1].status = SCHEDULE_REGEN_STATUS.PROCESSING;
  job.combinations[1].total_posts = 10;
  job.combinations[1].completed_posts = 5;
  job.status = "running";
  const counts = scheduleRegenJobCounts(job);
  assert.equal(counts.total_combinations, 4);
  assert.equal(counts.completed_combinations, 1);
  assert.equal(counts.done_combinations, 1);
  assert.equal(counts.overall_percent, 25);
  assert.equal(counts.active_percent, 50);
  assert.equal(counts.current_platform, "Facebook");
  assert.equal(counts.current_output_type, "Story");
  assert.match(scheduleRegenProgressMessage(job), /1 of 4/);
  const summary = summarizeScheduleRegenJob(job);
  assert.equal(summary.summary.posts_rescheduled, 4);
});

test("failed combination stays Failed and is counted separately", () => {
  const job = createScheduleRegenJob({
    profiles: [{ id: "rec1", name: "Chicago" }],
    platforms: ["TikTok"],
    outputTypes: ["Video"],
    horizonDays: 14,
  });
  job.combinations[0].status = SCHEDULE_REGEN_STATUS.FAILED;
  job.combinations[0].error = "Capacity failure";
  job.status = "failed";
  const counts = scheduleRegenJobCounts(job);
  assert.equal(counts.failed_combinations, 1);
  assert.equal(counts.completed_combinations, 0);
  assert.match(scheduleRegenProgressMessage(job), /failed/i);
});

test("Worker and Pipeline wire durable schedule regeneration", () => {
  assert.equal(SCHEDULE_REGEN_JOBS_SETTING, "SCHEDULE_REGEN_JOBS_V1");
  assert.match(worker, /isScheduleRegenRoute/);
  assert.match(worker, /async function startScheduleRegenJob/);
  assert.match(worker, /async function studioProcessScheduleRegenJobSlice/);
  assert.match(worker, /SCHEDULE_REGEN_STATUS\.PROCESSING/);
  assert.match(worker, /maeScheduleNextSlot/);
  assert.match(worker, /studioScheduleRegenCandidateFormula/);
  assert.match(worker, /excludeIds:\s*eligible\.map/);
  assert.match(worker, /studioOccupiedSchedulesOrEmpty/);
  assert.match(app, /\/api\/outputs\/schedule-regen/);
  assert.match(app, /Will be scheduled on approval/);
  assert.match(app, /operationsScheduleHorizonDays/);
  assert.match(app, /MAE-first, balanced-overflow/);
});
