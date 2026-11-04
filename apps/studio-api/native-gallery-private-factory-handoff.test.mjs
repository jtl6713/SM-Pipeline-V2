import test from "node:test";
import assert from "node:assert/strict";
import {handoffNativeGalleryToPrivateFactory as handoff}
  from "./native-gallery-private-factory-handoff.mjs";

const O="rec00000000000001",P="rec00000000000002";
const C="rec00000000000003",A="rec00000000000004";
const R="rec00000000000005",J="ngjob_01234567890123456789";
const H="gallery_hold_123456",OWN="gallery_owner_123456";
const HASH="a".repeat(64);
const env={
 NATIVE_GALLERY_FACTORY_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED:"true",
 NATIVE_GALLERY_REVISED_VERIFY_ENABLED:"true",
 NATIVE_GALLERY_FACTORY_HANDOFF_ENABLED:"true",
};
const auth={authenticated:true,authorized:true,
 permissions:{outputs_review:true},user:{record_id:A},
 authorized_profile_ids:[P]};
const initialEvents=[
 {event:"native_gallery_job_created",publication_authorized:false},
 {event:"native_gallery_job_claimed",publication_authorized:false},
 {event:"native_gallery_launch_intent_reserved",publication_authorized:false},
];
const body={manifest_sha256:HASH,confirm_private_factory_handoff:true};
const req=(value=body)=>new Request("https://studio.invalid/api/factory/outputs/"+O+
  "/gallery/jobs/"+J+"/factory-handoff",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(value),
});
function fixture(){
 const output={id:O,fields:{Content_Item:[C],
   Do_Not_Publish:true,Studio_Render_Review_Hold_Active:true,
   Studio_Render_Review_Hold_ID:H,Studio_Render_Review_Hold_Owner:OWN,
   Studio_Render_Review_Session_ID:OWN}};
 const job={id:R,fields:{
   Job_ID:J,Output_Record_ID:O,Profile_Record_ID:P,
   Content_Item_Record_ID:C,Hold_ID:H,Hold_Owner:OWN,
   Job_State:"creative_accepted",Creative_Decision:"accepted",
   Creative_Decision_Actor:A,Row_Version:5,
   Progress_Stage:"creative_accepted",
   Revised_Manifest_SHA256:HASH,
   Event_History_JSON:JSON.stringify(initialEvents),
 }};
 const content={id:C,fields:{Content_Profile:[P]}};
 const calls={locks:0,patches:0,preflight:0};
 const ops={
  withOutputLock:async(_,fn)=>{calls.locks++;return fn();},
  readJob:async()=>job,
  readOutput:async()=>output,
  readContent:async()=>content,
  patchJob:async(id,fields)=>{assert.equal(id,R);calls.patches++;
    Object.assign(job.fields,fields);return {id,fields};},
  verifyDrive:async()=>true,
 };
 const preflight=async args=>{
   calls.preflight++;
   assert.equal(args.request.method,"GET");
   assert.equal(args.output_id,O);assert.equal(args.job_id,J);
   assert.equal(job.fields.Row_Version,5);
   return {ok:true,output_id:O,job_id:J,profile_id:P,
     revised_manifest_sha256:HASH,ready_for_factory_review:true,
     drive_rights_and_pixels_verified:true,hold_active:true,
     creative_approved:true,factory_approved:false,
     handoff_performed:false,can_publish:false,
     publication_authorized:false,
     requires_separate_factory_approval:true};
 };
 return {output,job,content,calls,ops,preflight};
}
function run(f,extra={}){
 return handoff({request:req(),env,authorization:auth,
   output_id:O,job_id:J,assertWriteRequest:()=>{},
   operations:f.ops,preflight:f.preflight,
   now:()=>"2026-11-04T13:30:00.000Z",...extra});
}
test("explicit private review handoff writes ONLY an Airtable job ledger receipt",async()=>{
 const f=fixture();
 const priorOutput=JSON.stringify(f.output),priorContent=JSON.stringify(f.content);
 const result=await run(f);
 assert.equal(result.ok,true);
 assert.equal(result.private_factory_review_handoff,true);
 assert.equal(result.stage,"factory_review_pending");
 assert.equal(result.replay,false);
 assert.equal(result.factory_approved,false);
 assert.equal(result.hold_active,true);
 assert.equal(result.hold_released,false);
 assert.equal(result.publication_authorized,false);
 assert.equal(result.can_publish,false);
 assert.equal(result.media_quarantined,true);
 assert.equal(f.job.fields.Job_State,"creative_accepted");
 assert.equal(f.job.fields.Row_Version,6);
 assert.equal(f.job.fields.Progress_Stage,"factory_review_pending");
 assert.equal(f.calls.patches,1);assert.equal(f.calls.preflight,1);
 assert.equal(JSON.stringify(f.output),priorOutput);
 assert.equal(JSON.stringify(f.content),priorContent);
 const events=JSON.parse(f.job.fields.Event_History_JSON);
 assert.equal(events.length,initialEvents.length+1);
 assert.equal(events.at(-1).event,"native_gallery_private_factory_handoff");
 assert.equal(events.at(-1).manifest_sha256,HASH);
 assert.equal(events.at(-1).hold_released,false);
 const retry=await run(f);
 assert.equal(retry.ok,true);assert.equal(retry.replay,true);
 assert.equal(f.calls.patches,1);assert.equal(f.calls.preflight,1);
});
test("default off, invalid caller/body/CSRF/method never acquire output lock",async()=>{
 const cases=[
  {env:{...env,NATIVE_GALLERY_FACTORY_HANDOFF_ENABLED:"false"}},
  {env:{...env,NATIVE_GALLERY_REVISED_VERIFY_ENABLED:"false"}},
  {authorization:{...auth,authenticated:false}},
  {authorization:{...auth,user:{record_id:"bad"}}},
  {output_id:"recbad"},
  {request:new Request("https://studio.invalid/",{method:"GET"})},
  {request:req({manifest_sha256:HASH,confirm_private_factory_handoff:false})},
  {request:req({...body,can_publish:true})},
  {request:req({manifest_sha256:"x",confirm_private_factory_handoff:true})},
 ];
 for(const change of cases){
  const f=fixture();
  await assert.rejects(run(f,change));
  assert.equal(f.calls.locks,0);
  assert.equal(f.calls.patches,0);
 }
 const f=fixture();
 await assert.rejects(run(f,{assertWriteRequest:()=>{throw Error("CSRF denied")}}),
   /CSRF denied/);
 assert.equal(f.calls.locks,0);
});
test("unauthorized profile, lost hold, issued schedule, published output or rejected V2 deny before independent preflight",async()=>{
 const changes=[
   f=>f.output.fields.Do_Not_Publish=false,
   f=>f.output.fields.Studio_Render_Review_Hold_Active=false,
   f=>f.output.fields.Studio_Render_Review_Hold_Owner="other",
   f=>f.output.fields.Studio_Scheduled_At="2026-11-05T15:00:00Z",
   f=>f.output.fields.Published_At="2026-11-04T13:00:00Z",
   f=>f.output.fields.Platform_Media_ID="platform_media_exists",
   f=>f.content.fields.Content_Profile=["rec99999999999999"],
   f=>f.job.fields.Job_State="rejected",
   f=>f.job.fields.Creative_Decision="rejected",
   f=>f.job.fields.Creative_Decision_Actor="rec99999999999999",
   f=>f.job.fields.Revised_Manifest_SHA256="b".repeat(64),
   f=>f.job.fields.Row_Version=4,
   f=>f.job.fields.Progress_Stage="ready_for_review",
 ];
 for(const change of changes){
   const f=fixture();change(f);
   await assert.rejects(run(f));
   assert.equal(f.calls.patches,0);
   assert.equal(f.calls.preflight,0);
 }
 const f=fixture();
 await assert.rejects(run(f,{authorization:{...auth,authorized_profile_ids:[]}}));
 assert.equal(f.calls.patches,0);
});
test("independent private evidence missing, altered, or ambiguous cannot write the handoff",async()=>{
 const changes=[
  f=>f.preflight=async()=>({ok:false}),
  f=>f.preflight=async()=>({ok:true,...{
   output_id:O,job_id:J,profile_id:P,revised_manifest_sha256:HASH,
   ready_for_factory_review:true,drive_rights_and_pixels_verified:true,
   hold_active:true,creative_approved:true,factory_approved:true,
   handoff_performed:false,can_publish:false,publication_authorized:false,
   requires_separate_factory_approval:true}}),
  f=>f.preflight=async()=>{throw Error("private Drive permission changed")},
  f=>f.job.fields.Event_History_JSON="[]",
  f=>f.job.fields.Event_History_JSON="broken",
  f=>f.job.fields.Event_History_JSON=JSON.stringify([
   ...initialEvents,{event:"native_gallery_private_factory_handoff"}]),
 ];
 for(const change of changes){
   const f=fixture();change(f);
   await assert.rejects(run(f));
   assert.equal(f.calls.patches,0);
 }
});
test("mutations during remote private preflight fail closed without a write",async()=>{
 for(const alter of [
  f=>{f.job.fields.Row_Version=7},
  f=>{f.job.fields.Revised_Manifest_SHA256="b".repeat(64)},
  f=>{f.job.fields.Event_History_JSON="[]"},
  f=>{f.job.fields.Hold_ID="different"},
 ]){
  const f=fixture(),original=f.preflight;
  f.preflight=async x=>{const result=await original(x);alter(f);return result;};
  await assert.rejects(run(f),/GALLERY_FACTORY_HANDOFF_CHANGED_DURING_PREFLIGHT/);
  assert.equal(f.calls.patches,0);
 }
});
test("lost Airtable write acknowledgement is only reconciled by readback/replay",async()=>{
 const f=fixture();
 const originalPatch=f.ops.patchJob;
 f.ops.patchJob=async()=>{}; // ambiguous/no-op PATCH
 await assert.rejects(run(f),/GALLERY_FACTORY_HANDOFF_READBACK_UNVERIFIED/);
 f.ops.patchJob=originalPatch;
 const retry=await run(f);
 assert.equal(retry.replay,false); // safe only because authoritative readback is unchanged
 const g=fixture();
 await run(g);
 const copied=JSON.parse(g.job.fields.Event_History_JSON);
 copied.at(-1).actor_id="rec99999999999999";
 g.job.fields.Event_History_JSON=JSON.stringify(copied);
 await assert.rejects(run(g),/GALLERY_FACTORY_HANDOFF_REPLAY_CONFLICT/);
 assert.equal(g.calls.patches,1);
});
