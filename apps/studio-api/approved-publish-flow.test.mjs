import assert from "node:assert/strict";
import test from "node:test";
import { assessFreshSupabasePublish, planAuditedEarlyHoldMaeReschedule } from "./approved-publish-flow.mjs";

const nowMs = Date.parse("2026-11-20T19:00:00Z");
const fresh = () => ({
  id: "rec12345678901234",
  fields: {
    Platform: "Instagram", Platform_Output_Type: "Instagram Reel",
    Review_Status: "Approved", Output_Status: "Approved for Publishing",
    Publish_Status: "Ready to Publish", Auto_Publish_Enabled: true,
    Do_Not_Publish: false, Scheduled_Post_Date: "2026-11-20T18:30:00Z",
    Publish_Asset_URL: "https://example.com/post.mp4",
    Output_Caption: "A ready caption",
  },
});
const check = row => assessFreshSupabasePublish(row, { nowMs });

test("only a genuinely fresh, due, complete output enters publisher", () => {
  assert.deepEqual(check(fresh()), { eligible: true, reason: "fresh_approved_due_unattempted" });
});
test("an ambiguous prior dispatch is verification work, never another upload", () => {
  for (const key of ["Studio_Publish_Dispatch_Count", "Publish_Attempt_Count"]) {
    const row = fresh(); row.fields[key] = 1;
    assert.equal(check(row).reason, "previous_attempt_requires_provider_reconciliation");
  }
  for (const key of ["Last_Publish_Attempt_At", "Publish_Started_At", "Studio_Publish_Dispatch_At",
    "Platform_Media_ID", "IG_Story_Container_ID", "Platform_Post_ID", "YouTube_Video_ID"]) {
    const row = fresh(); row.fields[key] = "prior-identity-or-time";
    assert.equal(check(row).reason, "prior_provider_or_dispatch_identity");
  }
});
test("never override retry prohibition, cooldown or active lock", () => {
  let row = fresh(); row.fields.Publish_Retry_Eligible = false;
  assert.equal(check(row).eligible, true, "no-retry flag must not block a never-attempted first post");
  row.fields.Studio_Publish_Dispatch_Count = 1;
  assert.equal(check(row).reason, "previous_attempt_requires_provider_reconciliation");
  row = fresh(); row.fields.Publish_Next_Retry_At = "2099-01-01T00:00:00Z";
  assert.equal(check(row).reason, "retry_cooldown");
  row = fresh(); row.fields.Publish_Locked_By = "publisher";
  assert.equal(check(row).reason, "active_publish_lock");
});
test("failed, held, unapproved and incomplete records cannot move to dispatch", () => {
  for (const [key, value] of [
    ["Publish_Status", "Failed"], ["Do_Not_Publish", true], ["Review_Status", "Changes Requested"],
    ["FB_Publish_Status", "Manual Fallback Required"], ["Output_Caption", ""], ["Publish_Asset_URL", ""],
    ["Published_At", "2026-11-20T18:00:00Z"]
  ]) {
    const row = fresh(); row.fields[key] = value;
    assert.equal(check(row).eligible, false, key);
  }
});
test("TikTok's lead window is honored and only approved fresh media may enter", () => {
  let row = fresh();
  row.fields.Platform = "TikTok";
  row.fields.Scheduled_Post_Date = "2026-11-20T19:14:00Z";
  assert.equal(check(row).eligible, true);
  row.fields.Scheduled_Post_Date = "2026-11-20T19:16:00Z";
  assert.equal(check(row).reason, "future_schedule");
});
test("carousel children and TikTok drafts with existing stage work use continuation, not a fresh create", () => {
  let row = fresh(); row.fields.IG_Carousel_Status = "Children Ready";
  assert.equal(check(row).reason, "carousel_stage_requires_continuation");
  row = fresh(); row.fields.TikTok_Draft_Status = "Processing";
  assert.equal(check(row).reason, "tiktok_stage_requires_continuation");
});

test("due Ready to Schedule records share the same fenced first-publish admission", () => {
  const row = fresh();
  row.fields.Publish_Status = "Ready to Schedule";
  assert.deepEqual(check(row), { eligible: true, reason: "fresh_approved_due_unattempted" });
  row.fields.Studio_Publish_Dispatch_Count = 8;
  assert.equal(check(row).reason, "previous_attempt_requires_provider_reconciliation");
});

