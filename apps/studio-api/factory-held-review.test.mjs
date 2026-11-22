import test from "node:test";
import assert from "node:assert/strict";
import { heldReviewEligibility, factoryHeldReviewDecision } from "./factory-held-review.mjs";
import { readFileSync } from "node:fs";

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

test("unresolved safety incident permits creative-only decision, never publishing release",()=>{
  const incident={...valid,publish_status:"Publishing",
    error_messages:{Factory_Review_Handoff_Safety_Hold_At:"2026-11-19T17:02:40Z"}};
  assert.equal(heldReviewEligibility(incident),null);
  assert.equal(heldReviewEligibility({...incident,publish_status:"Ready to Publish"}),null);
  assert.match(heldReviewEligibility({...incident,platform_post_url:"https://instagram.com/p/example"}),/Provider evidence exists/);
  assert.match(heldReviewEligibility({...incident,platform_publish_response:{id:"123"}}),/Provider evidence exists/);
  assert.match(heldReviewEligibility({...incident,error_messages:{
    ...incident.error_messages,
    SM_Factory_Held_Review_Receipt:{decision:"approve"},
  }}),/already been recorded/);
});


test("#2294: Factory Release for Approval validates exact canonical gallery before DNP-changing PATCH",()=>{
  const worker=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  const start=worker.indexOf("async function factoryReleaseOutputForApproval");
  const end=worker.indexOf("export async function mutateFactoryDesk",start);
  assert.ok(start>0 && end>start);
  const method=worker.slice(start,end);
  const selection=method.indexOf("factorySupabaseApprovalRows(env, [id])");
  const galleryGate=method.indexOf("await assertSupabaseNativeGalleryPublicationPackage(env, canonical)");
  const patch=method.indexOf('method: "PATCH"');
  assert.ok(selection>0 && galleryGate>selection && patch>galleryGate,
    "exact Supabase package check must precede any hold release");
  assert.match(method,/canonical\.do_not_publish !== true/);
  assert.match(method,/canonical\.published_at \|\| canonical\.platform_post_url/);
  assert.match(method,/No hold released/);
});
