import test from "node:test";import assert from "node:assert/strict";
import { compareHomeSnapshotToExceptionCensus as compare } from "./exception-recovery-home-parity.mjs";
const at=Date.parse("2026-10-24T04:20:00Z");
const census={status:"complete_census",by_profile:{recAAAAAAAAAAAAAA:{approved_past_due:4,approved_missing_date:0,failed:1}}};
const snap=(gen="overview-A",rows=[{id:"recAAAAAAAAAAAAAA",approved_past_due:4,approved_missing_date:0,failed:1}])=>
 ({complete:true,schemaVersion:6,generation:gen,at:at-1000,rows});
test("a stable recent Home generation can be compared without claiming atomic identity",()=>{
 const r=compare(census,snap(),snap(),{scanAtMs:at});
 assert.equal(r.status,"counts_match_stable_generation");assert.equal(r.compared_profiles,1);
 assert.match(r.note,/not an atomic/);
});
test("changed generation and stale Home snapshots fail closed",()=>{
 assert.equal(compare(census,snap("a"),snap("b"),{scanAtMs:at}).status,"generation_changed_during_census");
 assert.equal(compare(census,snap(),snap(),{scanAtMs:at+3600000}).status,"snapshot_too_old");
});
test("missing profiles and differing values are never accepted as parity",()=>{
 const missing=compare(census,snap("a",[{id:"recBBBBBBBBBBBBBB",approved_past_due:4,approved_missing_date:0,failed:1}]),
   snap("a",[{id:"recBBBBBBBBBBBBBB",approved_past_due:4,approved_missing_date:0,failed:1}]),{scanAtMs:at});
 assert.equal(missing.status,"incomplete_profile_scope");
 const bad=snap("a",[{id:"recAAAAAAAAAAAAAA",approved_past_due:3,approved_missing_date:0,failed:1}]);
 const diff=compare(census,bad,bad,{scanAtMs:at});
 assert.equal(diff.status,"mismatch");assert.deepEqual(diff.differences[0].metric,"approved_past_due");
});
test("incomplete census or unavailable Home generation can never compare",()=>{
 assert.equal(compare({status:"partial"},snap(),snap(),{scanAtMs:at}).status,"incomplete_census");
 assert.equal(compare(census,null,snap(),{scanAtMs:at}).status,"unavailable");
});
