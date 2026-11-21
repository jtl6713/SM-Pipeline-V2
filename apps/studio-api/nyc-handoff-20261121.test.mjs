import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
 NYC_20261121_EXACT_HANDOFF,
 NYC_HANDOFF_PROFILE_ID,
 selectExactNycHandoffSlot,
 exactNycHandoffPreflight,
} from "./nyc-handoff-20261121.mjs";

const target=NYC_20261121_EXACT_HANDOFF[0];
function fixture(t=target) {
 return {
  target:t,
  request:{ id:t.request, fields:{
   Request_Status:"Submitted", Studio_Master_Asset_Status:"Ready",
   Studio_Output_Plan_Status:"Ready",Studio_Variant_Status:"Ready",
   Studio_Production_Job_JSON:JSON.stringify({step:"escalated",error:"No Platform Outputs found for this Production Request"})
  }},
  idea:{ id:t.idea, fields:{ Candidate_Status:"Promoted", Promoted_Content_Record_ID:t.content }},
  parent:{ id:t.content,fields:{ Production_Request:[t.request],Content_Profile:[NYC_HANDOFF_PROFILE_ID] }},
  rows:Array.from({length:t.expected},(_,i)=>({id:"recPro"+i,fields:{Enabled:true, Platform_Output:[]}})),
 };
}

test("NYC one-time registry includes exactly 19 unique requests with 61 planned outputs",()=>{
 assert.equal(NYC_20261121_EXACT_HANDOFF.length,19);
 assert.equal(new Set(NYC_20261121_EXACT_HANDOFF.map(row=>row.request)).size,19);
 assert.equal(new Set(NYC_20261121_EXACT_HANDOFF.map(row=>row.idea)).size,19);
 assert.equal(new Set(NYC_20261121_EXACT_HANDOFF.map(row=>row.content)).size,19);
 assert.equal(NYC_20261121_EXACT_HANDOFF.reduce((s,row)=>s+row.expected,0),61);
 for (const row of NYC_20261121_EXACT_HANDOFF)
  for (const k of ["request","idea","content"]) assert.match(row[k],/^rec[A-Za-z0-9]{14}$/);
});
test("round-robin covers only exact NYC rows inside bounded incident dates",()=>{
 const start=Date.parse("2026-11-21T08:00:00Z");
 assert.equal(selectExactNycHandoffSlot(start-60000),null);
 for(let i=0;i<19;i++)assert.deepEqual(selectExactNycHandoffSlot(start+i*60000),NYC_20261121_EXACT_HANDOFF[i]);
 assert.equal(selectExactNycHandoffSlot(Date.parse("2026-11-24T00:00:00Z")),null);
});
test("exact authorization context, readback, parent and empty fanout all required",()=>{
 assert.equal(exactNycHandoffPreflight(fixture()),null);
 const variants=[
  ["wrong request",f=>{f.request.id="recWrong00000001";},"id_mismatch"],
  ["wrong idea",f=>{f.idea.fields.Candidate_Status="Generated";},"idea_not_promoted"],
  ["wrong content id",f=>{f.idea.fields.Promoted_Content_Record_ID="recWrong00000001";},"idea_parent_mismatch"],
  ["photo plan not ready",f=>{f.request.fields.Studio_Variant_Status="Preparing";},"assets_not_ready"],
  ["wrong request owner",f=>{f.parent.fields.Production_Request=["recWrong00000001"];},"parent_request_mismatch"],
  ["wrong market",f=>{f.parent.fields.Content_Profile=["recWrong00000001"];},"wrong_profile"],
  ["already retried",f=>{f.request.fields.Studio_Production_Job_JSON='{"step":"render"}';},"non_matching_production_job"],
  ["plan size drift",f=>{f.rows.pop();},"output_plan_count_changed"],
  ["output disabled",f=>{f.rows[0].fields.Enabled=false;},"disabled_output"],
  ["partial output already exists",f=>{f.rows[0].fields.Platform_Output=["recExisting12345"];},"already_partly_routed"],
 ];
 for(const [name,change,reason] of variants){const f=fixture();change(f);assert.equal(exactNycHandoffPreflight(f),reason,name);}
});
test("Worker recovery uses existing fanout, R2 precommit receipt, and no publishing or scheduling",()=>{
 const code=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
 const part=code.slice(code.indexOf("export async function studioNyc20261121HandoffCron("),code.indexOf("/*__STUDIO_WORKER_END:studioNyc20261121HandoffCron__*/"));
 assert.match(part,/studioWriteSource\(env\) !== "supabase"/);
 assert.match(part,/exactNycHandoffPreflight/);
 assert.ok(part.indexOf("STUDIO_MEDIA.put(receiptKey")<part.indexOf("finalizeProductionRequestPromotion("));
 assert.match(part,/already_attempted/);
 assert.match(part,/failed_no_auto_retry/);
 assert.match(part,/listSupabaseContentPlatformOutputs\(env, target\.content/);
 assert.match(part,/existing_platform_outputs_need_reconcile/);
 assert.match(part,/output_identity_or_link_readback_mismatch/);
 assert.match(part,/links\.every\(o => Boolean\(f\(o, "Platform_Output_Exists"\)\)\)/);
 assert.match(part,/enqueueStudioProductionJob\(env, target\.request, \{ resume: true \}\)/);
 assert.match(part,/verified_fanout_resume_held/);
 assert.doesNotMatch(part,/publishPlatform|publishNow|schedulePlatform|scheduled_post_date/i);
 const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
 assert.match(worker,/studioNyc20261121HandoffCron\(env, ctx, Number\(event\?\.scheduledTime\)/);
});

test("last-two v3 recovery is exact, one-shot, and never repeats verified owner output",()=>{
 const code=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
 const start=code.indexOf("export async function studioNyc20261121HandoffCron(");
 const end=code.indexOf("/*__STUDIO_WORKER_END:studioNyc20261121HandoffCron__*/",start);
 assert.ok(start>0 && end>start);
 const body=code.slice(start,end);
 assert.match(body,/const lastTwo = \["recF11iJFCPcRbGsk", "recNHXsBTfgfuagts"\]/);
 assert.match(body,/NYC_20261121_EXACT_HANDOFF\.find/);
 assert.match(body,/final-two-v3/);
 assert.match(body,/v3_already_attempted/);
 assert.match(body,/prior_verified_fanout_needs_investigation/);
 assert.match(body,/prior_v2_verified_fanout_needs_investigation/);
 assert.match(body,/exactNycHandoffPreflight/);
 assert.match(body,/existing_platform_outputs_need_reconcile/);
 assert.match(body,/failed_no_auto_retry/);
 const checked=body.indexOf("if (existingOutputs.length)");
 const receipt=body.indexOf("STUDIO_MEDIA.put(receiptKey");
 const produce=body.indexOf("finalizeProductionRequestPromotion(env, target.request");
 assert.ok(checked>0 && checked<receipt && receipt<produce, "zero PO readback then durable receipt then fanout");
 assert.doesNotMatch(body,/publishPlatform|publishNow|schedulePlatform|autoApprove/i);
});
