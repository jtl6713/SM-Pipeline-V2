import test from "node:test";
import assert from "node:assert/strict";
import {compareIndependentQaCensus} from "./exception-recovery-qa-parity.mjs";
const row=(id,categories)=>({record_id:id,categories});
const at="2026-10-25T10:23:00Z";
const source={status:"complete_census",exception_items_truncated:false,
  exception_items:[row("recAAAAAAAAAAAAAA",["failed"]),row("recBBBBBBBBBBBBBB",["approved_past_due"])],
  totals:{failed:1,approved_past_due:1},scan_completed_at:at};
const qa={status:"provisional",as_of:"2026-10-25T10:23:35Z",
  items:[row("recAAAAAAAAAAAAAA",["failed"]),row("recBBBBBBBBBBBBBB",["approved_past_due"])],
  metrics:{failed:{status:"provisional",observed:1},approved_past_due:{status:"provisional",observed:1}}};
test("complete independent QA and Home IDs match on each lane",()=>{
 const x=compareIndependentQaCensus(source,qa);
 assert.equal(x.status,"complete");
 assert.equal(x.failed.status,"matched");
 assert.equal(x.approved_past_due.status,"matched");
 assert.equal(x.scan_skew_ms,35000);
});
test("QA-only and missing records are explicitly reported as mismatch",()=>{
 const changed={...qa,items:[row("recCCCCCCCCCCCCCC",["failed"]),qa.items[1]]};
 const x=compareIndependentQaCensus(source,changed);
 assert.equal(x.status,"mismatch");assert.equal(x.failed.missing_in_quality_agent,1);
 assert.equal(x.failed.extra_quality_agent,1);
});
test("stale, truncated, missing QA and inconsistent count evidence fail closed",()=>{
 for(const [s,q] of [
  [{...source,exception_items_truncated:true},qa],
  [source,{...qa,as_of:"2026-10-25T10:37:00Z"}],
  [source,{...qa,status:"unavailable"}],
  [source,{...qa,metrics:{...qa.metrics,failed:{status:"provisional",observed:2}}}],
 ]){
  const x=compareIndependentQaCensus(s,q);
  assert.ok(["partial","unavailable"].includes(x.status));
  assert.notEqual(x.failed.status,"matched");
 }
});
