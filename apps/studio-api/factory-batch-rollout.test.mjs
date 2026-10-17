import { factoryBatchListGlobal, factoryBatchSummary } from "./factory-approval-queue.mjs";
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

test("five-Reel Chicago expansion requires exact mode, count and profile", () => {
  const multi={...enabled,
    FACTORY_BATCH_ROLLOUT_MODE:"chicago_ig_reels_v2",
    FACTORY_BATCH_ROLLOUT_MAX_ITEMS:"5",
  };
  const policy=factoryBatchRolloutPolicy(multi,chicago);
  assert.equal(policy.enabled,true);
  assert.equal(policy.max_items,5);
  assert.equal(policy.mode,"chicago_ig_reels_v2");
  const ids=Array.from({length:5},(_,i)=>"recChicagoMulti"+i);
  assert.equal(factoryBatchRolloutAcceptsIds(policy,ids),true);
  assert.equal(factoryBatchRolloutAcceptsIds(policy,ids.concat("recTooMany")),false);
  assert.equal(factoryBatchRolloutAcceptsIds(policy,[ids[0],ids[0]]),true);
  assert.equal(factoryBatchRolloutAcceptsOutput(policy,output("Instagram","Reel")),true);
  for(const [platform,type] of [["Instagram","Story"],["Facebook","Reel"],
    ["TikTok","Video Draft"],["YouTube","Short"]]) {
    assert.equal(factoryBatchRolloutAcceptsOutput(policy,output(platform,type)),false);
  }
  assert.equal(factoryBatchRolloutPolicy(multi,la).enabled,false);
  assert.equal(factoryBatchRolloutPolicy({...multi,FACTORY_BATCH_ROLLOUT_MAX_ITEMS:"20"},chicago).enabled,false);
  assert.equal(factoryBatchRolloutPolicy({...multi,FACTORY_BATCH_APPROVALS_ENABLED:"false"},chicago).enabled,false);
  assert.equal(factoryBatchRolloutPolicy({...multi,AIRTABLE_BASE_ID:"appDifferentBase012"},chicago).enabled,false);
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

test("production rollout manifest enables only the guarded five-Reel Chicago pilot", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repo = path.resolve(here, "../..");
  const manifest = JSON.parse(fs.readFileSync(path.join(repo,"deploy/factory-batch-production-rollout.json"),"utf8"));
  assert.deepEqual({
    mode:manifest.mode,profile_id:manifest.profile_id,
    max_items:manifest.max_items,platform:manifest.platform,output_type:manifest.output_type
  },{
    mode:"chicago_ig_reels_v2",profile_id:FACTORY_BATCH_CHICAGO_PROFILE_ID,
    max_items:5,platform:"Instagram",output_type:"Reel"
  });
  assert.equal(manifest.enabled,true);
  const active=factoryBatchRolloutPolicy({
    AIRTABLE_BASE_ID:FACTORY_BATCH_PRODUCTION_BASE_ID,
    FACTORY_BATCH_APPROVALS_ENABLED:String(manifest.enabled),
    FACTORY_BATCH_ROLLOUT_MODE:manifest.mode,
    FACTORY_BATCH_ROLLOUT_MAX_ITEMS:String(manifest.max_items),
  },chicago);
  assert.equal(active.enabled,true);
  assert.equal(active.max_items,5);
  assert.equal(factoryBatchRolloutAcceptsOutput(active,output("Instagram","Reel")),true);
  assert.equal(factoryBatchRolloutAcceptsOutput(active,output("Instagram","Story")),false);
  assert.equal(factoryBatchRolloutPolicy({
    AIRTABLE_BASE_ID:FACTORY_BATCH_PRODUCTION_BASE_ID,
    FACTORY_BATCH_APPROVALS_ENABLED:"true",
    FACTORY_BATCH_ROLLOUT_MODE:manifest.mode,
    FACTORY_BATCH_ROLLOUT_MAX_ITEMS:String(manifest.max_items),
  },la).enabled,false);
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

test("global Factory history is profile-independent, filtered explicitly, and bounded", async () => {
  const chicago = FACTORY_BATCH_CHICAGO_PROFILE_ID;
  const nyc = "recNYCProfile123";
  const jobs = [
    { schema:"studio.factory-batch.2", id:"fb_chicago", profile_id:chicago, request_id:"chicago-request-123",
      status:"completed", created_at:"2026-10-17T04:00:00Z", updated_at:"2026-10-17T04:01:00Z",
      items:[{id:"recChicagoOutput01",output_id:4906,platform:"Instagram",format:"Reel",status:"approved"}] },
    { schema:"studio.factory-batch.2", id:"fb_nyc", profile_id:nyc, request_id:"nyc-request-123",
      status:"failed", created_at:"2026-10-17T05:00:00Z",updated_at:"2026-10-17T05:02:00Z",
      items:[{id:"recNYCOutput1234",output_id:5001,platform:"Facebook",format:"Reel",status:"failed"}] },
  ];
  const keys = jobs.map(job => ({
    key:"studio/state/factory-approvals/v2/jobs/"+job.profile_id+"/"+job.request_id+".json",
    uploaded:new Date(job.updated_at),
  }));
  const store = new Map(keys.map((entry, i) => [entry.key,jobs[i]]));
  const bucket = { put: async()=>{}, get:async key => {
    const value=store.get(key);return value ? { text:async()=>JSON.stringify(value),etag:"e"}:null;
  },list:async ({prefix})=>({objects:keys.filter(row=>row.key.startsWith(prefix)),truncated:false})};
  const all = await factoryBatchListGlobal(bucket,{limit:10});
  assert.equal(all.jobs.length,2);
  assert.deepEqual(all.jobs.map(job=>job.id),["fb_nyc","fb_chicago"]);
  assert.equal(factoryBatchSummary(all.jobs[1]).items[0].output_id,4906);
  const filtered=await factoryBatchListGlobal(bucket,{profileId:chicago,limit:10});
  assert.deepEqual(filtered.jobs.map(job=>job.id),["fb_chicago"]);
  assert.equal(filtered.complete,true);
  await assert.rejects(()=>factoryBatchListGlobal(bucket,{profileId:"not-a-profile"}),/Invalid Factory filter/);
});

test("global Factory status is opt-in read-only and keeps scoped history available", () => {
 const worker=readStudioWorkerSource();
 const p=worker.indexOf("async function factoryBatchStatusRoute(");
 const end=worker.indexOf("async function factoryBatchProcess(",p);
 assert.ok(p>0&&end>p);
 const route=worker.slice(p,end);
 assert.match(route,/searchParams.get\("scope"\) === "all"/);
 assert.match(route,/factoryBatchListGlobal\(env.STUDIO_MEDIA/);
 assert.match(route,/factory_profile/);
 assert.match(route,/quality_signals: qualitySignals/);
 assert.match(route,/factoryBatchRead\(env.STUDIO_MEDIA, profile.id, requestId\)/);
 assert.doesNotMatch(route,/request\.json\(\)|factoryBatchEnqueue/);
});
