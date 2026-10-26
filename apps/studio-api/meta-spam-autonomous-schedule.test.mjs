import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {META_SPAM_HELD_CANDIDATES,verifiedHeldReservation,runMetaSpamHeldSchedule} from "./meta-spam-autonomous-schedule.mjs";

const id="recQjUNjlxZnuODrE",now=Date.parse("2026-10-26T12:00:00Z");
const pending={
 id,fields:{
  Output_ID:2762,Platform:"Facebook",Platform_Output_Type:"Facebook Reel",
  Output_Status:"Approved for Publishing",Review_Status:"Approved",
  Publish_Status:"Failed",Do_Not_Publish:true,Publish_Retry_Eligible:false,
  Publish_Error_Stage:"FBS3_RATE_LIMIT",Publish_Attempt_Count:1,
  Scheduled_Post_Date:"2026-10-22T12:30:00Z",
  Studio_Output_Notes:"QA-1050 HARD NO-GRAPH-CREATE HOLD",
 }
};
const completed=()=>({...pending,fields:{...pending.fields,
 Scheduled_Post_Date:"2026-10-29T14:00:00Z",
 Studio_Output_Notes:pending.fields.Studio_Output_Notes+
 "\\nSPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION"}});
const clone=x=>JSON.parse(JSON.stringify(x));

test("QA-368 scan excludes previously reserved, already posted and retired records",()=>{
 assert.match(META_SPAM_HELD_CANDIDATES,/FBS3_RATE_LIMIT/);
 assert.match(META_SPAM_HELD_CANDIDATES,/Do_Not_Publish}=1/);
 assert.match(META_SPAM_HELD_CANDIDATES,/QA-1050 HARD NO-GRAPH-CREATE HOLD/);
 assert.match(META_SPAM_HELD_CANDIDATES,/SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION/);
 assert.equal(verifiedHeldReservation(completed(),now),true);
 for(const patch of [
  {Do_Not_Publish:false},{Publish_Retry_Eligible:true},
  {Publish_Status:"Ready to Publish"},{Platform_Post_ID:"123456789"},
  {Platform_Output_Type:"Facebook Story"},{Output_Status:"Cancelled"},
  {Scheduled_Post_Date:"2026-10-26T13:00:00Z"}
 ])assert.equal(verifiedHeldReservation({...completed(),fields:{...completed().fields,...patch}},now),false,
  JSON.stringify(patch));
});

test("Quality Agent reserves a verified later slot once while preserving the hard hold",async()=>{
 let state=clone(pending),reserves=0,reads=0;
 const report=await runMetaSpamHeldSchedule({
  listCandidates:async()=>[clone(pending)],
  readOutput:async()=>{reads++;return clone(state)},
  eligibility:r=>r.fields.Studio_Output_Notes.includes("SPAM_COOLDOWN")?"already_reserved":null,
  reserve:async()=>{reserves++;state=completed();return {ok:true}},
  now:()=>now,
 });
 assert.equal(report.scheduled,1);
 assert.equal(reserves,1);assert.equal(reads,2);
 assert.equal(report.provider_writes,0);
 assert.equal(report.publisher_dispatches,0);
 assert.equal(report.hold_releases,0);
 assert.equal(state.fields.Do_Not_Publish,true);
 assert.equal(state.fields.Publish_Status,"Failed");
});

test("ambiguous transport failures use authoritative GET, not a second POST",async()=>{
 let state=clone(pending),tries=0;
 const report=await runMetaSpamHeldSchedule({
  listCandidates:async()=>[clone(pending)],
  readOutput:async()=>clone(state),
  eligibility:()=>null,
  reserve:async()=>{tries++;state=completed();throw Error("postcommit_500")},
  now:()=>now,
 });
 assert.equal(report.scheduled,1);
 assert.equal(tries,1);
 assert.equal(report.items[0].result,"reserved_held");
});

test("failed/read-only/altered candidates never count as reserved",async()=>{
 let tries=0;
 const report=await runMetaSpamHeldSchedule({
  listCandidates:async()=>[clone(pending),{id:"recAAAAAAAAAAAAAA"}],
  readOutput:async id=>id==="recAAAAAAAAAAAAAA"?null:clone(pending),
  eligibility:()=>null,
  reserve:async()=>{tries++;return {ok:false}},
  now:()=>now,
 });
 assert.equal(report.scheduled,0);
 assert.equal(report.attempted,1);
 assert.equal(tries,1);
 assert.equal(report.items[0].result,"not_verified");
});

test("one QA pass is bounded even with hundreds of eligible rows",async()=>{
 let count=0;
 const records=Array.from({length:60},(_,i)=>({...pending,id:"rec"+String(i).padStart(14,"0")}));
 const report=await runMetaSpamHeldSchedule({
  listCandidates:async()=>records,
  readOutput:async id=>({...clone(pending),id}),
  eligibility:()=>null,
  reserve:async()=>{count++;return {ok:false}},
  now:()=>now,limit:300,
 });
 assert.equal(count,4);
 assert.equal(report.attempted,4);
});

test("the heavy Quality Agent sweep calls the protected MAE scheduler; new Meta failures are hard-held",()=>{
 const worker=fs.readFileSync(new URL("./worker.js",import.meta.url),"utf8");
 const api=fs.readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
 const healer=fs.readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
 assert.match(worker,/await studioQualityScheduleHeldMetaSpam\(env, \{ limit: 2 \}\)/);
 const fn=api.slice(api.indexOf("export async function studioQualityScheduleHeldMetaSpam"),
  api.indexOf("/*__STUDIO_WORKER_END:studioQualityScheduleHeldMetaSpam__*/"));
 assert.match(fn,/scheduleStudioPublishOutput\(request,env,url,null\)/);
 assert.match(fn,/quality_rate_limit_hold_reschedule:true/);
 assert.match(fn,/facebookSpamHeldRescheduleReason/);
 assert.doesNotMatch(fn,/studioDispatchApprovedPublishNow|studioPulseFbs3|Graph create/);
 const fail=healer.slice(healer.indexOf("export async function studioHealFailedStatuses"),
  healer.indexOf("/*__STUDIO_WORKER_END:studioHealFailedStatuses__*/"));
 assert.match(fail,/Do_Not_Publish:true/);
 assert.match(fail,/Publish_Retry_Eligible: signedHold \? false : true/);
 assert.match(fail,/Auto_Publish_Enabled: signedHold \? false : true/);
 assert.match(fail,/QA-1050 HARD NO-GRAPH-CREATE HOLD/);
});
