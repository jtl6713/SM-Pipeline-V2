import test from "node:test";
import assert from "node:assert/strict";
import { readChicagoTimingReport } from "./factory-chicago-77-timing-readonly.mjs";

const profile = "recT2rbKX3MF7cVFU";
const prefix = `studio/state/factory-approvals/v2/jobs/${profile}/`;
function makeJob(n,size,time) {
  const created=Date.parse(time);
  const at=t=>new Date(t).toISOString();
  const items=Array.from({length:size},(_,i)=>{
    const ms=created+i*4000, attempt=1;
    const states=[
      ["queued",ms,0],
      ["processing",ms+13000,attempt],
      ["preflight_fetch_started",ms+13500,attempt],
      ["preflight_fetch_finished",ms+14500,attempt],
      ["ownership_check_started",ms+15000,attempt],
      ["ownership_check_finished",ms+15200,attempt],
      ["approval_started",ms+15400,attempt],
      ["approval_lease_wait_started",ms+15500,attempt],
      ["approval_lease_acquired",ms+16000,attempt],
      ["slot_search_started",ms+16500,attempt],
      ["slot_search_finished",ms+18000,attempt],
      ["schedule_write_started",ms+18500,attempt],
      ["schedule_write_finished",ms+19300,attempt],
      ["supabase_sync_started",ms+19600,attempt],
      ["supabase_sync_finished",ms+19900,attempt],
      ["approval_finished",ms+20200,attempt],
      ["approved",ms+20400,attempt],
    ];
    return {id:`recTEST${n}ITEM${i}`,output_id:5000+n*10+i,status:"approved",
      timeline:states.map(([state,time,attempt])=>({state,at:at(time),attempt}))};
  });
  return {schema:"studio.factory-batch.2",profile_id:profile,request_id:`audit_batch_${n}_20261018`,
    id:`job_${n}`,created_at:time,updated_at:at(created+size*4000+26000),
    status:"completed",items};
}
function bucket(jobs) {
  const data=jobs.map(x=>({key:prefix+x.request_id+".json",uploaded:new Date(Date.parse(x.created_at)+60000),job:x}));
  return {
    async list({prefix:requested}) {assert.equal(requested,prefix);return {objects:data.map(x=>({key:x.key,uploaded:x.uploaded})),truncated:false};},
    async get(key){const x=data.find(x=>x.key===key);return x?{json:async()=>x.job}:null;},
    async put(){throw Error("read-only inspector must never write");},
    async delete(){throw Error("read-only inspector must never delete");},
  };
}
test("eight Chicago batches with a 7-output remainder are counted exactly",async()=>{
  const jobs=Array.from({length:8},(_,i)=>makeJob(i,i===0?7:10,`2026-10-18T23:${String(31+i).padStart(2,"0")}:00.000Z`));
  const report=await readChicagoTimingReport(bucket(jobs));
  assert.equal(report.exactly_eight_batches_77_outputs,true);
  assert.equal(report.selected_item_count,77);
  assert.equal(report.status_counts.approved,77);
  assert.equal(report.combined_timing_report.completed_timelines,77);
  assert.equal(report.stages.queue_wait.count,77);
  assert.equal(report.stages.preflight_airtable_fetch.mean_ms,1000);
  assert.equal(report.stages.schedule_slot_selection.mean_ms,1500);
  assert.equal(report.stages.airtable_schedule_commit.mean_ms,800);
  assert.equal(report.stages.supabase_sync.mean_ms,300);
  assert.equal(report.stages.approval_lease_wait.mean_ms,500);
  assert.equal(report.per_output.length,77);
});
test("older batch ignored, report never invents absent stage durations",async()=>{
  const old=makeJob(0,10,"2026-10-17T12:00:00.000Z");
  const row=makeJob(1,1,"2026-10-18T23:32:00.000Z");
  row.items[0].timeline=[{state:"queued",at:"2026-10-18T23:32:00.000Z",attempt:0}];
  const report=await readChicagoTimingReport(bucket([old,row]));
  assert.equal(report.selected_item_count,1);
  assert.equal(report.stages.schedule_verification.count,0);
  assert.equal(report.stages.schedule_verification.mean_ms,null);
  assert.equal(report.combined_timing_report.completed_timelines,0);
});
