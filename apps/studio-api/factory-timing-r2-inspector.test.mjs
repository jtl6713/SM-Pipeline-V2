import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readFactoryTimingReport } from "./factory-timing-r2-inspector.mjs";

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
