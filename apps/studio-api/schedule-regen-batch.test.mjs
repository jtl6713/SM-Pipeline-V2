import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  SCHEDULE_REGEN_JOBS_SETTING,
  SCHEDULE_REGEN_STATUS,
  SCHEDULE_REGEN_POSTS_PER_SLICE,
  SCHEDULE_REGEN_PLAN_SLOTS_PER_SLICE,
  SCHEDULE_REGEN_MAX_SLICES_PER_DRAIN,
  SCHEDULE_REGEN_LIVE_LEASE_MS,
  SCHEDULE_REGEN_DRAIN_LEASE_MS,
  SCHEDULE_REGEN_DRAIN_LEASE_HEARTBEAT_MS,
  scheduleRegenDrainLeaseIsLive,
  buildScheduleRegenCombinations,
  canonicalizeScheduleRegenPlatform,
  createScheduleRegenJob,
  reclaimStaleScheduleRegenJob,
  scheduleRegenComboIsEmptyLane,
  canonicalizeScheduleRegenOutputType,
  scheduleRegenCandidateFilterFormula,
  scheduleRegenComboHasRemainingPlan,
  scheduleRegenComboPlanComplete,
  scheduleRegenComboNeedsPlanning,
  scheduleRegenComboNeedsWork,
  scheduleRegenComboIsOrphanProcessing,
  slimScheduleRegenCombination,
  scheduleRegenJobCounts,
  scheduleRegenJobIsStale,
  scheduleRegenProgressMessage,
  summarizeScheduleRegenJob,
  preferScheduleRegenJobStore,
  scheduleRegenStoreActivityScore,
  emptyScheduleRegenJobStore,
  SCHEDULE_REGEN_MAX_TERMINAL_JOBS,
} from "./schedule-regen-batch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();
const batch = fs.readFileSync(path.join(here, "schedule-regen-batch.mjs"), "utf8");
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
  job.combinations[0].total_posts = 2;
  job.combinations[0].plan = [{ id: "recA", iso: "2026-10-20T12:00:00.000Z" }, { id: "recB", iso: "2026-10-20T12:30:00.000Z" }];
  job.combinations[0].completed_posts = 1;
  job.updated_at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(scheduleRegenJobIsStale(job), true);
  assert.equal(scheduleRegenComboPlanComplete(job.combinations[0]), true);
  assert.equal(scheduleRegenComboHasRemainingPlan(job.combinations[0]), true);
  assert.equal(scheduleRegenComboNeedsWork(job.combinations[0]), true);
  assert.equal(scheduleRegenComboIsOrphanProcessing(job.combinations[0]), false);
  // True orphan = Processing crash before scan checkpoint (no eligible_ids key).
  // eligible_ids:[] is a finished empty lane, not an orphan.
  const orphan = {
    ...job.combinations[0],
    plan: [],
    completed_posts: 0,
    total_posts: 0,
  };
  delete orphan.eligible_ids;
  assert.equal(scheduleRegenComboIsOrphanProcessing(orphan), true);
  assert.equal(scheduleRegenComboNeedsWork(orphan), true);
  const checkpoint = {
    ...orphan,
    total_posts: 57,
    eligible_ids: Array.from({ length: 57 }, (_, i) => `rec${i}`),
    plan: [{ id: "rec0", iso: "2026-10-20T12:00:00.000Z" }],
  };
  assert.equal(scheduleRegenComboNeedsPlanning(checkpoint), true);
  assert.equal(scheduleRegenComboIsOrphanProcessing(checkpoint), false);
  const reclaimed = reclaimStaleScheduleRegenJob(job);
  assert.equal(reclaimed.combinations[0].status, SCHEDULE_REGEN_STATUS.PENDING);
  assert.equal(reclaimed.combinations[0].completed_posts, 1);
  assert.equal(reclaimed.combinations[0].plan.length, 2);
  assert.equal(reclaimed.cursor, 0);
  assert.ok(SCHEDULE_REGEN_POSTS_PER_SLICE >= 10);
  assert.ok(SCHEDULE_REGEN_LIVE_LEASE_MS >= 10_000);
  assert.ok(SCHEDULE_REGEN_PLAN_SLOTS_PER_SLICE >= 15);
  assert.ok(SCHEDULE_REGEN_MAX_SLICES_PER_DRAIN >= 8);
  assert.equal(SCHEDULE_REGEN_MAX_TERMINAL_JOBS, 1);
  const slimed = slimScheduleRegenCombination({
    status: SCHEDULE_REGEN_STATUS.COMPLETED,
    plan: [{ id: "x" }],
    eligible_ids: ["x"],
    lane_reserved_ms: [1],
    platform_reserved_ms: [1],
    placed_isos: ["2026-10-20T12:00:00.000Z"],
  }, { keepPlacedIsos: true });
  assert.deepEqual(slimed.plan, []);
  assert.deepEqual(slimed.eligible_ids, []);
  assert.equal(slimed.placed_isos.length, 1);
});