const reconciledEarlyHold = () => {
  const record = fresh();
  record.fields.Publish_Status = "Ready to Schedule";
  record.fields.Studio_Publish_Dispatch_Count = 1;
  record.fields.Studio_Publish_Dispatch_At = "2026-11-18T10:30:00Z";
  record.fields.Studio_Early_Hold_Recovery_Proof = "issue-2340-scheduled-hold-v1";
  record.fields.Studio_Early_Hold_Original_Dispatch_At = record.fields.Studio_Publish_Dispatch_At;
  record.fields.Studio_Early_Hold_Original_Scheduled_At = "2026-11-19T18:30:00Z";
  record.fields.Studio_Overdue_MAE_Recovery_Receipt = {
    version: "issue-3096-mae-v1", output_record_id: record.id,
    platform: record.fields.Platform, output_type: record.fields.Platform_Output_Type,
    original_dispatch_at: record.fields.Studio_Publish_Dispatch_At,
    original_scheduled_at: record.fields.Studio_Early_Hold_Original_Scheduled_At,
    planned_at: "2026-11-20T10:00:00Z", scheduled_for: record.fields.Scheduled_Post_Date,
    time_zone: "America/New_York",
  };
  return record;
};

test("historical approval-time scheduled hold with exact per-record proof uses one-shot initial publisher", () => {
  assert.deepEqual(check(reconciledEarlyHold()), {
    eligible: true, reason: "audited_pre_schedule_hold_first_publish",
  });
});

test("synthetic historical hold requires exact immutable timestamp/slot identity", () => {
  for (const [key, value] of [
    ["Studio_Early_Hold_Recovery_Proof", ""],
    ["Studio_Early_Hold_Original_Dispatch_At", "2026-11-17T10:30:00Z"],
    ["Studio_Early_Hold_Original_Scheduled_At", "2026-11-20T17:30:00Z"],
    ["Studio_Publish_Dispatch_Count", 2],
    ["Publish_Attempt_Count", 1],
    ["Studio_Publish_Dispatch_At", "2026-11-20T18:31:00Z"],
    ["Publish_Started_At", "2026-11-18T10:31:00Z"],
    ["Last_Publish_Attempt_At", "2026-11-18T10:31:00Z"],
    ["Platform_Post_ID", "123_456"],
    ["IG_Story_Container_ID", "123456789"],
    ["Platform_Media_ID", "123456789"],
    ["Do_Not_Publish", true],
    ["Publish_Status", "Failed"],
    ["Review_Status", "Changes Requested"],
    ["Output_Caption", ""],
  ]) {
    const record = reconciledEarlyHold();
    record.fields[key] = value;
    assert.equal(check(record).eligible, false, key);
  }
});

test("historical single hold proof never overrides a 2099 cooldown or an active owner", () => {
  let record = reconciledEarlyHold();
  record.fields.Publish_Next_Retry_At = "2099-01-01T00:00:00Z";
  assert.equal(check(record).reason, "retry_cooldown");
  record = reconciledEarlyHold();
  record.fields.Publish_Locked_By = "provider_upload";
  record.fields.Publish_Locked_At = "2026-11-20T18:59:00Z";
  assert.equal(check(record).reason, "active_publish_lock");
  record = reconciledEarlyHold();
  record.fields.Scheduled_Post_Date = "2026-11-22T18:30:00Z";
  assert.equal(check(record).eligible, false, "slot changes invalidate recovery proof");
});

test("#3096 provider-specific prior operations cannot be admitted as first create with zero general counters",()=>{
 for(const key of ["IG_Story_Attempt_Count","IG_Carousel_Parent_Poll_Attempt_Count",
     "TikTok_Draft_Poll_Attempt_Count"]){
  for(const value of [1,"1","invalid"]){
   const row=fresh();row.fields[key]=value;
   assert.equal(check(row).reason,"previous_attempt_requires_provider_reconciliation",key);
  }
 }
 for(const [key,value] of [["IG_Story_Last_Attempt_At","2026-11-20T17:00:00Z"],
   ["YouTube_Upload_Job_ID","existing-job"],
   ["Platform_Publish_Response",{id:"previous-operation"}],
   ["Platform_Publish_Response_JSON",'{"id":"previous-operation"}']]){
  const row=fresh();row.fields[key]=value;
  assert.equal(check(row).reason,"prior_provider_or_dispatch_identity",key);
 }
 const row=fresh();row.fields.Platform_Publish_Response_JSON="{}";
 row.fields.IG_Story_Attempt_Count=0;
 assert.equal(check(row).eligible,true);
});
test("#3096 historical early-hold proof does not supersede native provider evidence",()=>{
 const row=reconciledEarlyHold();
 row.fields.IG_Story_Attempt_Count=1;
 assert.equal(check(row).eligible,false);
 delete row.fields.IG_Story_Attempt_Count;
 row.fields.Platform_Publish_Response_JSON='{"id":"prior"}';
 assert.equal(check(row).eligible,false);
});


