import test from "node:test";
import assert from "node:assert/strict";
import { summarizeStage3ExceptionDispositions } from "./exception-recovery-disposition.mjs";
const r=(id,cat,extra={})=>({record_id:id,output_id:"100",platform:"Instagram",profile_id:"recPROFILE0000000",
  categories:cat,actions_enabled:false,held:false,remote_identity_exists:false,public_receipt_recorded:false,...extra});
const rows=[
  r("recAAAAAAAAAAAAAA",["failed"],{publish_status:"Failed"}),
  r("recBBBBBBBBBBBBBB",["approved_past_due","remote_identity_unverified"],
    {remote_identity_exists:true,recovery_lane:"verify_existing_post_status_only"}),
  r("recCCCCCCCCCCCCCC",["approved_past_due"],
    {recovery_lane:"missing_remote_identity_requires_publisher_preflight"}),
  r("recDDDDDDDDDDDDDD",["held_deferred"],{held:true}),
  r("recEEEEEEEEEEEEEE",["remote_identity_unverified"],{remote_identity_exists:true}),
];
const census=(items=rows)=>({
 status:"complete_census",scan_completed_at:"2026-11-03T22:50:00Z",
 exception_items:items,exception_items_count:items.length,
 exception_items_truncated:false,unverified_remote_ids:2,
 totals:{failed:1,approved_past_due:2,held_deferred:1},
});
test("read-only disposition covers every unique exception without authorizing reposts",()=>{
 const out=summarizeStage3ExceptionDispositions(census(),{
   status:"provisional",items:[{record_id:"recAAAAAAAAAAAAAA",diagnosis:"FB0 asset error",
     recommendation:"Inspect retry lock"}],
 });
 assert.equal(out.status,"classified_read_only");
 assert.equal(out.case_count,5);
 assert.equal(out.categories.approved_past_due,2);
 assert.equal(out.categories.failed,1);
 assert.equal(out.categories.held_deferred,1);
 assert.equal(out.categories.remote_identity_unverified,2);
 assert.equal(out.overdue_recovery_lanes.verify_existing_post_status_only,1);
 assert.equal(out.next_actions.verify_saved_remote_identity_before_any_retry,2);
 assert.equal(out.cases[0].quality_diagnosis,"FB0 asset error");
 assert.ok(out.cases.every(x=>x.actions_enabled===false));
 assert.equal(out.cases[3].next_action,"preserve_authoritative_hold");
});
test("partial, truncated, duplicated, enabled or inconsistent evidence fails closed",()=>{
 const variants=[
  {...census(),status:"partial"},
  {...census(),exception_items_truncated:true},
  {...census(),exception_items_count:5,exception_items:rows.slice(0,4)},
  census([...rows,rows[0]]),
  census([{...rows[0],actions_enabled:true},...rows.slice(1)]),
  {...census(),totals:{failed:2,approved_past_due:2,held_deferred:1}},
 ];
 for(const v of variants)
   assert.equal(summarizeStage3ExceptionDispositions(v,null).status,"unavailable");
});
test("held publication never gets a retry recommendation even with an existing remote ID",()=>{
 const held=r("recFFFFFFFFFFFFFF",["held_deferred","remote_identity_unverified"],
   {held:true,remote_identity_exists:true});
 const x=summarizeStage3ExceptionDispositions({
   ...census([held]),totals:{failed:0,approved_past_due:0,held_deferred:1},
 },null);
 assert.equal(x.cases[0].next_action,"preserve_authoritative_hold");
});
