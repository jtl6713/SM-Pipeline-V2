import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {commitNativeGalleryManifest} from "./native-gallery-manifest-commit.mjs";
const O="rec00000000000001",P="rec00000000000002",C="rec00000000000003";
const J="ngjob_12345678901234567890",L="ngrunner_012345678901234567890";
const S="rec00000000000004",SECRET="native-gallery-service-secret-123456789";
const OLD="original_drive_file_123456789012",NEW="revision_drive_file_123456789012";
const INTENT="a".repeat(64),hex=s=>createHash("sha256").update(s).digest("hex");
const ENV={NATIVE_GALLERY_JOB_WRITE_ENABLED:"true",
 NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED:"true",
 NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
 NATIVE_GALLERY_MEDIA_RENDER_VERIFIED:"true",NATIVE_GALLERY_CLAIM_ENABLED:"true",
 NATIVE_GALLERY_LAUNCH_INTENT_ENABLED:"true",NATIVE_GALLERY_MANIFEST_COMMIT_ENABLED:"true",
 NATIVE_GALLERY_JOB_SHARED_SECRET:SECRET};
const original=[{slot_id:S,order:1,output_id:O,profile_id:P,content_item_id:C,
 drive_file_id:OLD,sha256:"b".repeat(64),mime_type:"image/png",
 byte_count:2048,width:400,height:500,rights_verified:true,watermark_verified:true}];
const revised=[{...original[0],drive_file_id:NEW,sha256:"c".repeat(64)}];
const plan={schema:"studio.native-gallery.job.1",output_id:O,profile_id:P,
 content_item_id:C,original_manifest_sha256:"d".repeat(64),
 selected:[{slide_id:S,order:1,instruction:"Brighten the sky and keep subjects"}],
 allow_public_publish:false,auto_approve:false,
 mutate_original_production_request:false,mutate_sibling_outputs:false,
 human_intent:"explicit_button"};
const body={output_id:O,job_id:J,lease_owner:L,lease_fence:1,
 launch_intent_sha256:INTENT,revision_artifacts:revised};
function request(payload=body,secret=SECRET){
 return new Request("https://studio.test/api/internal/native-gallery/commit-manifest",{
  method:"POST",headers:{"Content-Type":"application/json",
    "X-Native-Gallery-Job-Secret":secret},body:JSON.stringify(payload)});
}
function fixture(){
 const output={id:O,fields:{Content_Item:[C],Platform_Output_Type:"IG Carousel",Do_Not_Publish:true,
  Studio_Render_Review_Hold_Active:true,Studio_Render_Review_Hold_ID:"hold_12345678",
  Studio_Render_Review_Hold_Owner:"owner_12345678",
  Studio_Render_Review_Session_ID:"owner_12345678"}};
 const content={id:C,fields:{Content_Profile:[P]}};
 const job={id:"rec00000000000005",fields:{
  Job_ID:J,Output_Record_ID:O,Profile_Record_ID:P,Content_Item_Record_ID:C,
  Request_Fingerprint:"e".repeat(64),Plan_SHA256:hex(JSON.stringify(plan)),
  Original_Manifest_SHA256:"d".repeat(64),
  Job_State:"claimed",Row_Version:3,Lease_Owner:L,Lease_Fence:1,
  Hold_ID:"hold_12345678",Hold_Owner:"owner_12345678",
  Launch_Intent_SHA256:INTENT,Plan_JSON:JSON.stringify(plan),
  Original_Manifest_JSON:JSON.stringify(original),
  Event_History_JSON:JSON.stringify([
   {event:"native_gallery_job_created",publication_authorized:false},
   {event:"native_gallery_job_claimed",publication_authorized:false},
   {event:"native_gallery_launch_intent_reserved",
    payload_hash:INTENT,lease_owner:L,lease_fence:1,publication_authorized:false},
  ])}};
 const stats={locks:0,patches:0,reads:0,drive:0};
 const operations={
  withOutputLock:async(_,fn)=>{stats.locks++;return fn();},
  readOutput:async()=>output,
  readContent:async()=>content,
  readJob:async()=>{stats.reads++;return job;},
  patchJob:async(_,patch)=>{stats.patches++;Object.assign(job.fields,patch);},
  verifyRevisedDriveArtifacts:async()=>{stats.drive++;return true},
 };
 return {output,content,job,stats,operations};
}
const run=(f,req=request(),env=ENV)=>commitNativeGalleryManifest({
 request:req,env,operations:f.operations,
 now:()=>"2026-11-02T13:00:00.000Z"});
test("one exact held revision committed and independently reread",async()=>{
 const f=fixture();const first=await run(f);
 assert.equal(first.ok,true);assert.equal(first.publication_authorized,false);
 assert.equal(first.creative_approved,false);
 assert.equal(f.job.fields.Job_State,"ready_for_review");
 assert.equal(f.job.fields.Row_Version,4);
 assert.equal(f.stats.patches,1);assert.equal(f.stats.drive,1);
 const retry=await run(f);
 assert.equal(retry.replay,true);assert.equal(f.stats.patches,1);
});
test("missing rights/bytes, wrong profile, lost hold and schedule block",async()=>{
 const changes=[
  f=>{f.operations.verifyRevisedDriveArtifacts=async()=>false},
  f=>{f.output.fields.Do_Not_Publish=false},
  f=>{f.output.fields.Studio_Scheduled_At="2026-11-04T13:00:00Z"},
  f=>{f.content.fields.Content_Profile=["rec99999999999999"]},
  f=>{f.job.fields.Lease_Fence=2},
 ];
 for(const change of changes){const f=fixture();change(f);
  await assert.rejects(run(f));assert.equal(f.stats.patches,0);}
});
test("selected slide must change, unselected cannot change",async()=>{
 const f=fixture();
 await assert.rejects(run(f,request({...body,revision_artifacts:original})),
  /GALLERY_COMMIT_SELECTED_NOT_REVISED/);
 assert.equal(f.stats.patches,0);
});
test("invalid auth and disabled flag do not query ledger",async()=>{
 const f=fixture();
 await assert.rejects(run(f,request(body,"bad")),/GALLERY_COMMIT_AUTH_DENIED/);
 await assert.rejects(run(f,request(),{...ENV,NATIVE_GALLERY_MANIFEST_COMMIT_ENABLED:"false"}),
  /GALLERY_COMMIT_DISABLED/);
 assert.equal(f.stats.locks,0);
});
test("ambiguous Airtable PATCH never acknowledges successful revision",async()=>{
 const f=fixture();f.operations.patchJob=async()=>{};
 await assert.rejects(run(f),/GALLERY_COMMIT_READBACK_FAILED/);
});
test("second revised manifest cannot overwrite exact committed revision",async()=>{
 const f=fixture();await run(f);
 const newer=[{...revised[0],sha256:"f".repeat(64)}];
 await assert.rejects(run(f,request({...body,revision_artifacts:newer})),
   /GALLERY_COMMIT_EXISTING_MANIFEST_CONFLICT/);
 assert.equal(f.stats.patches,1);
});
