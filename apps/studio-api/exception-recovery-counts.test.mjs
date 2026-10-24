import test from "node:test";import assert from "node:assert/strict";
import {reconcileExceptionCensus} from "./exception-recovery-counts.mjs";
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
