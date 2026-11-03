import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFactoryTimingReport, readFactoryClaimsDiagnostic } from "./factory-timing-r2-inspector.mjs";

const inspector = fs.readFileSync(new URL("./factory-timing-r2-inspector.mjs", import.meta.url), "utf8");
const profile = "recgtK8Z7eNADNtVy";
const prefix = "studio/state/factory-approvals/v2/jobs/" + profile + "/";

function job(id, time, count = 10) {
  const items = Array.from({length:count}, (_,index) => {
    const start = Date.parse(time) + index*4000;
    const at = ms => new Date(ms).toISOString();
    return {
      id:"recTest" + String(index).padStart(11,"0"),
      output_id:index+500,
      status:"approved",
      timeline:[
        {state:"queued",at:at(start),attempt:0},
        {state:"processing",at:at(start+1000),attempt:1},
        {state:"approval_started",at:at(start+1000),attempt:1},
        {state:"slot_search_started",at:at(start+1500),attempt:1},
        {state:"slot_search_finished",at:at(start+2000),attempt:1},
        {state:"schedule_write_started",at:at(start+2100),attempt:1},
        {state:"schedule_write_finished",at:at(start+2400),attempt:1},
        {state:"approval_finished",at:at(start+3400),attempt:1},
        {state:"approved",at:at(start+3500),attempt:1},
      ],
    };
  });
  return {
    schema:"studio.factory-batch.2", id:"fb_"+id, request_id:id,
    profile_id:profile,status:"completed",created_at:time,
    updated_at:new Date(Date.parse(time)+count*4000).toISOString(),
    items,
  };
}
class ReadOnlyR2 {
  constructor(jobs) { this.entries = jobs.map(j => [prefix + j.request_id + ".json",j]); }
  async put() { throw Error("Inspector must never attempt a write"); }
  async list({prefix: requested}) {return {objects:this.entries.filter(([key])=>key.startsWith(requested))
    .map(([key,j])=>({key,uploaded:new Date(j.created_at)})),truncated:false};}
  async get(key) {const data=this.entries.find(([name])=>name===key)?.[1];
    return data ? {text: async()=>JSON.stringify(data),etag:"unit"} : null;}
}

test("R2 Inspector is read-only and uses existing authenticated ephemeral canary pattern", () => {
  assert.doesNotMatch(inspector,/\.put\(|\.delete\(|airtableFetch|airtableBatchUpdate|studioPublish/);
  assert.match(inspector,/request\.headers\.get\("Authorization"\)/);
  assert.match(inspector,/factoryBatchList\(bucket, NYC_PROFILE_ID/);
  assert.match(inspector,/factoryApprovalTimingReport\(/);
});
test("Real Factory item timeline shape yields observed stage metrics, not invented durations", async () => {
  const bucket = new ReadOnlyR2([
    job("nyc_real_approval_batch_A", "2026-10-18T21:31:00.000Z"),
    job("nyc_real_approval_batch_B", "2026-10-18T21:44:00.000Z"),
    job("nyc_batch_other_date", "2026-10-15T12:00:00.000Z"),
    job("nyc_non10_batch_2026", "2026-10-18T21:40:00.000Z",7),
  ]);
  const report = await readFactoryTimingReport(bucket);
  assert.equal(report.read_only,true);
  assert.equal(report.eligible_ten_output_batches,2);
  assert.equal(report.combined_timing_report.items,20);
  assert.equal(report.combined_timing_report.instrumented,20);
  assert.equal(report.combined_timing_report.metrics.schedule_slot_selection.p50_ms,500);
  assert.equal(report.combined_timing_report.metrics.airtable_schedule_commit.p50_ms,300);
  assert.equal(report.batches.length,2);
  assert.equal(report.batches[0].batch_wall_ms,40000);
});


test("Factory claims diagnostic is bounded, authenticated and strictly read-only", async () => {
  const chi="recT2rbKX3MF7cVFU", la="recF7UAn0LkMZZrWZ";
  const key="studio/state/factory-approvals/v2/output-claims-v1/"+chi+".json";
  const groupRoot="studio/state/factory-approvals/v2/groups/";
  const jobRoot="studio/state/factory-approvals/v2/jobs/"+chi+"/";
  const now=Date.parse("2026-11-03T04:00:00.000Z");
  const claims={
    schema:"studio.factory-output-claims.1",profile_id:chi,
    outputs:{
      recA0000000000001:{request_id:"factory_unbacked_20261103",source:"submission",at:"2026-11-03T01:10:00.000Z"},
      recA0000000000002:{request_id:"factory_unbacked_20261103",source:"submission",at:"2026-11-03T01:10:00.000Z"},
      recA0000000000003:{request_id:"factory_backed_20261103",source:"submission",at:"2026-11-03T02:00:00.000Z"},
      recA0000000000004:{request_id:"factory_local_20261103",source:"submission",at:"2026-11-03T02:00:00.000Z"},
      recA0000000000005:{request_id:"factory_old_20261001",source:"legacy",at:"2026-10-01T02:00:00.000Z"},
    },
  };
  const storage=new Map([
    [key,claims],
    [groupRoot+"factory_backed_20261103.json",{schema:"studio.factory-approval-group.1"}],
    [jobRoot+"factory_local_20261103.json",{schema:"studio.factory-batch.2"}],
  ]);
  const bucket={
    async put(){throw Error("Diagnostic must not write production R2");},
    async delete(){throw Error("Diagnostic must not delete production R2");},
    async list({prefix,limit}){
      assert.equal(limit,1000,"R2 enumeration must be bounded");
      return {objects:[],truncated:false};
    },
    async get(path){
      const data=storage.get(path);
      return data ? {text:async()=>JSON.stringify(data)} : null;
    },
  };
  const result=await readFactoryClaimsDiagnostic(bucket,now);
  assert.equal(result.read_only,true);
  assert.equal(result.schema,"studio.factory-claims-readonly.1");
  assert.equal(result.profiles.length,4);
  assert.equal(result.unbacked_recent_owners,1);
  const chicago=result.profiles.find(x=>x.profile_id===chi);
  assert.equal(chicago.total_claims,5);
  assert.equal(chicago.recent_claims,4);
  assert.equal(chicago.recent_owners,3);
  assert.deepEqual(chicago.recent_unbacked_owners.map(x=>x.request_id),
    ["factory_unbacked_20261103"]);
  assert.equal(chicago.recent_unbacked_owners[0].claim_count,2);
  assert.equal(result.profiles.find(x=>x.profile_id===la).registry_present,false);
  assert.match(inspector,/request\.headers\.get\("Authorization"\)/);
  assert.doesNotMatch(inspector,/\.put\(|\.delete\(/);
});


test("Live Factory claims diagnostic is tenant-admin read-only GET with no approval mutation", () => {
  const worker=fs.readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  assert.match(worker,/url\.searchParams\.get\("claims_diagnostic"\) === "1"/);
  assert.match(worker,/if \(url\.searchParams\.get\("claims_diagnostic"\) === "1"\) \{[\s\S]{0,320}requirePermission\(authorization, "tenant_admin"\)/);
  assert.match(worker,/await readFactoryClaimsDiagnostic\(env\.STUDIO_MEDIA\)/);
  assert.match(worker,/version: "0\.10\.737-story-r4-r2-cursor"/);
  assert.match(worker,/if \(request\.method === "POST"\) \{\s*assertWriteRequest\(request, env\);\s*return factoryBatchSubmitRoute/);
  assert.doesNotMatch(inspector,/\.put\(|\.delete\(|airtableFetch|studioPublish/);
});
