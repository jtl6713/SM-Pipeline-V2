import test from "node:test";
import assert from "node:assert/strict";
import {enrollReview,applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {commitReviewAttempt as commit,renderAttemptCommitEnabled as enabled}
  from "./rendering-review-attempt-outbox.mjs";

const OUTPUT_ID="recA1B2C3D4E5F6G7";
const SOURCE="drive-master-123";
const CANDIDATE_HASH="a".repeat(64);
const PLAN_HASH="b".repeat(64);
const flags={
  RENDERING_REVIEW_ATTEMPT_COMMIT_ENABLED:"true",
  RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
};
const auth={authenticated:true,authorized:true,permissions:{outputs_review:true},
  user:{record_id:"recU1S2E3R4I5D6A7"}};
const clone=x=>structuredClone(x);
function step(s,type,other){
  return applyReviewEvent(s,{type,expected_version:s.version,
    idempotency_key:"rrtest_"+type+"_"+s.version,
    fingerprint:"rrfp_test_"+type+"_"+s.version,
    at:"2026-10-28T15:00:00Z",...other}).session;
}
function session(){
  const hold={id:"rrhold_12345678",owner:"rrsession_12345678",
    output_id:OUTPUT_ID,verified:true,active:true};
  let s=enrollReview({id:OUTPUT_ID,profile_id:CHICAGO_PROFILE_ID,
    platform:"Instagram",output_type:"Instagram Reel",render_status:"Rendered",
    final_file_id:SOURCE},hold,{enabled:true,
      profile_ids:[CHICAGO_PROFILE_ID],output_types:["Instagram Reel"],
      manual_admission:true},{session_id:hold.owner,original_attempt_id:"original_12345678"});
  const candidate={explanation:"Add a missing example",narration:"A longer narration",
    changes:["Add one example"],preserve:[],reuse_asset_ids:[],
    timeline:[{start_seconds:0,end_seconds:30,direction:"Add a shot",asset_ids:[]}],
    requirements:[],claims:[],acceptance_checks:["Explanation is present"]};
  s=step(s,"PRODUCER_CANDIDATE",{
    direction:"Add example",summary:"Add a worked example",
    user_message_id:"rruser_12345678",producer_message_id:"rrmodel_12345678",
    candidate,candidate_hash:CANDIDATE_HASH,evidence_hash:"c".repeat(64),
  });
  const manifest={
    source_attempt_id:s.current_attempt_id,
    source_artifact_id:SOURCE,source_drive_file_id:SOURCE,
    output_id:OUTPUT_ID,profile_id:CHICAGO_PROFILE_ID,
    candidate_hash:CANDIDATE_HASH,media_authority:"google_drive",
    allow_public_publish:false,allow_platform_upload:false,
    auto_approve:false,mutate_original_production_request:false,
    mutate_sibling_outputs:false,asset_manifest:[],creative:{narration:"Longer"},
  };
  s=step(s,"PROPOSE_PLAN",{
    plan_version:1,plan_hash:PLAN_HASH,frozen:true,
    missing_assets:[],acceptance_checks:["Example narrated"],
    immutable_manifest:manifest,
  });
  return {s,hold,manifest};
}
function fixture({failJobOnce=false}={}){
  const start=session();let saved=clone(start.s),holds=clone(start.hold);
  let output={id:OUTPUT_ID,profile_id:CHICAGO_PROFILE_ID,
    output_type:"Instagram Reel",platform:"Instagram",
    final_file_id:SOURCE,do_not_publish:true,review_hold_active:true,
    publish_status:"Not Ready"};
  const plans=new Map(),attempts=new Map(),jobs=new Map();
  let writes=0,lockCalls=0,fail=failJobOnce;
  const ops={
    authorizeReview:async()=>true,
    withOutputLock:async(_id,fn)=>{lockCalls++;return fn()},
    loadSession:async()=>clone(saved),
    readSession:async()=>clone(saved),
    readHold:async()=>clone(holds),
    readOutput:async()=>clone(output),
    saveSessionIfVersion:async({expected_version,next})=>{
      if(saved.version!==expected_version)return false;
      saved=clone(next);writes++;return true;
    },
    upsertPlanIfAbsent:async p=>{if(!plans.has(p.plan_id))plans.set(p.plan_id,clone(p))},
    upsertAttemptIfAbsent:async a=>{if(!attempts.has(a.attempt_id))attempts.set(a.attempt_id,clone(a))},
    upsertJobIfAbsent:async j=>{
      if(fail){fail=false;throw new Error("Job table temporarily unavailable")}
      if(!jobs.has(j.job_id))jobs.set(j.job_id,clone(j));
    },
    readPlan:async id=>clone(plans.get(id)||null),
    readAttempt:async id=>clone(attempts.get(id)||null),
    readJob:async id=>clone(jobs.get(id)||null),
  };
  const send=(opts={})=>commit({
    env:flags,authorization:auth,operations:ops,
    output_id:OUTPUT_ID,expected_version:3,plan_version:1,
    plan_hash:PLAN_HASH,client_request_id:"commit_client_12345678",
    now:()=>new Date("2026-10-28T15:00:00Z"),
    ...opts,
  });
  return {send,ops,plans,attempts,jobs,
    get saved(){return saved},get writes(){return writes},
    get lockCalls(){return lockCalls},
    setOutput(x){output={...output,...x}},
    setHold(x){holds={...holds,...x}},
    replaceSession(x){saved=x}};
}
test("every protected flag is required; no source or record mutation when disabled",async()=>{
  assert.equal(enabled({}),false);
  for(const key of Object.keys(flags)){
    const f=fixture();const env={...flags};delete env[key];
    await assert.rejects(()=>f.send({env}),e=>e.status===405);
    assert.equal(f.writes,0);assert.equal(f.lockCalls,0);
  }
});
test("explicit commit reserves one attempt and durable plan/attempt/job outbox",async()=>{
  const f=fixture();
  const result=await f.send();
  assert.equal(result.ok,true);
  assert.equal(result.replay,false);
  assert.equal(result.attempt_number,2);
  assert.equal(result.job_state,"queued");
  assert.equal(result.render_started,false);
  assert.equal(result.publish_approved,false);
  assert.equal(result.public_post_created,false);
  assert.equal(f.saved.current_attempt_id,result.attempt_id);
  assert.equal(f.saved.active_job.id,result.job_id);
  assert.equal(f.saved.review_hold.active,true);
  assert.equal(f.saved.state,"queued");
  assert.equal(f.plans.size,1);
  assert.equal(f.attempts.size,1);
  assert.equal(f.jobs.size,1);
  assert.equal(f.writes,1);
  const replay=await f.send();
  assert.equal(replay.replay,true);
  assert.equal(f.writes,1);
  assert.equal(f.jobs.size,1);
  assert.equal(f.attempts.size,1);
});
test("partial outbox failure is recovered by identical retry, never new attempt",async()=>{
  const f=fixture({failJobOnce:true});
  await assert.rejects(()=>f.send(),/temporarily unavailable/);
  assert.equal(f.saved.state,"queued");
  assert.equal(f.saved.active_job.id.startsWith("rrjob_"),true);
  assert.equal(f.attempts.size,1);
  assert.equal(f.jobs.size,0);
  const repaired=await f.send();
  assert.equal(repaired.replay,true);
  assert.equal(f.writes,1);
  assert.equal(f.jobs.size,1);
  assert.equal(f.attempts.size,1);
});
test("stale session, different request and unowned hold cannot create a new job",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send({expected_version:2}),e=>e.code==="STALE_SESSION");
  await assert.rejects(()=>f.send({authorization:{...auth,permissions:{}}}),e=>e.status===403);
  f.setHold({active:false});
  await assert.rejects(()=>f.send(),e=>e.code==="REVIEW_HOLD_LOST");
  assert.equal(f.jobs.size,0);assert.equal(f.writes,0);
});
test("publication ownership, stale Drive source and untrusted plan safety bits deny",async()=>{
  const x=fixture();
  x.setOutput({publish_locked_by:"AP1-IG"});
  await assert.rejects(()=>x.send(),e=>e.code==="OUTPUT_NOT_HELD");
  assert.equal(x.jobs.size,0);
  const y=fixture();
  y.setOutput({final_file_id:"overwritten-master"});
  await assert.rejects(()=>y.send(),e=>e.code==="SOURCE_CHANGED");
  const z=fixture();
  const s=clone(z.saved);
  s.plan.immutable_manifest.allow_platform_upload=true;
  z.replaceSession(s);
  await assert.rejects(()=>z.send(),e=>e.code==="PLAN_NOT_VERIFIED");
  assert.equal(z.writes,0);
});
test("model messages cannot masquerade as explicit commit identity",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send({client_request_id:""}),e=>e.status===400);
  await assert.rejects(()=>f.send({plan_hash:"notsha"}),e=>e.status===400);
  assert.equal(f.jobs.size,0);
});
