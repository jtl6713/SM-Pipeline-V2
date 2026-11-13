import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GLOBAL_IDEA_TARGET_SETTING,
  globalAutomaticIdeaBudget,
  globalIdeaPipelineLoad,
  parseGlobalIdeaTarget,
} from "./autonomous-produce.mjs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerSource = readStudioWorkerSource();

test("global automatic inventory has one stable Airtable Pipeline Setting and default 500", () => {
  assert.equal(GLOBAL_IDEA_TARGET_SETTING, "STUDIO_GLOBAL_AUTOMATIC_IDEA_TARGET");
  assert.equal(parseGlobalIdeaTarget(undefined), 500);
  assert.equal(parseGlobalIdeaTarget(null), 500);
  for (const value of [1, 250, 500, 800, 10000, "700"]) assert.equal(parseGlobalIdeaTarget(value), Number(value));
  for (const value of ["", "bad", 0, 10001, 1.5, -1, "12.5"]) assert.equal(parseGlobalIdeaTarget(value), null);
});

test("inventory sums all cities and refuses incomplete or invalid counts", () => {
  const ids = ["chicago", "nyc", "la", "miami"];
  const scores = {chicago:{pipeline_load:120},nyc:{pipeline_load:160},la:{pipeline_load:140},miami:{pipeline_load:80}};
  assert.equal(globalIdeaPipelineLoad(scores, ids), 500);
  assert.equal(globalIdeaPipelineLoad(scores, ids.slice(0,3)), 420);
  assert.equal(globalIdeaPipelineLoad(scores, [...ids, "missing"]), null);
  assert.equal(globalIdeaPipelineLoad({ ...scores, miami: { pipeline_load: null } }, ids), null);
  assert.equal(globalIdeaPipelineLoad({ ...scores, nyc: { pipeline_load: NaN } }, ids), null);
  assert.equal(globalIdeaPipelineLoad({}, []), null);
});

test("shared cap applies to combined city total, never multiplied by four", () => {
  assert.equal(globalAutomaticIdeaBudget(500, 500), 0);
  assert.equal(globalAutomaticIdeaBudget(501, 500), 0);
  assert.equal(globalAutomaticIdeaBudget(490, 500), 2);
  assert.equal(globalAutomaticIdeaBudget(499, 500), 1);
  assert.equal(globalAutomaticIdeaBudget(650, 700), 10);
  assert.equal(globalAutomaticIdeaBudget(499, 300), 0);
  assert.equal(globalAutomaticIdeaBudget(-1, 500), 0);
  assert.equal(globalAutomaticIdeaBudget(null, 500), 0);
  assert.equal(globalAutomaticIdeaBudget(0, "bad"), 0);
});

test("both scheduled hourly and overnight production call the same authoritative global gate", () => {
  const start = workerSource.indexOf("async function studioGlobalAutomaticIdeaInventory(");
  assert.ok(start > 0);
  const helper = workerSource.slice(start, workerSource.indexOf("async function harvestAutonomousNewsHeadlines(", start));
  assert.match(helper, /listContentProfileRecords\(env\)/);
  assert.match(helper, /Boolean\(f\(record, "Active"\)\)/);
  assert.match(helper, /refresh: true, requireLive: true/);
  assert.match(helper, /refill.source !== "live"/);
  assert.match(helper, /globalIdeaPipelineLoad/);
  const daily = workerSource.slice(workerSource.indexOf("async function executeStudioDailyIdeas("), workerSource.indexOf("async function runStudioDailyIdeas("));
  assert.match(daily, /studioGlobalAutomaticIdeaInventory\(env\)/);
  assert.match(daily, /reservedOutputs \+= count \* AUTONOMOUS_EXPECTED_OUTPUTS_PER_IDEA/);
  const hourly = workerSource.slice(workerSource.indexOf("async function fillAutonomousScheduledHour("), workerSource.indexOf("async function executeStudioAutonomousProduce("));
  assert.match(hourly, /studioGlobalAutomaticIdeaInventory\(env\)/);
  assert.match(hourly, /globalInventory.remaining_ideas - createdCount/);
  assert.match(hourly, /global_inventory_unavailable/);
  assert.match(hourly, /global_idea_target_met/);
});

test("global admin API accepts targeted setting write without altering scheduling horizon", () => {
  const start = workerSource.indexOf("async function putStudioScheduleSettings(");
  const stop = workerSource.indexOf("async function getApproveAllJobStatus(", start);
  const source = workerSource.slice(start, stop);
  assert.match(source, /hasIdeas/);
  assert.match(source, /if \(hasHorizon\)/);
  assert.match(source, /GLOBAL_IDEA_TARGET_SETTING/);
  assert.match(source, /studioUpsertSetting\(env, GLOBAL_IDEA_TARGET_SETTING/);
});

// Release 0.6.746 regression checkpoint: shared target is a single cross-profile ceiling.

// Integration merge checkpoint: PR1095 includes latest main Conversational Producer work.
