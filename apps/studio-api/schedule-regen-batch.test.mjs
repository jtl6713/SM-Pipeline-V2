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
  canonicalizeScheduleRegenPlatform,
  createScheduleRegenJob,
  reclaimStaleScheduleRegenJob,
  scheduleRegenCandidateFilterFormula,
  scheduleRegenJobCounts,
  scheduleRegenJobIsStale,
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

test("candidate filter includes unscheduled and future rows in the selected profile/lane", () => {
  const formula = scheduleRegenCandidateFilterFormula({
    nowMs: Date.parse("2026-10-15T18:00:00Z"),
    horizonDays: 30,
    profileFormula: 'FIND("recCHI", ARRAYJOIN({Content_Profile})&"")',
    platform: "Instagram",
    outputType: "Reel",
  });
  assert.match(formula, /recCHI/);
  assert.ok(formula.includes('LOWER({Platform})="instagram"'));
  assert.match(formula, /Studio_Output_Type.*Reel/);
  assert.match(formula, /Scheduled_Post_Date.*BLANK/);
  assert.match(formula, /YouTube_Scheduled_Publish_At.*BLANK/);
  assert.match(formula, /Studio_Scheduled_At.*BLANK/);
  assert.match(formula, /IS_AFTER/);
  assert.match(formula, /IS_BEFORE/);
  assert.match(formula, /Published_At.*BLANK/);
});

test("lowercase Pipeline calendar platforms match Airtable Platform values", () => {
  assert.equal(canonicalizeScheduleRegenPlatform("instagram"), "Instagram");
  assert.equal(canonicalizeScheduleRegenPlatform("FACEBOOK"), "Facebook");
  assert.equal(canonicalizeScheduleRegenPlatform("tiktok"), "TikTok");
  assert.equal(canonicalizeScheduleRegenPlatform("youtube"), "YouTube");
  const formula = scheduleRegenCandidateFilterFormula({
    platform: "instagram",
    outputType: "Reel",
    nowMs: Date.parse("2026-10-16T02:00:00Z"),
    horizonDays: 30,
  });
  assert.ok(formula.includes('LOWER({Platform})="instagram"'));
  assert.doesNotMatch(formula, /\{Platform\}="instagram"/);
});

test("stale Processing jobs can be reclaimed so regenerate is not stuck forever", () => {
  const job = createScheduleRegenJob({
    profiles: [{ id: "rec1", name: "Chicago" }],
    platforms: ["Instagram"],
    outputTypes: ["Reel", "Story"],
    horizonDays: 30,
  });
  job.status = "running";
  job.combinations[0].status = SCHEDULE_REGEN_STATUS.PROCESSING;
  job.updated_at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(scheduleRegenJobIsStale(job), true);
  const reclaimed = reclaimStaleScheduleRegenJob(job);
  assert.equal(reclaimed.combinations[0].status, SCHEDULE_REGEN_STATUS.PENDING);
  assert.equal(reclaimed.cursor, 0);
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
  assert.match(worker, /studioLoadOccupiedScheduleRows/);
  assert.match(worker, /platformProtectedTimes/);
  assert.match(worker, /unsettledPlatformTypes/);
  assert.match(worker, /platformOccupiedMs:\s*reservedPlatform/);
  assert.match(worker, /schedule-regen-jobs-v1\.json/);
  assert.match(worker, /Seed that Setting_Name row in Airtable/);
  assert.match(worker, /display names \("Miami - Miami"\)/);
  assert.match(app, /\/api\/outputs\/schedule-regen/);
  assert.match(app, /pathname === "\/api\/outputs\/schedule-regen"/);
  assert.match(app, /queuePipelineScheduleRegenPoll/);
  assert.match(app, /loadPipelineScheduleGridWindow/);
  assert.match(app, /Will be scheduled on approval/);
  assert.match(app, /operationsScheduleHorizonDays/);
  assert.match(app, /MAE-first, balanced-overflow/);
});

test("occupied profile match accepts Content_Profile lookup display names", async () => {
  const { studioOccupiedRowMatchesProfile } = await import("./worker-functions-01.mjs");
  const profile = { id: "recpNlNn6U6eq0M9r", fields: { Profile_Name: "Miami" } };
  assert.equal(
    studioOccupiedRowMatchesProfile({ fields: { Content_Profile: ["Miami - Miami"] } }, profile),
    true,
  );
  assert.equal(
    studioOccupiedRowMatchesProfile({ fields: { Content_Profile: ["recpNlNn6U6eq0M9r"] } }, profile),
    true,
  );
  assert.equal(
    studioOccupiedRowMatchesProfile({ fields: { Content_Profile: ["Chicago"] } }, profile),
    false,
  );
});
