import test from "node:test";
import assert from "node:assert/strict";
import { stage3ProductionAcceptance } from "./exception-recovery-audit-gate.mjs";
const home={status:"counts_match_stable_generation",snapshot_generation:"manual-good",
  snapshot_at:"2026-11-03T22:30:00Z",compared_profiles:4,differences:[]};
const census={status:"complete_census",source_row_count:8441,
  exception_items_truncated:false,home_snapshot_comparison:home,
  totals:{failed:20,approved_past_due:45}};
const pair=(n)=>({status:"matched",home_count:n,quality_agent_count:n,
  missing_in_quality_agent:0,extra_quality_agent:0});
const parity={status:"complete",failed:pair(20),approved_past_due:pair(45)};
const caseItem={record_id:"recAAAAAAAAAAAAAA",actions_enabled:false};
const disposition={status:"classified_read_only",complete:true,case_count:1,cases:[caseItem]};
test("all independent proof, four-city fresh Home, and read-only dispositions required",()=>{
 const result=stage3ProductionAcceptance(census,parity,disposition);
 assert.equal(result.status,"verified");
 assert.equal(result.failed,20);
 assert.equal(result.approved_past_due,45);
});
test("HTTP-successful source census does not bless stale or changed Home",()=>{
 for (const status of ["snapshot_too_old","generation_changed_during_census","mismatch",
     "incomplete_profile_scope","unavailable"]) {
   assert.equal(stage3ProductionAcceptance({...census,
     home_snapshot_comparison:{...home,status}},parity,disposition).status,"unverified");
 }
 assert.equal(stage3ProductionAcceptance({...census,
   home_snapshot_comparison:{...home,compared_profiles:3}},parity,disposition).status,"unverified");
});
test("exact one-ID publication race is not falsely accepted as matching",()=>{
 const mismatch={...parity,status:"mismatch",
   approved_past_due:{status:"mismatch",home_count:45,quality_agent_count:44,
     missing_in_quality_agent:1,extra_quality_agent:0}};
 assert.equal(stage3ProductionAcceptance(census,mismatch,disposition).status,"unverified");
});
test("incomplete or truncated case proof is not green",()=>{
 for(const d of [
   {...disposition,status:"partial"},
   {...disposition,cases:[]},
   {...disposition,cases:[{...caseItem,actions_enabled:true}]},
 ]) assert.equal(stage3ProductionAcceptance(census,parity,d).status,"unverified");
});
test("one differing count rejects inconsistent metrics even if labeled matched",()=>{
 assert.equal(stage3ProductionAcceptance({...census,totals:{failed:21,approved_past_due:45}},
   parity,disposition).status,"unverified");
});
