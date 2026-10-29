import test from "node:test";
import assert from "node:assert/strict";
import {repairExactReviewAudio} from "./rendering-review-audio-qa-repair.mjs";

const OUTPUT="rec0uVrVeiUM6shp9";
const SESSION="rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796";
const ATTEMPT="rrattempt_26054929500b8abe981e3f6131b5c668209bf9c765edb06c";
const JOB="rrjob_26054929500b8abe981e3f6131b5c668209bf9c765edb06c";
const V1="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4";
const OLD="1MgyPrgEDWUFwdX--uZamtK8_fvY7Nki3";
const NEW="1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up";
const secret="x".repeat(32);
const flags={
 RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET:secret,
 RENDERING_REVIEW_JOB_CLAIM_ENABLED:"true",
 RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED:"true",
 RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
 RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
 RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
 RENDERING_REVIEW_LAUNCH_LEDGER_ENABLED:"true",
 RENDERING_REVIEW_COMPLETION_ENABLED:"true",
};
function fixture(){
 let s={
   id:SESSION,output_id:OUTPUT,profile_id:"recT2rbKX3MF7cVFU",
   output_type:"Instagram Reel",state:"ready_for_review",
   version:10,review_hold:{active:true,id:"rrhold-existing",owner:SESSION},
   current_attempt_id:ATTEMPT,approved_attempt_id:null,active_job:null,
   history:[],attempts:[
     {id:"rroriginal_previous",number:1,status:"ready_for_review",artifact_id:V1},
     {id:ATTEMPT,number:2,status:"ready_for_review",artifact_id:OLD,job_id:JOB}
   ]
 };
 let attempt={record_id:"recYRE3AL3iuc1qa6",attempt_id:ATTEMPT,
   session_id:SESSION,output_id:OUTPUT,status:"ready_for_review",
   artifact_file_id:OLD};
 let verifiedCalls=0,patched=0,saved=0;
 const ops={
   withOutputLock:async(id,fn)=>{assert.equal(id,OUTPUT);return fn()},
   readSession:async()=>structuredClone(s),
   readHold:async()=>({verified:true,active:true,owner:SESSION,
                         id:"rrhold-existing",output_id:OUTPUT}),
   readOutput:async()=>({id:OUTPUT,profile_id:"recT2rbKX3MF7cVFU",
      platform:"Instagram",output_type:"Instagram Reel",
      do_not_publish:true,review_hold_active:true,final_file_id:V1}),
   readAttempt:async()=>({...attempt}),
   patchAttempt:async(id,fields)=>{
       assert.equal(id,"recYRE3AL3iuc1qa6");
       assert.equal(fields.Artifact_File_ID,NEW);
       assert.equal(JSON.parse(fields.Validation_Evidence_JSON).sha256,
         "8ee06c1f0234959c5ff4610b020d6bb72a005200ffa5d6590d920754b3c0f77e");
       attempt.artifact_file_id=NEW;patched++;
   },
   saveSessionIfVersion:async({output_id,expected_version,next})=>{
     assert.equal(output_id,OUTPUT);assert.equal(expected_version,s.version);
     assert.equal(next.version,s.version+1);
     s=structuredClone(next);saved++;return true;
   },
   verifyCorrectedMedia:async(params)=>{
     verifiedCalls++;
     assert.equal(params.file_id,NEW);
     assert.equal(params.previous_file_id,OLD);
     return true;
   }
 };
 function request(auth=true,body={confirm:"BIND-VERIFIED-AUDIO-ONLY"}){
  return new Request("https://studio.chicagoshining.com/api/internal/rendering-review/qa-audio-rebind",{
   method:"POST",headers:{"Content-Type":"application/json",
            "X-Rendering-Review-Job-Secret":auth?secret:"invalid"},
   body:JSON.stringify(body)
  });
 }
 return {ops,request,flags,state:()=>({s,attempt,verifiedCalls,patched,saved})};
}

test("exact held V2 audio correction performs zero render/publication calls and is replay-safe",async()=>{
 const x=fixture();
 const r=await repairExactReviewAudio({request:x.request(),env:x.flags,operations:x.ops});
 assert.equal(r.ok,true);
 assert.equal(r.public_post_created,false);
 assert.equal(r.original_preserved,true);
 assert.equal(r.artifact_id,NEW);
 assert.equal(x.state().patched,1);
 assert.equal(x.state().saved,1);
 assert.equal(x.state().s.attempts[0].artifact_id,V1);
 assert.equal(x.state().s.attempts[1].artifact_id,NEW);
 assert.equal(x.state().s.version,11);
 const second=await repairExactReviewAudio({request:x.request(),env:x.flags,operations:x.ops});
 assert.equal(second.replay,true);
 assert.equal(x.state().patched,1);
 assert.equal(x.state().saved,1);
});
test("no permission or proof, no mutation",async()=>{
 for(const variant of ["wrong-token","bad-intent","unverified-file","hold-lost","changed-v1","wrong-attempt"]){
  const x=fixture();
  if(variant==="unverified-file")x.ops.verifyCorrectedMedia=async()=>false;
  if(variant==="hold-lost")x.ops.readHold=async()=>({verified:true,active:false});
  if(variant==="changed-v1")x.ops.readOutput=async()=>({...await fixture().ops.readOutput(),final_file_id:"changed"});
  if(variant==="wrong-attempt")x.ops.readAttempt=async()=>({...await fixture().ops.readAttempt(),artifact_file_id:"other"});
  const request=x.request(variant!=="wrong-token",
    variant==="bad-intent"?{confirm:"PUBLISH-NOW"}:undefined);
  await assert.rejects(repairExactReviewAudio({request,env:x.flags,operations:x.ops}));
  assert.equal(x.state().patched,0,variant);
  assert.equal(x.state().saved,0,variant);
 }
});
test("no general scope or publishing gates",async()=>{
 const x=fixture();
 await assert.rejects(repairExactReviewAudio({request:x.request(),
   env:{...x.flags,RENDERING_REVIEW_COMPLETION_ENABLED:"false"},
   operations:x.ops}),/QA_REPAIR_DISABLED/);
 assert.equal(x.state().patched,0);
});
