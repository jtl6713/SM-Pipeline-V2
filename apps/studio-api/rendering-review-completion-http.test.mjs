import test from "node:test";
import assert from "node:assert/strict";
import {completeReviewAttempt} from "./rendering-review-completion-http.mjs";
const output="rec0uVrVeiUM6shp9";
const sessionId="rrsession_abcdef0123456789";
const attemptId="rrattempt_abcdef0123456789";
const jobId="rrjob_abcdef0123456789";
const holdId="rrhold_abcdef0123456789";
const fileId="1CAh-mGGiCiv7WKUl9jNeqm1vyQF7PTzq";
const planHash="a".repeat(64);
const secret="test-review-worker-secret-at-least-24-chars";
const env={RENDERING_REVIEW_COMPLETION_ENABLED:"true",
  RENDERING_REVIEW_LAUNCH_LEDGER_ENABLED:"true",
  RENDERING_REVIEW_JOB_CLAIM_ENABLED:"true",
  RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET:secret};
const fields={output_id:output,job_id:jobId,attempt_id:attemptId,
  plan_hash:planHash,lease_owner:"rrrunner_abcdef0123456789",lease_fence:1};
const intent={kind:"review_remotion_launch_intent",...fields,payload_hash:"b".repeat(64)};
const receipt={kind:"review_remotion_launch_receipt",...fields,payload_hash:"b".repeat(64),
  remotion_job_id:"remotion_abcdef0123456789",
  status_url:"https://render.chicagoshining.com/status/remotion_abcdef0123456789"};
const proof={sha256:"c".repeat(64),byte_count:1500000,mime_type:"video/mp4",
  width:1080,height:1920,duration_seconds:13.8,
  audio_verified:true,watermark_verified:true,google_drive_verified:true,
  google_drive_mime_type:"video/mp4",
  render_job_id:receipt.remotion_job_id,
  watermark_profile_id:"recT2rbKX3MF7cVFU",watermark_frame_sample_count:3};
