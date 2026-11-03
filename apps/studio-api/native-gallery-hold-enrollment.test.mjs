import test from "node:test";
import assert from "node:assert/strict";
import {enrollNativeGalleryHold} from "./native-gallery-hold-enrollment.mjs";

const OUTPUT="rec00000000000001", CONTENT="rec00000000000002";
const PROFILE="rec00000000000003",ACTOR="rec00000000000004";
const ENV={NATIVE_GALLERY_HOLD_ENROLLMENT_ENABLED:"true",
 NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",
 NATIVE_GALLERY_PUBLISHER_HOLD_VERIFIED:"true",
 NATIVE_GALLERY_SCHEDULE_LANE_VERIFIED:"true"};
const AUTH={authenticated:true,authorized:true,
 permissions:{outputs_review:true},user:{record_id:ACTOR}};
function request(body={client_request_id:"native_gallery_hold_request_12345"}){
 return new Request("https://studio.example/api/factory/outputs/"+OUTPUT+
  "/gallery-enroll",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
function fixture(){
 const output={id:OUTPUT,fields:{Content_Item:[CONTENT],
  Platform_Output_Type:"Instagram Carousel",Publish_Status:"Not Ready",
  Do_Not_Publish:false}};
 const content={id:CONTENT,fields:{Content_Profile:[PROFILE]}};
 let patches=0,locks=0;
 const ops={
  withOutputLock:async(id,fn)=>{assert.equal(id,OUTPUT);locks++;return fn();},
  readOutput:async()=>output,readContent:async()=>content,
  patchOutput:async(id,fields)=>{assert.equal(id,OUTPUT);patches++;
    Object.assign(output.fields,fields);},
  listJobs:async()=>[],authorizeProfile:async(id)=>id===PROFILE,
 };
 return {output,content,ops,stats:()=>({patches,locks})};
}
function run(f,env=ENV,auth=AUTH,req=request()){
 return enrollNativeGalleryHold({request:req,env,output_id:OUTPUT,
  authorization:auth,assertWriteRequest:()=>{},operations:f.ops});
}
test("one authoritative held output, idempotent identical replay",async()=>{
 const f=fixture();
 const first=await run(f);
 assert.equal(first.hold_verified,true);
 assert.equal(first.generation_queued,false);
 assert.equal(first.publication_authorized,false);
 assert.equal(f.output.fields.Do_Not_Publish,true);
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
 const second=await run(f);
 assert.equal(second.replay,true);
 assert.equal(second.hold_id,first.hold_id);
 assert.equal(f.stats().patches,1);
});
test("feature flags block before any output read",async()=>{
 const f=fixture();
 await assert.rejects(run(f,{...ENV,NATIVE_GALLERY_HOLD_ENROLLMENT_ENABLED:"false"}),
  /GALLERY_HOLD_ENROLLMENT_DISABLED/);
 assert.equal(f.stats().locks,0);
});
test("foreign profile denied without writes",async()=>{
 const f=fixture();f.ops.authorizeProfile=async()=>false;
 await assert.rejects(run(f),/GALLERY_HOLD_PROFILE_FORBIDDEN/);
 assert.equal(f.stats().patches,0);
});
test("scheduled, dispatched, other held, non-image and externally blocked fail closed",async()=>{
 for(const edit of [
  f=>{f.output.fields.Scheduled_Post_Date="2026-11-12";},
  f=>{f.output.fields.Platform_Post_ID="post_123";},
  f=>{f.output.fields.Studio_Render_Review_Hold_ID="other_owner_123";},
  f=>{f.output.fields.Platform_Output_Type="Instagram Reel";},
  f=>{f.output.fields.Do_Not_Publish=true;},
 ]){
  const f=fixture();edit(f);
  await assert.rejects(run(f));
  assert.equal(f.stats().patches,0);
 }
});
test("existing gallery jobs cannot be overwritten by a new hold",async()=>{
 const f=fixture();f.ops.listJobs=async()=>[{id:"rec00000000000008"}];
 await assert.rejects(run(f),/GALLERY_HOLD_EXISTING_JOB_OR_UNVERIFIED/);
 assert.equal(f.stats().patches,0);
});
test("write without exact Airtable readback never reports success",async()=>{
 const f=fixture();f.ops.patchOutput=async()=>{};
 await assert.rejects(run(f),/GALLERY_HOLD_READBACK_FAILED/);
});
test("another request ID never steals owned hold",async()=>{
 const f=fixture();await run(f);
 await assert.rejects(run(f,ENV,AUTH,request({
   client_request_id:"different_native_gallery_hold_1234",
 })),/GALLERY_HOLD_ALREADY_OWNED/);
 assert.equal(f.stats().patches,1);
});
test("missing permission and forged profile field denied",async()=>{
 const f=fixture();
 await assert.rejects(run(f,ENV,{...AUTH,permissions:{outputs_review:false}}),
  /GALLERY_HOLD_REVIEW_PERMISSION_DENIED/);
 await assert.rejects(run(f,ENV,AUTH,request({
  client_request_id:"native_gallery_hold_request_12345",profile_id:PROFILE
 })),/GALLERY_HOLD_REQUEST_INVALID/);
 assert.equal(f.stats().patches,0);
});
