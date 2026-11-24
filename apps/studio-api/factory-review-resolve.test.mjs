import test from "node:test";
import assert from "node:assert/strict";
import {reviewResolveCandidate,inspectResolveOutput,inspectResolveSlides} from "./factory-review-resolve.mjs";
const id="recbzkRN1wyWoBjOn",repair={stage:"owned_branded_draft_materialized",slide_count:4,visual_qa_pending:true,publishing_authorized:false,factory_final_approval:false};
const output={airtable_record_id:id,output_number:11129,selected_clip_count:4,do_not_publish:true,auto_publish_enabled:false,
  output_status:"Ready for Review",render_status:"Native Photo Route",publish_status:"Not Ready",output_caption:"Navy Pier",updated_at:"now",
  error_messages:{SM_Chicago_Gallery_Repair_2890:repair,SM_Native_Gallery_Preflight_Hold_2294:{issue_number:2294,verification_status:"not_yet_verified",publishing_authorized:false}}};
test("exact candidate only; no approval/hold bypass",()=>{
 assert.equal(reviewResolveCandidate(id,11129,true,repair),true);
 assert.equal(reviewResolveCandidate("rec00000000000000",11129,true,repair),false);
 assert.equal(reviewResolveCandidate(id,11129,false,repair),false);
 assert.deepEqual(inspectResolveOutput(output,id),[11129,4]);
 for(const patch of [{scheduled_post_date:"now"},{auto_publish_enabled:true},{publish_status:"Publishing"},
 {error_messages:{...output.error_messages,Factory_Review_Handoff_Safety_Hold_At:"now"}}]){
  assert.throws(()=>inspectResolveOutput({...output,...patch},id));
 }
 assert.throws(()=>inspectResolveSlides(output,[]),/missing or extra/);
});
test("technically unverified slides cannot be finalized by a human checkbox",()=>{
 const wrong=Array.from({length:4},()=>({fields:{}}));
 assert.throws(()=>inspectResolveSlides(output,wrong));
});