test("empty lane with 0 eligible completes and is not an orphan spin", () => {
  const empty = {
    status: SCHEDULE_REGEN_STATUS.PROCESSING,
    total_posts: 0,
    completed_posts: 0,
    plan: [],
    eligible_ids: [],
  };
  assert.equal(scheduleRegenComboIsEmptyLane(empty), true);
  assert.equal(scheduleRegenComboPlanComplete(empty), true);
  assert.equal(scheduleRegenComboNeedsPlanning(empty), false);
  assert.equal(scheduleRegenComboIsOrphanProcessing(empty), false);
  // Still needs a drain slice so the Worker marks Completed (unstick 0/0).
  assert.equal(scheduleRegenComboNeedsWork(empty), true);
  assert.equal(canonicalizeScheduleRegenOutputType("Video Draft"), "");
  assert.equal(canonicalizeScheduleRegenOutputType("Reel"), "Reel");
  assert.equal(canonicalizeScheduleRegenOutputType("multi-image post"), "Multi-Image Post");
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

test("orphan Processing never wipes mid-apply plan or completed_posts", () => {
  assert.equal(scheduleRegenComboIsOrphanProcessing({
    status: "Processing",
    completed_posts: 15,
    total_posts: 52,
    plan: [{ id: "rec1", iso: "2026-10-17T12:00:00.000Z" }],
  }), false);
  assert.equal(scheduleRegenComboIsOrphanProcessing({
    status: "Processing",
    completed_posts: 0,
    total_posts: 52,
    plan: [{ id: "rec1", iso: "2026-10-17T12:00:00.000Z" }],
  }), false);
  assert.equal(scheduleRegenComboIsOrphanProcessing({
    status: "Processing",
    completed_posts: 0,
    total_posts: 0,
  }), true);
});

test("scheduleRegenDrainLeaseIsLive ignores zombie drain_until without a fresh heartbeat", () => {
  const now = Date.parse("2026-10-16T06:00:00.000Z");
  assert.equal(SCHEDULE_REGEN_DRAIN_LEASE_MS >= 60_000, true);
  assert.equal(SCHEDULE_REGEN_DRAIN_LEASE_HEARTBEAT_MS <= 30_000, true);
  assert.equal(scheduleRegenDrainLeaseIsLive({
    drain_until: "2026-10-16T06:01:30.000Z",
    updated_at: "2026-10-16T05:59:55.000Z",
  }, now), true);
  // Lease still in the future but updated_at is stale → zombie, do not block.
  assert.equal(scheduleRegenDrainLeaseIsLive({
    drain_until: "2026-10-16T06:01:30.000Z",
    updated_at: "2026-10-16T05:58:00.000Z",
  }, now), false);
  assert.equal(scheduleRegenDrainLeaseIsLive({
    drain_until: "2026-10-16T05:59:00.000Z",
    updated_at: "2026-10-16T05:59:55.000Z",
  }, now), false);
});

test("preferScheduleRegenJobStore does not let empty Airtable seed shadow R2 active jobs", () => {
  const emptySeed = emptyScheduleRegenJobStore();
  const r2Active = {
    schema_version: 1,
    jobs: {
      sr_1: {
        id: "sr_1",
        status: "queued",
        updated_at: "2026-10-16T03:30:00.000Z",
        combinations: [],
      },
    },
    active_by_scope: { recpNlNn6U6eq0M9r: "sr_1" },
  };
  assert.ok(scheduleRegenStoreActivityScore(r2Active) > scheduleRegenStoreActivityScore(emptySeed));
  const picked = preferScheduleRegenJobStore(r2Active, emptySeed);
  assert.equal(picked.jobs.sr_1.id, "sr_1");
  assert.equal(picked.active_by_scope.recpNlNn6U6eq0M9r, "sr_1");
  // Tie / both empty → primary (R2).
  assert.deepEqual(preferScheduleRegenJobStore(emptySeed, emptySeed), emptySeed);
});

test("Worker and Pipeline wire durable schedule regeneration", () => {
  assert.equal(SCHEDULE_REGEN_JOBS_SETTING, "SCHEDULE_REGEN_JOBS_V1");
  assert.match(worker, /isScheduleRegenRoute/);
  assert.match(worker, /const isScheduleRegenWrite = isScheduleRegenRoute && request\.method === "POST"/);
  assert.match(worker, /isScheduleRegenWrite \|/);
  assert.match(worker, /const isScheduleSettingsWrite = isScheduleSettingsRoute &&/);
  assert.match(worker, /isScheduleSettingsWrite \|/);
  assert.match(worker, /async function startScheduleRegenJob/);
  assert.match(worker, /async function studioProcessScheduleRegenJobSlice/);
  assert.match(worker, /SCHEDULE_REGEN_STATUS\.PROCESSING/);
  assert.match(worker, /maeScheduleNextSlot/);
  assert.match(worker, /studioLoadOccupiedScheduleRows/);
  assert.match(worker, /platformProtectedTimes/);
  assert.match(worker, /eligible_ids/);
  assert.match(worker, /Checkpoint before MAE/);
  assert.match(worker, /SCHEDULE_REGEN_PLAN_SLOTS_PER_SLICE/);
  assert.match(worker, /platformOccupiedMs:\s*reservedPlatform/);
  assert.match(worker, /schedule-regen-jobs-v1\.json/);
  assert.match(worker, /preferScheduleRegenJobStore/);
  assert.match(worker, /did not persist/);
  assert.match(worker, /display names \("Miami - Miami"\)/);
  assert.match(worker, /forceFresh/);
  assert.match(worker, /fresh=1 \(UI during schedule regen\)/);
  assert.match(worker, /Content_Profile: \[profileStamp\]/);
  assert.match(worker, /getScheduleRegenJobStatus\(request, env, authorization, ctx\)/);
  assert.match(worker, /Never await a full combination on the status GET/);
  assert.match(worker, /async function studioDrainScheduleRegenJob/);
  assert.match(worker, /ctx\.waitUntil\(studioDrainScheduleRegenJob/);
  assert.match(worker, /SCHEDULE_REGEN_POSTS_PER_SLICE/);
  assert.match(worker, /scheduleRegenComboIsOrphanProcessing/);
  assert.match(worker, /placed_isos/);
  assert.match(worker, /Orphan Processing \(no plan/);
  assert.match(worker, /froze Instagram Reel at 45\/95/);
  assert.match(worker, /leasedProcessing/);
  assert.match(worker, /SCHEDULE_REGEN_LIVE_LEASE_MS/);
  assert.match(worker, /softLeaseMs/);
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);
  assert.match(worker, /SCHEDULE_REGEN_OVERNIGHT_V1/);
  assert.match(worker, /studioEnqueueOvernightScheduleRegenJobs/);
  assert.match(worker, /studioResumeScheduleRegenJobs/);
  assert.match(worker, /SCHEDULE_REGEN_DRAIN_LEASE_MS/);
  assert.match(worker, /SCHEDULE_REGEN_DRAIN_LEASE_HEARTBEAT_MS/);
  assert.match(worker, /scheduleRegenDrainLeaseIsLive/);
  assert.match(worker, /drain_until/);
  assert.match(worker, /Sequential drains in one waitUntil/);
  assert.match(worker, /Checkpoint every 5 slots/);
  assert.match(batch, /Never wipe mid-apply/);
  assert.match(batch, /SCHEDULE_REGEN_STORE_CHAR_BUDGET = 150000/);
  assert.match(worker, /Prefer mid-apply, then scanned lanes/);
  assert.match(worker, /Scanned\n\s*\/\/ eligible_ids with plan=\[\]/);
  assert.match(worker, /studio schedule-regen resume failed/);
  assert.match(worker, /scheduleRegenComboIsEmptyLane\(combo\)/);
  // Empty-lane Complete must run before the needsPlanning gate (Chicago 0/0 after 0.10.637).
  assert.match(worker, /Empty scanned lanes must Complete even when needsPlanning is false/);

  assert.match(app, /\/api\/outputs\/schedule-regen/);
  assert.match(app, /pathname === "\/api\/outputs\/schedule-regen"/);
  assert.match(app, /queuePipelineScheduleRegenPoll/);
  assert.match(app, /loadPipelineScheduleGridWindow\("", \{ fresh: true \}\)/);
  assert.match(app, /params\.set\("fresh", "1"\)/);
  assert.match(app, /Posts rescheduled so far/);
  assert.match(app, /was lost after start/);
  assert.match(app, /window\.alert\(message\)/);
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
