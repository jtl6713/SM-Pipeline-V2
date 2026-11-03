import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {claimNativeGalleryJob} from "./native-gallery-job-claim.mjs";

const OUTPUT="rec00000000000001",PROFILE="rec00000000000002";
const CONTENT="rec00000000000003",ACTOR="rec00000000000004";
const ID="ngjob_12345678901234567890";
const SECRET="private-native-gallery-job-secret-123456789";
const ENV={NATIVE_GALLERY_JOB_WRITE_ENABLED:"true",
 NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",
 NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED:"true",
 NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
 NATIVE_GALLERY_MEDIA_RENDER_VERIFIED:"true",
 NATIVE_GALLERY_CLAIM_ENABLED:"true",NATIVE_GALLERY_JOB_SHARED_SECRET:SECRET};
const sh=s=>createHash("sha256").update(s).digest("hex");
const PLAN={schema:"studio.native-gallery.job.1",output_id:OUTPUT,
 content_item_id:CONTENT,profile_id:PROFILE,
 original_manifest_sha256:"a".repeat(64),
 allow_public_publish:false,auto_approve:false,
 mutate_original_production_request:false,
 mutate_sibling_outputs:false,human_intent:"explicit_button"};
const FINGERPRINT="c".repeat(64),REQ="native_req_1234567890";
const body={output_id:OUTPUT,job_id:ID,client_request_id:REQ};
function request(secret=SECRET){
 return new Request("https://studio.example/api/internal/native-gallery/claim-job",{
  method:"POST",headers:{"Content-Type":"application/json",
   "X-Native-Gallery-Job-Secret":secret},body:JSON.stringify(body)});
}
function fixture(){
 const output={id:OUTPUT,fields:{
   Content_Item:[CONTENT],Platform_Output_Type:"Instagram Carousel",
   Studio_Render_Review_Hold_Active:true,
   Studio_Render_Review_Hold_ID:"gallery_hold_123456",
   Studio_Render_Review_Hold_Owner:"gallery_owner_123456",
   Studio_Render_Review_Session_ID:"gallery_owner_123456",
   Do_Not_Publish:true,Publish_Status:"Not Ready"}};
 const job={id:"rec00000000000005",fields:{
   Job_ID:ID,Output_Record_ID:OUTPUT,
   Content_Item_Record_ID:CONTENT,Profile_Record_ID:PROFILE,
   Actor_Record_ID:ACTOR,Client_Request_ID:REQ,
   Request_Fingerprint:FINGERPRINT,
   Original_Manifest_SHA256:"a".repeat(64),
   Plan_SHA256:sh(JSON.stringify(PLAN)),
   Hold_ID:"gallery_hold_123456",
   Hold_Owner:"gallery_owner_123456",
   Job_State:"held_queued",Row_Version:1,
   Lease_Owner:"",Lease_Fence:0,
   Plan_JSON:JSON.stringify(PLAN),
   Event_History_JSON:JSON.stringify([{
     event:"native_gallery_job_created",fingerprint:FINGERPRINT,
     publication_authorized:false}]),
 }};
 const content={id:CONTENT,fields:{Content_Profile:[PROFILE]}};
 let patches=0,locks=0;
 const operations={
   withOutputLock:async(id,fn)=>{assert.equal(id,OUTPUT);locks++;return fn();},
   readOutput:async()=>output,
   readContent:async()=>content,
   readJob:async()=>job,
   patchJob:async(id,fields)=>{assert.equal(id,job.id);patches++;
     Object.assign(job.fields,fields);},
 };
 return {output,job,content,operations,stats:()=>({patches,locks})};
}
const run=(f,req=request(),env=ENV)=>claimNativeGalleryJob({
 request:req,env,operations:f.operations,
 now:()=>"2026-11-02T12:00:00.000Z"});
test("a single durable fenced claim and identical retry only",async()=>{
 const f=fixture();
 const first=await run(f);
 assert.equal(first.ok,true);assert.equal(first.lease_verified,true);
 assert.equal(first.lease_fence,1);assert.equal(first.publication_authorized,false);
 assert.equal(first.render_started,false);
 assert.equal(f.job.fields.Job_State,"claimed");
 const again=await run(f);
 assert.equal(again.replay,true);
 assert.equal(again.lease_owner,first.lease_owner);
 assert.equal(f.stats().patches,1);
});
test("wrong service secret denied before inspecting Airtable",async()=>{
 const f=fixture();
 await assert.rejects(run(f,request("wrong")),/GALLERY_CLAIM_AUTH_REQUIRED/);
 assert.equal(f.stats().locks,0);
});
test("disabled claim is not executable",async()=>{
 const f=fixture();
 await assert.rejects(run(f,request(),{...ENV,NATIVE_GALLERY_CLAIM_ENABLED:"false"}),
  /GALLERY_CLAIM_DISABLED/);
 assert.equal(f.stats().locks,0);
});
test("cross profile, dispatch, absent hold and changed immutable plan deny claim",async()=>{
 for(const edit of [
   f=>{f.content.fields.Content_Profile=["rec99999999999999"];},
   f=>{f.output.fields.Studio_Render_Review_Hold_Active=false;},
   f=>{f.output.fields.Platform_Post_ID="already-posted";},
   f=>{f.output.fields.Platform_Output_Type="Instagram Reel";},
   f=>{f.job.fields.Plan_JSON=JSON.stringify({...PLAN,allow_public_publish:true});},
   f=>{f.job.fields.Event_History_JSON="[]";},
 ]){
   const f=fixture();edit(f);
   await assert.rejects(run(f));assert.equal(f.stats().patches,0);
 }
});
test("another Runner request cannot steal claimed job",async()=>{
 const f=fixture();
 await run(f);
 const alt=new Request("https://studio.example/api/internal/native-gallery/claim-job",{
   method:"POST",headers:{"Content-Type":"application/json",
     "X-Native-Gallery-Job-Secret":SECRET},
   body:JSON.stringify({...body,client_request_id:"another_12345678"})});
 await assert.rejects(run(f,alt),/GALLERY_JOB_ALREADY_CLAIMED/);
 assert.equal(f.stats().patches,1);
});
test("write with missing Airtable readback never claims success",async()=>{
 const f=fixture();
 f.operations.patchJob=async()=>{};
 await assert.rejects(run(f),/GALLERY_CLAIM_READBACK_UNVERIFIED/);
});
