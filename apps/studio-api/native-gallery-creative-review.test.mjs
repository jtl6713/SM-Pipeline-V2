import test from "node:test";
import assert from "node:assert/strict";
import {creativeReviewNativeGallery} from "./native-gallery-creative-review.mjs";
const OUTPUT="rec00000000000001",CONTENT="rec00000000000002";
const PROFILE="rec00000000000003",ACTOR="rec00000000000004";
const JOB="ngjob_12345678901234567890",SHA="a".repeat(64);
const ENV={NATIVE_GALLERY_JOB_WRITE_ENABLED:"true",
 NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",
 NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED:"true",
 NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
 NATIVE_GALLERY_MEDIA_RENDER_VERIFIED:"true",
 NATIVE_GALLERY_CLAIM_ENABLED:"true",
 NATIVE_GALLERY_LAUNCH_INTENT_ENABLED:"true",
 NATIVE_GALLERY_MANIFEST_COMMIT_ENABLED:"true",
 NATIVE_GALLERY_REVISED_VERIFY_ENABLED:"true",
 NATIVE_GALLERY_CREATIVE_ACCEPT_ENABLED:"true"};
const AUTH={authenticated:true,authorized:true,
 permissions:{outputs_review:true},user:{record_id:ACTOR}};
function req(decision="accept",manifest_sha256=SHA){
 return new Request("https://studio.test/api/factory/outputs/"+OUTPUT+
  "/gallery-creative-review",{method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({job_id:JOB,manifest_sha256,decision,
   client_request_id:"gallery_creative_req_123456789"})});
}
function fixture(){
 const original=[{slot_id:"rec00000000000005",order:1}];
 const revision=[{slot_id:"rec00000000000005",order:1,sha256:"c".repeat(64)}];
 const plan={output_id:OUTPUT,profile_id:PROFILE,content_item_id:CONTENT,
  original_manifest_sha256:"b".repeat(64),auto_approve:false,
  allow_public_publish:false,selected:[{slide_id:"rec00000000000005"}]};
 const output={id:OUTPUT,fields:{Content_Item:[CONTENT],
   Studio_Render_Review_Hold_Active:true,
   Studio_Render_Review_Hold_ID:"gallery_hold_123456",
   Studio_Render_Review_Hold_Owner:"gallery_owner_123456",
   Studio_Render_Review_Session_ID:"gallery_owner_123456",
   Do_Not_Publish:true,Publish_Status:"Not Ready"}};
 const content={id:CONTENT,fields:{Content_Profile:[PROFILE]}};
 const job={id:"rec00000000000006",fields:{
  Job_ID:JOB,Output_Record_ID:OUTPUT,Profile_Record_ID:PROFILE,
  Content_Item_Record_ID:CONTENT,Original_Manifest_SHA256:"b".repeat(64),
  Plan_SHA256:"d".repeat(64),Launch_Intent_SHA256:"e".repeat(64),
  Hold_ID:"gallery_hold_123456",Hold_Owner:"gallery_owner_123456",
  Revised_Manifest_SHA256:SHA,
  Original_Manifest_JSON:JSON.stringify(original),
  Revised_Manifest_JSON:JSON.stringify(revision),
  Plan_JSON:JSON.stringify(plan),
  Job_State:"ready_for_review",Row_Version:4,
 }};
 const counts={patches:0,verifies:0,locks:0};
 const ops={
  withOutputLock:async(id,fn)=>{assert.equal(id,OUTPUT);counts.locks++;return fn();},
  readOutput:async()=>output,readContent:async()=>content,
  readJob:async()=>job,
  patchJob:async(id,f)=>{assert.equal(id,job.id);counts.patches++;
   Object.assign(job.fields,f);},
  authorizeProfile:async(id)=>id===PROFILE,
  verifyRevisedDrive:async()=>{counts.verifies++;return true;},
 };
 return {output,content,job,counts,ops};
}
function run(f,request=req(),env=ENV,auth=AUTH){
 return creativeReviewNativeGallery({request,env,output_id:OUTPUT,
  authorization:auth,assertWriteRequest:()=>{},operations:f.ops,
  now:()=>"2026-11-02T13:40:00.000Z"});
}
test("exact verified creative acceptance never grants Factory or publishing",async()=>{
 const f=fixture();
 const first=await run(f);
 assert.equal(first.ok,true);
 assert.equal(first.creative_approved,true);
 assert.equal(first.factory_approved,false);
 assert.equal(first.publication_authorized,false);
 assert.equal(f.output.fields.Do_Not_Publish,true);
 assert.equal(f.job.fields.Job_State,"creative_accepted");
 assert.equal(f.counts.patches,1);
 const again=await run(f);
 assert.equal(again.replay,true);
 assert.equal(f.counts.patches,1);
 assert.equal(f.counts.verifies,2);
});
test("reject records separate creative decision, never Factory approval",async()=>{
 const f=fixture();const result=await run(f,req("reject"));
 assert.equal(result.creative_approved,false);
 assert.equal(f.job.fields.Job_State,"rejected");
 assert.equal(f.job.fields.Creative_Decision,"rejected");
 assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
});
test("stale hash, foreign membership, lost hold block before writes",async()=>{
 for(const edit of [
  f=>{f.output.fields.Do_Not_Publish=false;},
  f=>{f.output.fields.Scheduled_Post_Date="2026-11-04";},
  f=>{f.content.fields.Content_Profile=["rec99999999999999"];},
  f=>{f.job.fields.Revised_Manifest_SHA256="f".repeat(64);},
  f=>{f.ops.verifyRevisedDrive=async()=>false;},
 ]){
  const f=fixture();edit(f);
  await assert.rejects(run(f));
  assert.equal(f.counts.patches,0);
 }
});
test("conflicting replay and a changed reviewer cannot override creative vote",async()=>{
 const f=fixture();await run(f);
 await assert.rejects(run(f,req("reject")),/NATIVE_GALLERY_CREATIVE_CONFLICT/);
 const other={...AUTH,user:{record_id:"rec99999999999999"}};
 await assert.rejects(run(f,req(),ENV,other),/NATIVE_GALLERY_CREATIVE_CONFLICT/);
 assert.equal(f.counts.patches,1);
});
test("disabled flag does not attempt to claim or approve",async()=>{
 const f=fixture();
 await assert.rejects(run(f,req(),{...ENV,
  NATIVE_GALLERY_CREATIVE_ACCEPT_ENABLED:"false"}),/NATIVE_GALLERY_CREATIVE_DISABLED/);
 assert.equal(f.counts.locks,0);
});
test("missing Airtable readback cannot claim acceptance",async()=>{
 const f=fixture();f.ops.patchJob=async()=>{};
 await assert.rejects(run(f),/NATIVE_GALLERY_CREATIVE_READBACK_FAILED/);
});
test("client cannot supply a publication override or a forged decision",async()=>{
 const f=fixture();
 const body=JSON.parse(await req().text());
 const altered=new Request("https://studio.test/x",{method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({...body,allow_public_publish:true})});
 await assert.rejects(run(f,altered),/NATIVE_GALLERY_CREATIVE_REQUEST_INVALID/);
 assert.equal(f.counts.patches,0);
});
