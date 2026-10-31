import test from "node:test";
import assert from "node:assert/strict";
import {handoffApprovedReviewToFactory} from "./rendering-review-factory-handoff.mjs";
import {classifyFactoryLane} from "./factory-desk.mjs";
import {renderingReviewHoldPresent} from "./rendering-review-publication-hold.mjs";

const id="rec0uVrVeiUM6shp9",chicago="recT2rbKX3MF7cVFU";
const v1="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4";
const v2="1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up";
const attemptId="rrattempt_26054929500b8abe981e3f6131b5c668209bf9c765edb06c";
const sessionId="rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796";
const holdId="rrhold-64201956-6207-464a-8e9c-616974479c1c";
const url=f=>"https://drive.google.com/file/d/"+f+"/view";
const env={RENDERING_REVIEW_EXACT_OUTPUT_ID:"recVFaT3VnhCD3dcb",
 RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED:"true"};
const c=x=>structuredClone(x);
function fixture(){
 let session={
  schema:"studio.render-review.1",id:sessionId,output_id:id,
  profile_id:chicago,output_type:"Instagram Reel",
  state:"approved",version:12,original_do_not_publish:false,
  review_hold:{id:holdId,owner:sessionId,active:true},
  current_attempt_id:attemptId,approved_attempt_id:attemptId,
  attempts:[
   {id:"rroriginal_5db47c3f652bf0f80162c4e933cb8b7a913c92c8",
    number:1,artifact_id:v1,status:"ready_for_review"},
   {id:attemptId,number:2,artifact_id:v2,status:"ready_for_review"},
  ],
  processed:{},history:[],
 };
 let raw={id,fields:{
  Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
  Render_Status:"Rendered",Final_File_ID:v1,Final_File_URL:url(v1),
  Output_URL:url(v1),Auto_Publish_Enabled:true,Do_Not_Publish:true,
  Studio_Render_Review_Hold_Active:true,
  Studio_Render_Review_Hold_ID:holdId,
  Studio_Render_Review_Hold_Owner:sessionId,
  Studio_Render_Review_Session_ID:sessionId,
  Output_Status:"Ready for Review",Review_Status:"Review Sent",
  Publish_Status:"Not Ready",
 }};
 let independent={id:"recYRE3AL3iuc1qa6",fields:{
  Attempt_ID:attemptId,Session_ID:sessionId,Output_Record_ID:id,
  Attempt_Number:2,Attempt_Status:"ready_for_review",
  Artifact_File_ID:v2,Artifact_URL:url(v2),
  Validation_Evidence_JSON:JSON.stringify({
   sha256:"8ee06c1f0234959c5ff4610b020d6bb72a005200ffa5d6590d920754b3c0f77e",
   byte_count:21961807,mime_type:"video/mp4",width:1080,height:1920,
   audio_verified:true,watermark_verified:true,google_drive_verified:true,
   google_drive_mime_type:"video/mp4",render_job_id:"job-20261029042719-d8b6ef01"
  })
 }};
 let writes=0,saves=0,syncs=0,failStep="";
 const ops={
  withOutputLock:async (out,cb)=>{assert.equal(out,id);return cb()},
  readRawOutput:async()=>c(raw),
  readNormalizedOutput:async()=>({id,profile_id:chicago,
   platform:raw.fields.Platform,output_type:raw.fields.Platform_Output_Type}),
  readSession:async()=>c(session),readAttempt:async()=>c(independent),
  readField:(record,key)=>record.fields[key],
  saveSessionIfVersion:async ({expected_version,next})=>{
   assert.equal(session.version,expected_version);
   if(failStep==="session")throw Error("simulated interrupted session save");
   session=c(next);saves++;return true;
  },
  patchOutput:async(out,fields)=>{
   assert.equal(out,id);
   const releasing=Object.hasOwn(fields,"Do_Not_Publish");
   if(failStep==="release"&&releasing)throw Error("simulated release lost response");
   raw.fields={...raw.fields,...c(fields)};writes++;
  },
  syncOutput:async()=>{syncs++;return {ok:true}},
 };
 return {ops,env,independent,
  get raw(){return raw},get session(){return session},
  get writes(){return writes},get saves(){return saves},get syncs(){return syncs},
  fail:step=>{failStep=step},
  handoff:()=>handoffApprovedReviewToFactory({output_id:id,env,operations:ops}),
 };
}
function readyOutput(f){
 return {id,kind:"output",studio_state:"Ready for Review",
  output_status:f.raw.fields.Output_Status,
  review_status:f.raw.fields.Review_Status,
  publish_status:f.raw.fields.Publish_Status,render_status:"Rendered"};
}
test("real #8447 V2 creative approval becomes Factory Needs Eyes, never scheduled/published",async()=>{
 const f=fixture();
 const result=await f.handoff();
 assert.equal(result.ok,true);
 assert.equal(result.factory_ready,true);
 assert.equal(result.approved_for_publishing,false);
 assert.equal(result.scheduled,false);
 assert.equal(result.public_post_created,false);
 assert.equal(result.artifact_id,v2);
 assert.equal(f.raw.fields.Final_File_ID,v2);
 assert.equal(f.raw.fields.Final_File_URL,url(v2));
 assert.equal(f.raw.fields.Output_URL,url(v2));
 assert.equal(f.raw.fields.Do_Not_Publish,false);
 assert.equal(f.raw.fields.Auto_Publish_Enabled,false);
 assert.equal(f.raw.fields.Remotion_Job_ID,"job-20261029042719-d8b6ef01");
 assert.equal(f.raw.fields.Studio_Render_Review_Hold_Active,false);
 assert.equal(f.raw.fields.Studio_Render_Review_Hold_ID,"");
 assert.equal(f.raw.fields.Studio_Render_Review_Hold_Owner,"");
 assert.equal(f.raw.fields.Studio_Render_Review_Session_ID,"");
 assert.equal(f.raw.fields.Publish_Status,"Not Ready");
 assert.equal(f.raw.fields.Review_Status,"Review Sent");
 assert.equal(f.raw.fields.Output_Status,"Ready for Review");
 assert.equal(f.raw.fields.Scheduled_Post_Date,undefined);
 assert.equal(f.raw.fields.Publish_Started_At,undefined);
 assert.equal(f.raw.fields.Platform_Post_ID,undefined);
 assert.equal(renderingReviewHoldPresent(k=>f.raw.fields[k]),false);
 assert.equal(classifyFactoryLane(readyOutput(f)),"needs_eyes");
 assert.equal(f.session.review_hold.active,false);
 assert.equal(f.session.state,"approved");
 assert.equal(f.session.factory_handoff.original_artifact_id,v1);
 assert.equal(f.session.factory_handoff.artifact_id,v2);
 assert.equal(f.session.version,13);
 assert.equal(f.writes,2);
 assert.equal(f.saves,1);
 assert.equal(f.syncs,1);
});
test("repeated handoff does not mutate output or duplicate review event",async()=>{
 const f=fixture();await f.handoff();
 const priorWrites=f.writes,priorSaves=f.saves;
 const result=await f.handoff();
 assert.equal(result.already_transferred,true);
 assert.equal(f.writes,priorWrites);
 assert.equal(f.saves,priorSaves);
 assert.equal(f.session.version,13);
});
test("retry after asset selection interruption promotes only the original approved V2",async()=>{
 const f=fixture();f.fail("session");
 await assert.rejects(f.handoff(),/interrupted session save/);
 assert.equal(f.raw.fields.Final_File_ID,v2);
 assert.equal(f.raw.fields.Do_Not_Publish,true);
 assert.equal(f.raw.fields.Studio_Render_Review_Hold_Active,true);
 f.fail("");assert.equal((await f.handoff()).factory_ready,true);
 assert.equal(f.session.version,13);
});
test("retry after session write but before output unhold is resumable",async()=>{
 const f=fixture();f.fail("release");
 await assert.rejects(f.handoff(),/release lost response/);
 assert.equal(f.session.factory_handoff.artifact_id,v2);
 assert.equal(f.session.review_hold.active,false);
 assert.equal(f.raw.fields.Do_Not_Publish,true);
 f.fail("");
 assert.equal((await f.handoff()).already_transferred,true);
 assert.equal(f.raw.fields.Do_Not_Publish,false);
 assert.equal(f.session.version,13);
 assert.equal(f.saves,1);
});
test("inherited Do_Not_Publish or unrelated hold never released",async()=>{
 for(const mutate of [
  f=>f.session.original_do_not_publish=true,
  f=>f.raw.fields.Studio_Review_Hold_ID="different-hold",
  f=>f.raw.fields.Studio_Render_Review_Hold_Owner="different-owner",
 ]) {
  const f=fixture();
  if(mutate.toString().includes("original_do_not_publish")){
   f.ops.readSession=async()=>({...c(f.session),original_do_not_publish:true});
  }else if(mutate.toString().includes("Studio_Review_Hold_ID"))
   f.raw.fields.Studio_Review_Hold_ID="different-hold";
  else f.raw.fields.Studio_Render_Review_Hold_Owner="different-owner";
  await assert.rejects(f.handoff());
  assert.equal(f.writes,0);
  assert.equal(f.session.review_hold.active,true);
 }
});
test("stale V2, altered original or missing independent media QA denied",async()=>{
 const variants=[
  f=>{f.raw.fields.Final_File_ID="untrustedOtherFileId1234567890"},
  f=>{f.raw.fields.Published_At="2026-10-29T12:00:00.000Z"},
  f=>{f.raw.fields.Scheduled_Post_Date="2026-10-30T15:00:00.000Z"},
  f=>{const e=JSON.parse(f.independent.fields.Validation_Evidence_JSON);e.audio_verified=false;
   f.independent.fields.Validation_Evidence_JSON=JSON.stringify(e)},
  f=>{f.independent.fields.Artifact_File_ID=v1},
 ];
 for(const set of variants){
  const f=fixture();set(f);
  await assert.rejects(f.handoff());
  assert.equal(f.writes,0);
  assert.equal(f.saves,0);
 }
});
test("Airtable's omitted false checkbox remains valid after readback",async()=>{
 const f=fixture();
 const originalPatch=f.ops.patchOutput;
 f.ops.patchOutput=async(id,fields)=>{
  await originalPatch(id,fields);
  if(fields.Do_Not_Publish===false)delete f.raw.fields.Do_Not_Publish;
 };
 assert.equal((await f.handoff()).factory_ready,true);
});
test("wrong output denies and completed approval drains even if creative admissions are now off",async()=>{
 const f=fixture();
 await assert.rejects(()=>handoffApprovedReviewToFactory({
  output_id:"bad-id",env,operations:f.ops
 }),e=>e.code==="FACTORY_PILOT_SCOPE");
 // A different valid output ID must never inherit this record\'s approval.
 f.ops.withOutputLock=async (_output,callback)=>callback();
 await assert.rejects(()=>handoffApprovedReviewToFactory({
  output_id:"recAAAAAAAAAAAAAA",env,operations:f.ops
 }),e=>e.code==="FACTORY_SESSION_NOT_ELIGIBLE");
 // A previously approved session can safely drain after flags were disabled.
 const result=await handoffApprovedReviewToFactory({
  output_id:id,env:{...env,RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED:"false"},
  operations:f.ops
 });
 assert.equal(result.factory_ready,true);
 assert.equal(f.raw.fields.Do_Not_Publish,false);
});

