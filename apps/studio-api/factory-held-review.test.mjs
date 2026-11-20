import test from "node:test";
import assert from "node:assert/strict";
import { heldReviewEligibility, factoryHeldReviewDecision } from "./factory-held-review.mjs";

const id = "rec227PMjt8S8GPUh";
const valid = {
  airtable_record_id:id, id:"04c0ce14-c783-40b5-9c9e-05503fc823fb",
  do_not_publish:true, output_status:"Ready for Review",
  review_status:"Review Sent", render_status:"Rendered",
  publish_status:"Not Ready", auto_publish_enabled:false,
  scheduled_post_date:null, studio_scheduled_at:null, youtube_scheduled_publish_at:null,
  published_at:null, platform_post_url:null, test_run_id:null, error_messages:{},
};
test("held review eligibility fails closed on publication or schedule, not on safety hold",()=>{
  assert.equal(heldReviewEligibility(valid),null);
  assert.equal(heldReviewEligibility({...valid,error_messages:{Factory_Review_Handoff_Safety_Hold_At:"2026-11-19T17:02:40Z"}}),null);
  assert.match(heldReviewEligibility({...valid,auto_publish_enabled:true}),/disarmed/);
  assert.match(heldReviewEligibility({...valid,scheduled_post_date:"2026-11-20T12:00:00Z"}),/disarmed/);
  assert.match(heldReviewEligibility({...valid,do_not_publish:false}),/not publication-held/);
  assert.match(heldReviewEligibility({...valid,publish_status:"Published"}),/Publication already started/);
  assert.match(heldReviewEligibility({...valid,render_status:"Rendering"}),/not finished/);
  assert.match(heldReviewEligibility({...valid,review_status:"Approved"}),/already been recorded/);
});
test("reject cannot write without a reason or valid identity", async()=>{
  await assert.rejects(factoryHeldReviewDecision({},id,"reviewer","reject"),/requires a reason|Supabase/);
  await assert.rejects(factoryHeldReviewDecision({},"bad","reviewer","approve"),/Invalid exact/);
});
