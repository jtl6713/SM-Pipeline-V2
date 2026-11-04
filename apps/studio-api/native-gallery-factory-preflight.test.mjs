import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {inspectNativeGalleryFactoryPreflight as inspect}
  from "./native-gallery-factory-preflight.mjs";

const O="rec00000000000001",P="rec00000000000002";
const C="rec00000000000003",S1="rec00000000000004";
const S2="rec00000000000005",ACTOR="rec00000000000006";
const J="ngjob_0123456789012345678901";
const hex=s=>createHash("sha256").update(s).digest("hex");
const env={NATIVE_GALLERY_FACTORY_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED:"true",
 NATIVE_GALLERY_REVISED_VERIFY_ENABLED:"true"};
const auth={authenticated:true,authorized:true,
 permissions:{outputs_review:true},authorized_profile_ids:[P]};
const original=[S1,S2].map((slot_id,i)=>({
 slot_id,order:i+1,output_id:O,profile_id:P,content_item_id:C,
 drive_file_id:"original_gallery_drive_file_"+(i+1)+"_12345678",
 sha256:String(i+1).repeat(64),mime_type:"image/png",byte_count:2048,
 width:1080,height:1350,rights_verified:true,watermark_verified:true
}));
const revised=[{...original[0],drive_file_id:"new_gallery_revision_drive_123456789",
 sha256:"c".repeat(64),revision_media_asset_id:"rec00000000000007"},
 {...original[1]}];
const plan={schema:"studio.native-gallery.job.1",output_id:O,
 profile_id:P,content_item_id:C,original_manifest_sha256:"d".repeat(64),
 selected:[{slide_id:S1,order:1,instruction:"Lighten the first skyline photograph."}],
 unchanged:[{slide_id:S2,order:2}],
 allow_public_publish:false,auto_approve:false,
 mutate_original_production_request:false,mutate_sibling_outputs:false,
 human_intent:"explicit_button"};
