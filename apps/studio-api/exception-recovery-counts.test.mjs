import test from "node:test";import assert from "node:assert/strict";
import {reconcileExceptionCensus} from "./exception-recovery-counts.mjs";
import {scanOutstandingFailedOutputs} from "./failed-output-monitor.mjs";
const r=(id,f)=>({id,fields:f});
const mapOutput=row=>({id:row.id,platform:row.fields.Platform||"Facebook",
 review_status:row.fields.Review_Status,output_status:row.fields.Output_Status,
 publish_status:row.fields.Publish_Status,studio_state:row.fields.Studio_State||"Scheduled",
 do_not_publish:row.fields.Do_Not_Publish===true,
 scheduled_post_date:row.fields.Scheduled_Post_Date,
 published_at:row.fields.Published_At,platform_post_url:row.fields.Platform_Post_URL});
test("uses Home canonical failure, past due, no date, manual and hold predicates",()=>{
 const rows=[
  r("recAAAAAAAAAAAAAA",{Platform:"Facebook",Review_Status:"Approved",Output_Status:"Approved for Publishing",Publish_Status:"Publishing",Scheduled_Post_Date:"2026-10-20T00:00:00Z"}),
  r("recBBBBBBBBBBBBBB",{Platform:"Instagram",Review_Status:"Approved",Output_Status:"Approved for Publishing",Publish_Status:"Ready to Schedule"}),
  r("recCCCCCCCCCCCCCC",{Platform:"TikTok",Publish_Status:"Failed",Output_Status:"Failed",Do_Not_Publish:true,Studio_State:"Manual Action Required"}),
 ];
 const actual=reconcileExceptionCensus(rows,mapOutput,{atMs:Date.parse("2026-10-23T00:00:00Z"),
  qaFailed:[{record_id:rows[2].id}],qaPastDue:[]});
 assert.equal(actual.totals.outputs,3);
 assert.equal(actual.totals.approved_past_due,1);
 assert.equal(actual.totals.approved_missing_date,1);
 assert.equal(actual.totals.failed,1);
 assert.equal(actual.totals.manual_action_required,1);
 assert.equal(actual.totals.held_deferred,1);
 assert.equal(actual.comparisons.approved_past_due.status,"mismatch");
 assert.equal(actual.comparisons.approved_past_due.missing_in_quality_agent,1);
 assert.equal(actual.comparisons.failed.status,"matched");
});
test("published proof and intentional holds do not count as overdue",()=>{
 const rows=[
 r("recAAAAAAAAAAAAAA",{Review_Status:"Approved",Output_Status:"Approved for Publishing",Scheduled_Post_Date:"2026-10-20T00:00:00Z",Platform_Post_URL:"https://www.facebook.com/post/1"}),
 r("recBBBBBBBBBBBBBB",{Review_Status:"Approved",Output_Status:"Approved for Publishing",Scheduled_Post_Date:"2026-10-20T00:00:00Z",Do_Not_Publish:true})
 ];
 assert.equal(reconcileExceptionCensus(rows,mapOutput).totals.approved_past_due,0);
});
test("duplicate, test and invalid inputs fail closed rather than count zeros",()=>{
 const item=r("recAAAAAAAAAAAAAA",{});
 assert.throws(()=>reconcileExceptionCensus([item,item],mapOutput),/Repeated/);
 assert.throws(()=>reconcileExceptionCensus([r("recBBBBBBBBBBBBBB",{Test_Run_ID:"test"})],mapOutput),/Nonproduction/);
 assert.throws(()=>reconcileExceptionCensus(null,mapOutput),/Complete/);
});

test("omitted Quality Agent evidence is unavailable rather than an empty QA inventory",()=>{
 const rows=[r("recAAAAAAAAAAAAAA",{Platform:"Instagram",Publish_Status:"Failed",
   Output_Status:"Failed"})];
 const actual=reconcileExceptionCensus(rows,mapOutput);
 assert.equal(actual.totals.failed,1);
 assert.equal(actual.comparisons.failed.status,"unavailable");
 assert.equal(actual.comparisons.failed.quality_agent_count,null);
 assert.equal(actual.comparisons.approved_past_due.status,"unavailable");
});

test("strict paginated census refuses duplicate records rather than hiding them",async()=>{
 const item=r("recAAAAAAAAAAAAAA",{});
 let n=0;
 await assert.rejects(()=>scanOutstandingFailedOutputs(async()=>++n===1
   ? {records:[item],offset:"next"} : {records:[item]},
   {filterFormula:"{Test_Run_ID}=BLANK()",requireUnique:true}),/Repeated record identity/);
});

test("full census supplies deduplicated click-through held and unverified-identity cases",()=>{
 const rows=[
   r("recAAAAAAAAAAAAAA",{Output_ID:81,Platform:"Facebook",Do_Not_Publish:true,
     Platform_Post_ID:"123456789123456"}),
   r("recBBBBBBBBBBBBBB",{Output_ID:82,Platform:"YouTube",
     Review_Status:"Approved",Output_Status:"Approved for Publishing",
     Publish_Status:"Publishing",Scheduled_Post_Date:"2026-10-20T00:00:00Z"}),
 ];
 const data=reconcileExceptionCensus(rows,mapOutput,{atMs:Date.parse("2026-10-23T00:00:00Z")});
 assert.equal(data.exception_items_count,2);
 assert.equal(data.unverified_remote_ids,1);
 assert.equal(data.exception_items_truncated,false);
 const held=data.exception_items.find(x=>x.record_id===rows[0].id);
 assert.deepEqual(held.categories.sort(),["held_deferred","remote_identity_unverified"].sort());
 assert.equal(held.actions_enabled,false);
 assert.equal(held.output_id,"81");
 const due=data.exception_items.find(x=>x.record_id===rows[1].id);
 assert.ok(due.categories.includes("approved_past_due"));
 assert.equal(due.minutes_past_due,4320);
});


test("canonical case display title uses Airtable Output_Title even when mapper omits it",()=>{
 const rows=[r("recAAAAAAAAAAAAAA",{Output_ID:7864,Output_Title:"NYC beyond Manhattan",
   Platform:"Instagram",Review_Status:"Approved",Output_Status:"Approved for Publishing",
   Publish_Status:"Publishing",Scheduled_Post_Date:"2026-10-20T00:00:00Z"})];
 const result=reconcileExceptionCensus(rows,mapOutput,{atMs:Date.parse("2026-10-23T00:00:00Z")});
 assert.equal(result.exception_items[0].title,"NYC beyond Manhattan");
 assert.equal(result.exception_items[0].output_id,"7864");
 assert.equal(result.exception_items[0].actions_enabled,false);
});
