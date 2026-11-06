import test from "node:test";
import assert from "node:assert/strict";
import { buildExceptionRecoveryCenter } from "./exception-recovery-center.mjs";

const failed = (id, extra = {}) => ({
  record_id: id, output_id: "3374", title: "Chicago skyline",
  platform: "YouTube", recovery: "verify_remote_before_retry",
  action: "Verify the existing remote ID", signature: "QA-PUBLISH-001", ...extra,
});
const pastDue = (id, extra = {}) => ({
  record_id: id, output_id: "3374", platform: "YouTube", cause: "remote_identity_not_public_visibility",
  recovery: "verify_remote_before_retry", scheduled_at: "2026-10-23T15:00:00Z",
  minutes_past_due: 75, action: "Check visibility before reposting", ...extra,
});
const snap = (extra = {}) => ({
  status: "ok", scanned_at: "2026-10-23T20:00:00Z",
  items: [failed("recAAAAAAAAAAAAAA")],
  canonical_failed: {status: "ok", items: [failed("recAAAAAAAAAAAAAA")]},
  rows: [{ id: "recAAAAAAAAAAAAAA", fields: {Do_Not_Publish: true}}],
  approved_past_due: {status: "ok", items: [pastDue("recAAAAAAAAAAAAAA")]},
  verification_recovery: {status: "ok", counts: {recovered_automatically: 2}, items: [
    {record_id: "recBBBBBBBBBBBBBB", outcome: "pending_verification"},
  ]}, ...extra,
});

test("overlapping QA detections produce one actionable identity, never a duplicate", () => {
  const result = buildExceptionRecoveryCenter(snap());
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].categories, ["failed","approved_past_due","quality_diagnostic","held_deferred"]);
  assert.equal(result.items[0].held, true);
  assert.equal(result.items[0].actions_enabled, false);
  assert.match(result.items[0].recommendation, /Do not automatically/);
  assert.equal(result.items[0].title, "Chicago skyline");
  assert.equal(result.items[0].minutes_past_due, 75);
});

test("provisional numbers never claim exact Home parity", () => {
  const result = buildExceptionRecoveryCenter(snap());
  assert.equal(result.metrics.failed.count, null);
  assert.equal(result.metrics.failed.observed, 1);
  assert.equal(result.metrics.approved_past_due.observed, 1);
  assert.equal(result.metrics.awaiting_verification.observed, 1);
  assert.equal(result.metrics.held_deferred.observed, 1);
  assert.equal(result.metrics.resolved_last_7_days.observed, 2);
  assert.equal(result.metrics.suspected_duplicates.observed, null);
  assert.equal(result.completeness.home_pipeline_parity, "unverified");
});

test("Airtable scan failures remain unknown rather than false zeros", () => {
  const result = buildExceptionRecoveryCenter(snap({
    approved_past_due: { status: "unavailable", error: "timeout" },
    verification_recovery: { status: "partial", counts: {recovered_automatically: null}},
  }));
  assert.equal(result.status, "partial");
  assert.equal(result.metrics.approved_past_due.observed, null);
  assert.equal(result.metrics.resolved_last_7_days.observed, null);
  assert.equal(result.metrics.awaiting_verification.observed, null);
  assert.equal(result.items.length, 1);
});

test("entire Quality Agent outage fails closed", () => {
  const result = buildExceptionRecoveryCenter({status:"unavailable"});
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.metrics, {});
  assert.equal(result.items.length, 0);
  assert.equal(result.read_only, true);
});

test("unknown rows never inherit commands or internal provider evidence", () => {
  const result = buildExceptionRecoveryCenter(snap({items: [failed("recAAAAAAAAAAAAAA", {
    api_key: "secret", command: "post", tokens: ["secret"],
  })]}));
  assert.equal(result.items[0].api_key, undefined);
  assert.equal(result.items[0].command, undefined);
  assert.equal(result.items[0].tokens, undefined);
  assert.equal(result.items[0].actions_enabled, false);
});

test("profile, platform and category filters affect rows, not unverified global metrics", () => {
  const current = snap({
    items: [
      failed("recAAAAAAAAAAAAAA", {profile_id: "recChicagoProfile", platform: "YouTube"}),
      failed("recCCCCCCCCCCCCCC", {profile_id: "recMiamiProfile", platform: "Instagram"}),
    ],
    canonical_failed: {status:"ok",items:[
      failed("recAAAAAAAAAAAAAA",{profile_id:"recChicagoProfile",platform:"YouTube"}),
      failed("recCCCCCCCCCCCCCC",{profile_id:"recMiamiProfile",platform:"Instagram"}),
    ]},
    approved_past_due: {status: "ok", items: [
      pastDue("recAAAAAAAAAAAAAA", {profile_id: "recChicagoProfile"}),
    ]},
  });
  const result = buildExceptionRecoveryCenter(current, {
    profile_id: "recChicagoProfile", platform: "youtube", category: "approved_past_due",
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].record_id, "recAAAAAAAAAAAAAA");
  assert.equal(result.visible_count, 1);
  assert.equal(result.metrics.failed.observed, 2);
  assert.equal(result.metric_scope, "all_profiles_unfiltered");
  assert.deepEqual(result.filters, {
    profile_id: "recChicagoProfile", platform: "youtube", category: "approved_past_due",
  });
});

test("verified recovery missing value stays unknown even when scan claims ok", () => {
 const partial=snap({
  verification_recovery:{status:"ok",items:[],counts:{recovered_automatically:null}},
 });
 assert.equal(buildExceptionRecoveryCenter(partial).metrics.resolved_last_7_days.observed,null);
});
test("overlapping past-due row with missing profile does not erase failed identity",()=>{
 const data=snap({items:[failed("recAAAAAAAAAAAAAA",{profile_id:"recChicagoProfile",profile_name:"Chicago"})]});
 const result=buildExceptionRecoveryCenter(data);
 assert.equal(result.items[0].profile_name,"Chicago");
 assert.equal(result.items[0].profile_id,"recChicagoProfile");
});


test("overdue title from Quality Agent appears on the list and detail item",()=>{
 const result=buildExceptionRecoveryCenter(snap({
   items:[],
   approved_past_due:{status:"ok",items:[
     pastDue("recAAAAAAAAAAAAAA",{title:"Crandon Park Nature Frames"}),
   ]},
 }));
 assert.equal(result.items[0].title,"Crandon Park Nature Frames");
 assert.equal(result.items[0].output_id,"3374");
});


test("diagnostic-only rows remain visible without inflating Home Failed",()=>{
 const result=buildExceptionRecoveryCenter(snap({
  items:[failed("recCCCCCCCCCCCCCC",{signature:"QA-IG-AP3C-AMBIGUOUS-PARENT"})],
  canonical_failed:{status:"ok",items:[]},
  approved_past_due:{status:"ok",items:[]},
 }));
 assert.equal(result.metrics.failed.observed,0);
 assert.equal(result.metrics.quality_diagnostics.observed,1);
 assert.deepEqual(result.items[0].categories,["quality_diagnostic"]);
 assert.equal(result.items[0].signature,"QA-IG-AP3C-AMBIGUOUS-PARENT");
});

test("canonical failure scan unavailability is unknown, not a false zero or parity pass",()=>{
 const result=buildExceptionRecoveryCenter(snap({canonical_failed:{status:"unavailable"}}));
 assert.equal(result.status,"partial");
 assert.equal(result.metrics.failed.observed,null);
 assert.equal(result.metrics.failed.count,null);
 assert.equal(result.completeness.failed,"unavailable");
 assert.equal(result.metrics.quality_diagnostics.observed,1);
});