test("independently validated 16:9 Vibe Cut returns to Factory without enabling publication",async()=>{
 const f=fixture(),p=f.session.profile_id;
 f.session.platform="YouTube";
 f.session.output_type="YouTube Video";
 f.raw.fields.Platform="YouTube";
 f.raw.fields.Platform_Output_Type="YouTube Video";
 f.session.plan={immutable_manifest:{
   schema:"studio.render-review.vibe.1",mode:"vibe_cut",
   source_kind:"video",output_id:id,profile_id:p,session_id:sessionId,
   human_intent:"explicit_button",voiceover:"off",narration:"",
   allow_public_publish:false,allow_platform_upload:false,auto_approve:false,
   aspect_ratio:"16:9"
 }};
 const proof=JSON.parse(f.independent.fields.Validation_Evidence_JSON);
 Object.assign(proof,{width:1920,height:1080,duration_seconds:20,
   music_only:true,voiceover_expected:false,
   watermark_profile_id:p,ready_for_publication:false});
 f.independent.fields.Validation_Evidence_JSON=JSON.stringify(proof);
 const receipt=await f.handoff();
 assert.equal(receipt.factory_ready,true);
 assert.equal(receipt.public_post_created,false);
 assert.equal(receipt.approved_for_publishing,false);
 assert.equal(f.raw.fields.Do_Not_Publish,false);
 assert.equal(f.raw.fields.Auto_Publish_Enabled,false);
});
