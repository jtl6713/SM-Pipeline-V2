import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import {
  FACTORY_BATCH_STAGING_BASE_ID,
  FACTORY_BATCH_PRODUCTION_BASE_ID,
  FACTORY_BATCH_CHICAGO_PROFILE_ID,
  factoryBatchRolloutPolicy,
  factoryBatchRolloutAcceptsOutput,
  factoryBatchRolloutAcceptsIds,
} from "./factory-batch-rollout.mjs";

const chicago = FACTORY_BATCH_CHICAGO_PROFILE_ID;
const la = "recF7UAn0LkMZZrWZ";
const enabled = {
  AIRTABLE_BASE_ID: FACTORY_BATCH_PRODUCTION_BASE_ID,
  FACTORY_BATCH_APPROVALS_ENABLED: "true",
  FACTORY_BATCH_ROLLOUT_MODE: "chicago_ig_reel_v1",
  FACTORY_BATCH_ROLLOUT_MAX_ITEMS: "1",
};
const output = (platform, type) => ({ fields: {
  Platform: platform, Studio_Output_Type: type,
}});

test("production rollout refuses incomplete or bypassed enablement", () => {
  for (const env of [
    {},
    { ...enabled, FACTORY_BATCH_APPROVALS_ENABLED: "false" },
    { ...enabled, AIRTABLE_BASE_ID: "appeInvalidProduction" },
    { ...enabled, FACTORY_BATCH_ROLLOUT_MODE: "" },
    { ...enabled, FACTORY_BATCH_ROLLOUT_MAX_ITEMS: "100" },
    { ...enabled, FACTORY_BATCH_ROLLOUT_MAX_ITEMS: "2" },
    { ...enabled, FACTORY_BATCH_ROLLOUT_MODE: "unlimited" },
  ]) assert.equal(factoryBatchRolloutPolicy(env, chicago).enabled, false);
  assert.equal(factoryBatchRolloutPolicy(enabled, la).enabled, false);
  assert.equal(factoryBatchRolloutPolicy(enabled, chicago).enabled, true);
  assert.equal(factoryBatchRolloutPolicy(enabled, chicago).max_items, 1);
});

test("single-output Chicago Instagram Reel only; all other platforms and Stories excluded", () => {
  const rule = factoryBatchRolloutPolicy(enabled, chicago);
  assert.equal(factoryBatchRolloutAcceptsOutput(rule, output("Instagram", "Reel")), true);
  for (const [platform, type] of [
    ["Instagram", "Story"],
    ["Instagram", "Carousel"],
    ["Instagram", "Single Image"],
    ["Facebook", "Reel"],
    ["Facebook", "Story"],
    ["YouTube", "Short"],
    ["TikTok", "Video Draft"],
  ]) assert.equal(factoryBatchRolloutAcceptsOutput(rule, output(platform, type)), false, platform + " " + type);
  assert.equal(factoryBatchRolloutAcceptsIds(rule, ["recPilotOutput01"]), true);
  assert.equal(factoryBatchRolloutAcceptsIds(rule, ["recPilotOutput01","recPilotOutput02"]), false);
  assert.equal(factoryBatchRolloutAcceptsIds(rule, []), false);
  assert.equal(factoryBatchRolloutAcceptsIds(rule, ["not a record"]), false);
});

test("explicitly isolated staging retains multi-output integration acceptance", () => {
  const stage = factoryBatchRolloutPolicy({
    AIRTABLE_BASE_ID: FACTORY_BATCH_STAGING_BASE_ID,
    FACTORY_BATCH_APPROVALS_ENABLED: "true",
  }, "recStageProfile");
  assert.equal(stage.enabled, true);
  assert.equal(stage.mode, "isolated_staging");
  assert.equal(stage.max_items, 100);
  assert.equal(factoryBatchRolloutAcceptsIds(stage,
    ["recStage001","recStage002","recStage003","recStage004","recStage005"]), true);
  assert.equal(factoryBatchRolloutAcceptsOutput(stage, output("YouTube","Short")), true);
});

test("real canonical Worker enforces rollout at HTTP submit, retry, and cron-drained approval", () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /factoryBatchRolloutPolicy\(env, profile\.id\)/);
  assert.match(worker, /factoryBatchRolloutAcceptsIds\(rollout, records\.map/);
  assert.match(worker, /factoryBatchRolloutAcceptsIds\(rollout, previous\.items\.map/);
  assert.match(worker, /factoryBatchRolloutAcceptsOutput\(rollout, record\)/);
  assert.match(worker, /Do_Not_Publish/);
  assert.match(worker, /owner !== profile\.id/);
  assert.match(worker, /factoryBatchRolloutPolicy\(env, profileId\)/);
});

test("production rollout manifest and deployment workflow force a single safe pilot", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.resolve(here, "../..");
  const manifest = JSON.parse(fs.readFileSync(path.join(repo,"deploy/factory-batch-production-rollout.json"),"utf8"));
  assert.deepEqual({
    mode:manifest.mode,profile_id:manifest.profile_id,
    max_items:manifest.max_items,platform:manifest.platform,output_type:manifest.output_type
  },{
    mode:"chicago_ig_reel_v1",profile_id:FACTORY_BATCH_CHICAGO_PROFILE_ID,
    max_items:1,platform:"Instagram",output_type:"Reel"
  });
  assert.equal(typeof manifest.enabled,"boolean");
  const workflow=fs.readFileSync(path.join(repo,".github/workflows/deploy-cloudflare-worker-production.yml"),"utf8");
  assert.match(workflow,/factory-batch-production-rollout\.json/);
  assert.match(workflow,/factory_batch_canary_binding_contract=PASS/);
  assert.match(workflow,/factory_batch_chicago_pilot=PASS/);
  // The GET route accepts ?profile or ?content_profile_id, NOT ?profile_id.
  // A wrong query silently chooses the operator default profile and can make
  // an LA-disabled/Chicago-enabled production smoke look misleading.
  assert.match(workflow, /\\?profile=recT2rbKX3MF7cVFU/);
  assert.match(workflow, /\\?profile=recF7UAn0LkMZZrWZ/);
  assert.doesNotMatch(workflow, /\\?profile_id=rec(?:T2rbKX3MF7cVFU|F7UAn0LkMZZrWZ)/);

  assert.match(workflow,/Factory Chicago canary verification failed/);
  assert.match(workflow,/Roll back to captured production version on any failure/);
});