function scenario({missingHold=false,alreadyDispatched=false}={}){
  const session={id:sessionId,output_id:output,
    profile_id:"recT2rbKX3MF7cVFU",output_type:"Instagram Reel",
    state:"queued",review_hold:{id:holdId,owner:sessionId,active:true},
    current_attempt_id:attemptId,
    active_job:{id:jobId,attempt_id:attemptId,plan_hash:planHash},
    attempts:[{id:attemptId,status:"queued",artifact_id:null}]};
  const job={record_id:"recJobValue000001",job_id:jobId,
    session_id:sessionId,output_id:output,attempt_id:attemptId,
    plan_hash:planHash,state:"claimed",lease_owner:fields.lease_owner,
    lease_fence:1,event_history_json:JSON.stringify([intent,receipt])};
  const attempt={record_id:"recAttValue000001",attempt_id:attemptId,
    session_id:sessionId,output_id:output,status:"queued",artifact_file_id:""};
  const original={id:output,profile_id:session.profile_id,platform:"Instagram",
    output_type:"Instagram Reel",do_not_publish:true,review_hold_active:true,
    ...(alreadyDispatched?{platform_media_id:"meta-preexisting-id"}:{})};
  const hold={verified:true,id:holdId,output_id:output,owner:sessionId,active:!missingHold};
  let originalMutation=0;
  const operations={
    withOutputLock:async(_id,fn)=>fn(),
    readSession:async()=>structuredClone(session),readHold:async()=>structuredClone(hold),
    readOutput:async()=>structuredClone(original),readJob:async()=>structuredClone(job),
    readAttempt:async()=>structuredClone(attempt),
    patchJob:async(_id,changes)=>{
      if(changes.Job_State)job.state=changes.Job_State;
    },
    patchAttempt:async(_id,changes)=>{
      if(changes.Attempt_Status)attempt.status=changes.Attempt_Status;
      if(changes.Artifact_File_ID)attempt.artifact_file_id=changes.Artifact_File_ID;
    },
    applyEvent:async(_output,event)=>{
      if(event.type==="RENDER_STARTED")session.state="rendering";
      if(event.type==="RENDER_VALIDATING")session.state="validating";
      if(event.type==="RENDER_READY"){
        session.state="ready_for_review";
        session.attempts[0].status="ready_for_review";
        session.attempts[0].artifact_id=event.artifact_id;
        session.active_job=null;
      } else session.attempts[0].status=session.state;
      return {session:structuredClone(session)};
    },
  };
  const call=async(stage,auth=secret,extra={})=>
    completeReviewAttempt({env,operations,request:new Request(
      "https://studio.invalid/internal/rendering-review/complete-attempt",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-Rendering-Review-Job-Secret":auth},
      body:JSON.stringify({...fields,stage,
        ...(stage==="ready"?{artifact_id:fileId,validation:proof}:{}),
        ...extra})})});
  return {call,state:()=>({session,job,attempt,original,hold,originalMutation})};
}
test("one claimed job advances through real-ready event without original output edits",async()=>{
  const s=scenario();
  assert.equal((await s.call("started")).stage,"started");
  assert.equal((await s.call("validating")).stage,"validating");
  const ready=await s.call("ready");
  assert.equal(ready.artifact_id,fileId);
  assert.equal(ready.public_post_created,false);
  assert.equal(s.state().session.attempts[0].artifact_id,fileId);
  assert.equal(s.state().job.state,"succeeded");
  assert.equal(s.state().attempt.artifact_file_id,fileId);
  assert.equal(s.state().original.platform_media_id,undefined);
  assert.equal(s.state().originalMutation,0);
  assert.equal((await s.call("ready")).replay,true);
});
test("hold loss, prior Meta dispatch and wrong Runner secret fail closed",async()=>{
  await assert.rejects(scenario({missingHold:true}).call("started"),
    {code:"RENDER_AUTHORITY_CHANGED"});
  await assert.rejects(scenario({alreadyDispatched:true}).call("started"),
    {code:"RENDER_AUTHORITY_CHANGED"});
  await assert.rejects(scenario().call("started","wrong-secret"),
    {code:"RENDER_CALLBACK_UNAUTHORIZED"});
});
test("no acceptance without real vertical MP4 audio, watermark and Drive checks",async()=>{
  const s=scenario();await s.call("started");await s.call("validating");
  await assert.rejects(s.call("ready",secret,{
    validation:{...proof,watermark_verified:false},
  }),{code:"RENDER_NOT_VALIDATED"});
  assert.equal(s.state().session.state,"validating");
});

test("music-only 16:9 Vibe Cut completion requires verified profile logo and frozen plan",async()=>{
  const s=scenario(),state=s.state(),profile=state.session.profile_id;
  state.session.platform="YouTube";
  state.session.output_type="YouTube Video";
  state.original.platform="YouTube";
  state.original.output_type="YouTube Video";
  state.session.plan={immutable_manifest:{
    schema:"studio.render-review.vibe.1",mode:"vibe_cut",source_kind:"video",
    output_id:output,profile_id:profile,session_id:sessionId,
    human_intent:"explicit_button",voiceover:"off",narration:"",
    allow_platform_upload:false,allow_public_publish:false,auto_approve:false,
    aspect_ratio:"16:9",
  }};
  await s.call("started");await s.call("validating");
  const approved={...proof,width:1920,height:1080,duration_seconds:16,
    music_only:true,voiceover_expected:false,
    watermark_profile_id:profile,ready_for_publication:false};
  await assert.rejects(s.call("ready",secret,{
    validation:{...approved,watermark_profile_id:"recF7UAn0LkMZZrWZ"}
  }),{code:"RENDER_NOT_VALIDATED"});
  assert.equal(state.session.state,"validating");
  const ready=await s.call("ready",secret,{validation:approved});
  assert.equal(ready.stage,"ready");
  assert.equal(state.session.state,"ready_for_review");
  assert.equal(state.original.platform_post_id,undefined);
});
