import test from "node:test";
import assert from "node:assert/strict";
import { heldRetryPendingDisposition } from "./held-retry-pending-disposition.mjs";
import { normalizedOutputState } from "./worker-functions-01.mjs";

test("ambiguous IG AP3C parent is verification held, never a timed retry",()=>{
  const fields={Platform:"Instagram",Review_Status:"Approved",Output_Status:"Approved for Publishing",
    Publish_Status:"Ready to Publish",IG_Carousel_Status:"Retry Pending",
    IG_Carousel_Error_Message:"QA-IG-AP3C-AMBIGUOUS-PARENT: HTTP 500",
    Do_Not_Publish:true,Auto_Publish_Enabled:false,Publish_Retry_Eligible:false};
  assert.deepEqual(heldRetryPendingDisposition({fields}).retry_authorized,false);
  assert.match(heldRetryPendingDisposition({fields}).next_check,/parent operation/);
  assert.equal(normalizedOutputState({fields}),"Needs Verification");
  assert.equal(fields.IG_Carousel_Status,"Retry Pending");
});
test("corrupt held IG gallery is an asset repair, not another upload",()=>{
  const fields={Platform:"Instagram",Output_Status:"Approved for Publishing",
    Review_Status:"Approved",Publish_Status:"Ready to Schedule",IG_Carousel_Status:"Retry Pending",
    IG_Carousel_Error_Message:"AP1C expected 5 approved slides but found 4",
    Do_Not_Publish:true,Auto_Publish_Enabled:false,Publish_Retry_Eligible:false};
  assert.equal(normalizedOutputState({fields}),"Needs Asset Repair");
});
test("FB prior credential failure is not marked as an authorized retry",()=>{
  const fields={Platform:"Facebook",Output_Status:"Approved for Publishing",
    Review_Status:"Approved",Publish_Status:"Failed",FB_Publish_Status:"Retry Pending",
    Publish_Error_Stage:"FBS3",Publish_Error_Message:"HTTP 403 permission #200",
    Do_Not_Publish:true,Auto_Publish_Enabled:false,Publish_Retry_Eligible:false};
  assert.equal(normalizedOutputState({fields}),"Needs Verification");
});
test("future-scheduled FB throttle requires evidence, preserves slot and raw stage",()=>{
  const fields={Platform:"Facebook",Output_Status:"Approved for Publishing",
    Publish_Status:"Ready to Schedule",FB_Publish_Status:"Retry Pending",
    Publish_Error_Stage:"FBS3_RATE_LIMIT",Publish_Error_Message:"Graph rate limit 368",
    Scheduled_Post_Date:"2027-01-05T18:00:00Z",
    Last_Publish_Attempt_At:"2026-10-24T21:00:00Z",
    Auto_Publish_Enabled:true,Publish_Retry_Eligible:true,Do_Not_Publish:false};
  const d=heldRetryPendingDisposition({fields},{nowMs:Date.parse("2026-11-21T14:00:00Z")});
  assert.equal(d?.label,"Needs Verification");
  assert.equal(d?.retry_authorized,false);
  assert.equal(fields.Scheduled_Post_Date,"2027-01-05T18:00:00Z");
});
test("genuine bounded rate-limit retry remains Retry Pending",()=>{
  const fields={Platform:"Facebook",Output_Status:"Approved for Publishing",
    Publish_Status:"Failed",FB_Publish_Status:"Retry Pending",
    Publish_Error_Stage:"FBS3_RATE_LIMIT",Publish_Error_Message:"Graph rate limit 368",
    Publish_Retry_Eligible:true};
  assert.equal(heldRetryPendingDisposition({fields}),null);
  assert.equal(normalizedOutputState({fields}),"Retry Pending");
});
test("returned creative still reports Changes Requested regardless of stale raw publisher stage",()=>{
  const fields={Platform:"Instagram",Review_Status:"Changes Requested",Output_Status:"Changes Requested",
    Publish_Status:"Not Ready",IG_Carousel_Status:"Retry Pending",Do_Not_Publish:true};
  assert.equal(heldRetryPendingDisposition({fields}).label,"Changes Requested");
  assert.equal(normalizedOutputState({fields}),"Changes Requested");
});