function fixture(){
 const out={id:O,fields:{Content_Item:[C],
  Platform_Output_Type:"IG Carousel",Do_Not_Publish:true,
  Studio_Render_Review_Hold_Active:true,
  Studio_Render_Review_Hold_ID:"gallery_hold_1234",
  Studio_Render_Review_Hold_Owner:"gallery_owner_1234",
  Studio_Render_Review_Session_ID:"gallery_owner_1234"}};
 const job={id:"rec00000000000008",fields:{
  Job_ID:J,Output_Record_ID:O,Profile_Record_ID:P,
  Content_Item_Record_ID:C,Creative_Decision_Actor:ACTOR,
  Job_State:"creative_accepted",Creative_Decision:"accepted",
  Row_Version:5,Hold_ID:"gallery_hold_1234",
  Hold_Owner:"gallery_owner_1234",Plan_SHA256:hex(JSON.stringify(plan)),
  Original_Manifest_SHA256:"d".repeat(64),
  Revised_Manifest_SHA256:hex(JSON.stringify(revised)),
  Plan_JSON:JSON.stringify(plan),Original_Manifest_JSON:JSON.stringify(original),
  Revised_Manifest_JSON:JSON.stringify(revised)}};
 const content={id:C,fields:{Content_Profile:[P]}};
 const calls={outputs:0,jobs:0,drive:0};
 const ops={
  readOutput:async()=>{calls.outputs++;return out},
  readJob:async()=>{calls.jobs++;return job},
  readContent:async()=>content,
  verifyDrive:async()=>{calls.drive++;return true},
 };
 return {out,job,content,calls,ops};
}
function run(f,options={}){
 return inspect({request:new Request("https://studio.test/api/factory/review"),
  env,authorization:auth,output_id:O,job_id:J,operations:f.ops,...options});
}
test("held creative-accepted V2 is independently verified and privately previewable, not publishable",async()=>{
 const f=fixture(),result=await run(f);
 assert.equal(result.ok,true);
 assert.equal(result.ready_for_factory_review,true);
 assert.equal(result.handoff_performed,false);
 assert.equal(result.factory_approved,false);
 assert.equal(result.publication_authorized,false);
 assert.equal(result.can_publish,false);
 assert.equal(result.hold_active,true);
 assert.equal(result.slides.length,2);
 assert.deepEqual(result.slides.map(x=>x.changed),[true,false]);
 assert.equal(result.slides[0].order,1);
 assert.match(result.slides[0].original_preview,/\/original$/);
 assert.match(result.slides[0].revised_preview,/\/revised$/);
 assert.equal(JSON.stringify(result).includes("drive_file_id"),false);
 assert.equal(JSON.stringify(result).includes("new_gallery_revision_drive"),false);
 assert.equal(f.calls.drive,1);
 assert.equal(f.calls.outputs,2);
 assert.equal(f.calls.jobs,2);
});
test("disabled flag, wrong method or viewer never reads Airtable or Drive",async()=>{
 for(const changes of [
  {env:{...env,NATIVE_GALLERY_FACTORY_PREFLIGHT_ENABLED:"false"}},
  {env:{...env,NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED:"false"}},
  {request:new Request("https://studio.test/",{method:"POST"})},
  {authorization:{...auth,authorized_profile_ids:[]}},
  {authorization:{...auth,authenticated:false}},
  {output_id:"bad"},
 ]) {
  const f=fixture();
  await assert.rejects(run(f,changes));
  // Foreign profile is checked only after an authoritative record read.
  if(changes.authorization?.authorized_profile_ids?.length===0)
   assert.equal(f.calls.drive,0);
  else if(changes.authorization?.authenticated!==false)
   assert.equal(f.calls.outputs,0);
 }
});
test("reject scheduled, published, foreign, lost-hold, or wrong-format originals",async()=>{
 for(const change of [
  f=>f.out.fields.Do_Not_Publish=false,
  f=>f.out.fields.Auto_Publish_Enabled=true,
  f=>f.out.fields.Studio_Render_Review_Hold_Active=false,
  f=>f.out.fields.Studio_Render_Review_Session_ID="other_session_123456",
  f=>f.out.fields.Platform_Output_Type="Instagram Reel",
  f=>f.out.fields.Studio_Scheduled_At="2027-01-03T16:00:00Z",
  f=>f.out.fields.Publish_Started_At="2026-11-04T15:00:00Z",
  f=>f.out.fields.Platform_Post_ID="published",
  f=>f.content.fields.Content_Profile=["rec99999999999999"],
  f=>f.job.fields.Job_State="ready_for_review",
  f=>f.job.fields.Creative_Decision="rejected",
  f=>f.job.fields.Row_Version=4,
 ]) {
  const f=fixture();change(f);
  await assert.rejects(run(f));
  assert.equal(f.calls.drive,0);
 }
});
test("reject forged source and selected-only media manifest",async()=>{
 for(const change of [
  f=>f.job.fields.Revised_Manifest_SHA256="a".repeat(64),
  f=>f.job.fields.Plan_SHA256="a".repeat(64),
  f=>f.job.fields.Revised_Manifest_JSON=JSON.stringify(original),
  f=>f.job.fields.Revised_Manifest_JSON=JSON.stringify([
   revised[0],{...revised[1],sha256:"f".repeat(64)}]),
  f=>f.job.fields.Revised_Manifest_JSON=JSON.stringify([
   {...revised[0],revision_media_asset_id:null},revised[1]]),
  f=>f.job.fields.Revised_Manifest_JSON=JSON.stringify([
   {...revised[0],profile_id:"rec99999999999999"},revised[1]]),
  f=>f.job.fields.Plan_JSON=JSON.stringify({...plan,allow_public_publish:true}),
 ]) {
  const f=fixture();change(f);
  await assert.rejects(run(f));
  assert.equal(f.calls.drive,0);
 }
});
test("failed or ambiguous independent Drive verification never produces ready packet",async()=>{
 const f=fixture();
 f.ops.verifyDrive=async()=>{f.calls.drive++;return false};
 await assert.rejects(run(f),/GALLERY_FACTORY_DRIVE_REVERIFICATION_FAILED/);
 assert.equal(f.calls.drive,1);
});
test("state/schedule/manifest changes during remote verification fail closed",async()=>{
 for(const alter of [
  f=>f.out.fields.Studio_Scheduled_At="2027-01-02T22:00:00Z",
  f=>f.out.fields.Studio_Render_Review_Hold_Active=false,
  f=>f.job.fields.Row_Version=6,
  f=>f.job.fields.Revised_Manifest_JSON="{}",
  f=>f.content.fields.Content_Profile=["rec99999999999999"],
 ]) {
  const f=fixture();
  f.ops.verifyDrive=async()=>{alter(f);return true};
  await assert.rejects(run(f),/GALLERY_FACTORY_REVIEW_CHANGED_DURING_VERIFICATION/);
 }
});
