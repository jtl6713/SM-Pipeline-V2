import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {reserveNativeGalleryLaunch} from "./native-gallery-launch-ledger.mjs";

const OUTPUT="rec00000000000001", PROFILE="rec00000000000002";
const CONTENT="rec00000000000003", ACTOR="rec00000000000004";
const JOB="ngjob_12345678901234567890",LEASE="ngrunner_012345678901234567890";
const SECRET="native-gallery-claim-secret-test-123456789";
const HASH="d".repeat(64),PLAN_SHA="a".repeat(64),FINGERPRINT="c".repeat(64);
const sha=s=>createHash("sha256").update(s).digest("hex");
const ENV={
 NATIVE_GALLERY_JOB_WRITE_ENABLED:"true",NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",
 NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED:"true",NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",NATIVE_GALLERY_MEDIA_RENDER_VERIFIED:"true",
 NATIVE_GALLERY_CLAIM_ENABLED:"true",NATIVE_GALLERY_LAUNCH_INTENT_ENABLED:"true",
 NATIVE_GALLERY_JOB_SHARED_SECRET:SECRET,
};
const plan={output_id:OUTPUT,content_item_id:CONTENT,profile_id:PROFILE,
 original_manifest_sha256:"b".repeat(64),human_intent:"explicit_button",
 allow_public_publish:false,auto_approve:false,
 mutate_original_production_request:false,mutate_sibling_outputs:false};
const original=[{slot_id:"rec00000000000006",order:1,sha256:"e".repeat(64)}];
const body={action:"reserve_intent",output_id:OUTPUT,job_id:JOB,
 lease_owner:LEASE,lease_fence:1,payload_hash:HASH};
function req(value=body,secret=SECRET){
 return new Request("https://studio.test/api/internal/native-gallery/reserve-launch",{
  method:"POST",headers:{"Content-Type":"application/json",
   "X-Native-Gallery-Job-Secret":secret},body:JSON.stringify(value)});
}
function fixture(){
 const output={id:OUTPUT,fields:{Content_Item:[CONTENT],Do_Not_Publish:true,
  Studio_Render_Review_Hold_Active:true,
  Studio_Render_Review_Hold_ID:"hold_12345678",
  Studio_Render_Review_Hold_Owner:"owner_12345678",
  Studio_Render_Review_Session_ID:"owner_12345678",
  Platform_Output_Type:"Instagram Carousel",Publish_Status:"Not Ready"}};
 const job={id:"rec00000000000005",fields:{
  Job_ID:JOB,Output_Record_ID:OUTPUT,Profile_Record_ID:PROFILE,
  Content_Item_Record_ID:CONTENT,Actor_Record_ID:ACTOR,
  Original_Manifest_SHA256:"b".repeat(64),
  Plan_SHA256:sha(JSON.stringify(plan)),Request_Fingerprint:FINGERPRINT,
  Job_State:"claimed",Row_Version:2,Lease_Owner:LEASE,Lease_Fence:1,
  Hold_ID:"hold_12345678",Hold_Owner:"owner_12345678",
  Plan_JSON:JSON.stringify(plan),Original_Manifest_JSON:JSON.stringify(original),
  Event_History_JSON:JSON.stringify([
   {event:"native_gallery_job_created",publication_authorized:false},
   {event:"native_gallery_job_claimed",lease_owner:LEASE,lease_fence:1,
    publication_authorized:false},
  ]),
 }};
 const content={id:CONTENT,fields:{Content_Profile:[PROFILE]}};
 const counts={patches:0,verifications:0,locks:0};
 const operations={
  withOutputLock:async(id,fn)=>{assert.equal(id,OUTPUT);counts.locks++;return fn();},
  readOutput:async()=>output,readContent:async()=>content,
  readJob:async()=>job,
  patchJob:async(id,fields)=>{assert.equal(id,job.id);counts.patches++;
   Object.assign(job.fields,fields);},
  verifyOriginalSources:async(input)=>{counts.verifications++;
   assert.equal(input.original_manifest_sha256,"b".repeat(64));
   assert.deepEqual(input.original_artifacts,original);return true;},
 };
 return {output,job,content,counts,operations};
}
const run=(f,request=req(),env=ENV)=>reserveNativeGalleryLaunch({
 request,env,operations:f.operations,now:()=>"2026-11-02T12:05:00.000Z"});
test("durable launch intent readback allows only the first launch",async()=>{
 const f=fixture();
 const first=await run(f);
 assert.equal(first.ok,true);assert.equal(first.may_generate,true);
 assert.equal(first.intent_verified,true);
 assert.equal(first.publication_authorized,false);
 assert.equal(f.job.fields.Row_Version,3);
 assert.equal(f.job.fields.Launch_Intent_SHA256,HASH);
 assert.equal(f.counts.patches,1);
 const again=await run(f);
 assert.equal(again.replay,true);
 assert.equal(again.may_generate,false);
 assert.equal(f.counts.patches,1);
 assert.equal(f.counts.verifications,1);
});
test("read-only state never reserves a new attempt",async()=>{
 const f=fixture();
 const result=await run(f,req({...body,action:"read_intent"}));
 assert.equal(result.intent_verified,false);
 assert.equal(result.may_generate,false);
 assert.equal(f.counts.patches,0);
});
test("disabled launch and wrong service secret deny before Airtable",async()=>{
 const f=fixture();
 await assert.rejects(run(f,req(),{...ENV,NATIVE_GALLERY_LAUNCH_INTENT_ENABLED:"false"}),
  /GALLERY_LAUNCH_DISABLED/);
 await assert.rejects(run(f,req(body,"wrong")),/GALLERY_LAUNCH_AUTH_DENIED/);
 assert.equal(f.counts.locks,0);
});
test("lost publication hold, scheduled output, foreign source or stale plan deny",async()=>{
 for(const change of [
  f=>{f.output.fields.Do_Not_Publish=false;},
  f=>{f.output.fields.Scheduled_Post_Date="2026-11-12";},
  f=>{f.content.fields.Content_Profile=["rec99999999999999"];},
  f=>{f.job.fields.Plan_JSON='{"changed":true}';},
  f=>{f.job.fields.Lease_Owner="other-runner-12345678";},
  f=>{f.operations.verifyOriginalSources=async()=>false;},
 ]){
  const f=fixture();change(f);
  await assert.rejects(run(f));assert.equal(f.counts.patches,0);
 }
});
test("ambiguous Airtable PATCH cannot claim an authorized launch",async()=>{
 const f=fixture();
 f.operations.patchJob=async()=>{};
 await assert.rejects(run(f),/GALLERY_LAUNCH_DURABLE_READBACK_FAILED/);
 assert.equal(f.counts.verifications,1);
});
test("orphan launch hash without event history is a hard conflict",async()=>{
 const f=fixture();
 f.job.fields.Launch_Intent_SHA256=HASH;
 await assert.rejects(run(f),/GALLERY_LAUNCH_LEDGER_INCOMPLETE/);
 assert.equal(f.counts.patches,0);
});

test("second payload hash cannot reuse prior reserved intent",async()=>{
 const f=fixture();await run(f);
 await assert.rejects(run(f,req({...body,payload_hash:"e".repeat(64)})),
  /GALLERY_LAUNCH_INTENT_CONFLICT/);
 assert.equal(f.counts.patches,1);
});