test("#3096 native provider response survives reset general counters and forbids first create",()=>{
 for(const key of ["FB_Slideshow_Response_JSON","IG_Story_Response_JSON","IG_Carousel_Parent_Response_JSON",
  "IG_Carousel_Publish_Response_JSON","TikTok_Draft_Response_JSON","YouTube_Response_JSON"]){
  for(const row of [fresh(),reconciledEarlyHold()]){
   row.fields[key]="{'error': {'message': 'Error validating access token'}}";
   assert.equal(check(row).reason,"prior_provider_or_dispatch_identity",key);
  }
 }
 for(const key of ["FB_Slideshow_Attempt_Count","IG_Carousel_Publish_Attempt_Count"]){
  const row=fresh();row.fields[key]=1;
  assert.equal(check(row).reason,"previous_attempt_requires_provider_reconciliation",key);
 }
 const row=fresh();row.fields.FB_Slideshow_Response_JSON="{}";
 assert.equal(check(row).eligible,true);
});

test("#3096 expired audited hold requires a new MAE slot, not immediate publication", () => {
  const row = reconciledEarlyHold();
  row.fields.Scheduled_Post_Date = row.fields.Studio_Early_Hold_Original_Scheduled_At;
  delete row.fields.Studio_Overdue_MAE_Recovery_Receipt;
  assert.equal(check(row).reason, "overdue_recovery_requires_mae_reschedule");
  const options = { nowMs, timeZone:"America/New_York", horizonDays:30,
    laneOccupiedMs:[], platformOccupiedMs:[Date.parse("2026-11-20T21:30:00Z")], occupancyComplete:true };
  const plan = planAuditedEarlyHoldMaeReschedule(row, options);
  assert.equal(plan.ok, true);
  assert.equal(plan.scheduled_for, "2026-11-21T10:30:00.000Z");
  assert.equal(row.fields.Studio_Publish_Dispatch_Count, 1);
  assert.equal(row.fields.Scheduled_Post_Date, "2026-11-19T18:30:00Z");
  assert.equal(plan.receipt.original_scheduled_at, "2026-11-19T18:30:00.000Z");
  row.fields.Scheduled_Post_Date = plan.scheduled_for;
  row.fields.Studio_Overdue_MAE_Recovery_Receipt = plan.receipt;
  assert.equal(check(row).reason, "future_schedule");
  assert.equal(assessFreshSupabasePublish(row, { nowMs: Date.parse(plan.scheduled_for) }).eligible, true);
  row.fields.Studio_Overdue_MAE_Recovery_Receipt = {...plan.receipt, output_record_id:"rec00000000000000"};
  assert.equal(assessFreshSupabasePublish(row, { nowMs: Date.parse(plan.scheduled_for) }).eligible, false);
});
test("#3096 MAE plan fails closed on incomplete occupancy, receipt or prior provider evidence", () => {
  const original = () => {const r=reconciledEarlyHold();
    r.fields.Scheduled_Post_Date=r.fields.Studio_Early_Hold_Original_Scheduled_At;
    delete r.fields.Studio_Overdue_MAE_Recovery_Receipt; return r;};
  const options={nowMs,timeZone:"America/New_York",horizonDays:30,laneOccupiedMs:[],platformOccupiedMs:[],occupancyComplete:true};
  assert.equal(planAuditedEarlyHoldMaeReschedule(original(),{...options,occupancyComplete:false}).ok,false);
  assert.equal(planAuditedEarlyHoldMaeReschedule(original(),{...options,timeZone:"bad-zone"}).ok,false);
  for (const key of ["Platform_Post_ID","YouTube_Upload_Job_ID","Publish_Locked_By","IG_Story_Last_Attempt_At"]) {
    const row=original();row.fields[key]="existing";
    assert.equal(planAuditedEarlyHoldMaeReschedule(row,options).ok,false,key);
  }
  const row=original();row.fields.Do_Not_Publish=true;
  assert.equal(planAuditedEarlyHoldMaeReschedule(row,options).ok,false);
});
