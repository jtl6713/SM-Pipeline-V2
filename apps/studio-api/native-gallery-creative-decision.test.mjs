import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {decideNativeGalleryCreative} from "./native-gallery-creative-decision.mjs";
const OUT="rec00000000000001",PROFILE="rec00000000000002";
const CONTENT="rec00000000000003",ACTOR="rec00000000000004";
const JOB="ngjob_01234567890123456789";
const sha=s=>createHash("sha256").update(s).digest("hex");
const original=[{slot_id:"rec00000000000006",order:1,sha256:"a".repeat(64)}];
const revised=[{...original[0],sha256:"b".repeat(64)}];
const SHA=sha(JSON.stringify(revised));
const plan={selected:[{slide_id:"rec00000000000006"}],
 output_id:OUT,profile_id:PROFILE};
const ENV={
 NATIVE_GALLERY_JOB_WRITE_ENABLED:"true",
 NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",
 NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED:"true",
 NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
 NATIVE_GALLERY_MEDIA_RENDER_VERIFIED:"true",
 NATIVE_GALLERY_CLAIM_ENABLED:"true",
 NATIVE_GALLERY_LAUNCH_INTENT_ENABLED:"true",
 NATIVE_GALLERY_MANIFEST_COMMIT_ENABLED:"true",
 NATIVE_GALLERY_CREATIVE_DECISION_ENABLED:"true",
};
const AUTH={authenticated:true,authorized:true,
 user:{record_id:ACTOR},permissions:{outputs_review:true},
 authorized_profile_ids:[PROFILE]};
function fixture(){
 const out={id:OUT,fields:{Content_Item:[CONTENT],
  Studio_Render_Review_Hold_Active:true,Do_Not_Publish:true,
  Studio_Render_Review_Hold_ID:"hold_12345678",
  Studio_Render_Review_Hold_Owner:"owner_12345678",
  Studio_Render_Review_Session_ID:"owner_12345678"}};
 const job={id:"rec00000000000005",fields:{
  Job_ID:JOB,Output_Record_ID:OUT,Profile_Record_ID:PROFILE,
  Content_Item_Record_ID:CONTENT,Original_Manifest_SHA256:"a".repeat(64),
  Revised_Manifest_SHA256:SHA,Job_State:"ready_for_review",Row_Version:4,
  Hold_ID:"hold_12345678",Hold_Owner:"owner_12345678",
  Original_Manifest_JSON:JSON.stringify(original),
  Revised_Manifest_JSON:JSON.stringify(revised),
  Plan_JSON:JSON.stringify(plan),
 }};
 const content={id:CONTENT,fields:{Content_Profile:[PROFILE]}};
 const counts={locks:0,patches:0,drive:0};
 const ops={withOutputLock:async(_,fn)=>{counts.locks++;return fn();},
  readOutput:async()=>out,readContent:async()=>content,
  readJob:async()=>job,
  patchJob:async(_,fields)=>{counts.patches++;Object.assign(job.fields,fields);},
  verifyRevisedDriveArtifacts:async()=>{counts.drive++;return true;}};
 return {out,job,content,counts,ops};
}
function request(decision="accept",hash=SHA,reviewed=true){
 return new Request("https://studio.test/api/gallery/creative-decision",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({decision,manifest_sha256:hash,confirm_reviewed:reviewed}),
 });
}
function run(f,req=request(),auth=AUTH,env=ENV){
 return decideNativeGalleryCreative({request:req,env,authorization:auth,
  output_id:OUT,job_id:JOB,assertWriteRequest:()=>{},
  operations:f.ops,now:()=>"2026-11-02T14:00:00.000Z"});
}
test("exact accepted creative revision is durable, no Factory or publishing",async()=>{
 const f=fixture();
 const result=await run(f);
 assert.equal(result.ok,true);
 assert.equal(result.creative_approved,true);
 assert.equal(result.factory_approved,false);
 assert.equal(result.publication_authorized,false);
 assert.equal(f.job.fields.Job_State,"creative_accepted");
 assert.equal(f.counts.patches,1);assert.equal(f.counts.drive,1);
 const replay=await run(f);
 assert.equal(replay.replay,true);
 assert.equal(f.counts.patches,1);
});
test("reject records an independent creative decision only",async()=>{
 const f=fixture();
 const result=await run(f,request("reject"));
 assert.equal(result.decision,"reject");
 assert.equal(result.creative_approved,false);
 assert.equal(f.job.fields.Job_State,"rejected");
});
test("must explicitly confirm human review of exact SHA",async()=>{
 const f=fixture();
 await assert.rejects(run(f,request("accept",SHA,false)),
  /GALLERY_CREATIVE_EXPLICIT_CONFIRMATION_REQUIRED/);
 await assert.rejects(run(f,request("accept","0".repeat(64))),
  /GALLERY_CREATIVE_SOURCE_OR_HOLD_CHANGED/);
 assert.equal(f.counts.locks,1);
 assert.equal(f.counts.patches,0);
});
test("foreign profile, lost hold, stale rights and scheduled output blocked",async()=>{
 for(const modify of [
  f=>{f.out.fields.Studio_Render_Review_Hold_Active=false},
  f=>{f.out.fields.Scheduled_Post_Date="2026-11-04"},
  f=>{f.content.fields.Content_Profile=["rec99999999999999"]},
  f=>{f.ops.verifyRevisedDriveArtifacts=async()=>false},
 ]){
  const f=fixture();modify(f);
  await assert.rejects(run(f));assert.equal(f.counts.patches,0);
 }
 const f=fixture();
 await assert.rejects(run(f,request(),{...AUTH,authorized_profile_ids:[]}),
  /GALLERY_CREATIVE_SOURCE_OR_HOLD_CHANGED/);
});
test("failed Airtable readback never claims creative approval",async()=>{
 const f=fixture();
 f.ops.patchJob=async()=>{};
 await assert.rejects(run(f),/GALLERY_CREATIVE_READBACK_FAILED/);
});
test("wrong reviewer and disabled flag reject before reading Airtable",async()=>{
 const f=fixture();
 await assert.rejects(run(f,request(),{...AUTH,authenticated:false}),
  /GALLERY_CREATIVE_REVIEW_UNAUTHORIZED/);
 await assert.rejects(run(f,request(),AUTH,
  {...ENV,NATIVE_GALLERY_CREATIVE_DECISION_ENABLED:"false"}),
  /GALLERY_CREATIVE_DECISION_DISABLED/);
 assert.equal(f.counts.locks,0);
});
