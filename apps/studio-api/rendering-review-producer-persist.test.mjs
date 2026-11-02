import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {enrollReview,applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {persistReviewProducerCandidate as persist,producerConversationWritesEnabled as enabled}
  from "./rendering-review-producer-persist.mjs";

const output_id="recA1B2C3D4E5F6G7";
const user_id="recU1S2E3R4I5D6A7";
const auth={authenticated:true,authorized:true,permissions:{outputs_review:true},
  user:{record_id:user_id}};
const flags={
  RENDERING_REVIEW_PRODUCER_WRITES_ENABLED:"true",
  RENDERING_REVIEW_PRODUCER_BRIDGE_ENABLED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
};
const direction="Explain how a viewer chooses the correct train and keep the opening.";
const candidate={explanation:"The existing narration does not explain how to choose a route.",
  narration:"Choose a destination, determine the direction, and read the station sign.",
  preserve:["Existing opening"],changes:["Add example route"],reuse_asset_ids:[],
  timeline:[{start_seconds:0,end_seconds:20,direction:"Walk through the steps",asset_ids:[]}],
  requirements:[{description:"Verify official route instructions",kind:"research",alternatives:["Use a simpler diagram"]}],
  claims:[],acceptance_checks:["Explanation includes choosing a destination and direction"]};
const proposal={candidate_only:true,requires_fact_validation:true,
  visual_inspection_performed:false,candidate_hash:"a".repeat(64),
  evidence_hash:"b".repeat(64),candidate};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const hold={id:"rrhold-12345678",owner:"rrsession-12345678",
    output_id,active:true,verified:true};
  let session=enrollReview({id:output_id,profile_id:CHICAGO_PROFILE_ID,
    platform:"Instagram",output_type:"Instagram Reel",render_status:"Rendered",
    final_file_id:"original-12345678"},hold,{
    enabled:true,profile_ids:[CHICAGO_PROFILE_ID],
    output_types:["Instagram Reel"],manual_admission:true},{
    session_id:hold.owner,original_attempt_id:"original-12345678",
  });
  let saves=0;
  const operations={
    authorizeReview:async id=>id===output_id,
    authorizeEvent:async(_id,event)=>event.type==="PRODUCER_CANDIDATE",
    withOutputLock:async(_id,fn)=>fn(),
    loadSession:async()=>clone(session),
    readHold:async()=>clone(hold),
    readSession:async()=>clone(session),
    saveSessionIfVersion:async({expected_version,next})=>{
      if(session.version!==expected_version)return false;
      session=clone(next);saves++;return true;
    },
  };
  const send=(override={})=>persist({env:flags,output_id,expected_version:1,
    client_request_id:"review-client-request-123",direction,proposal,
    authorization:auth,operations,now:()=>new Date("2026-10-28T13:22:00Z"),
    ...override});
  return {send,operations,hold,get session(){return session;},
    get saves(){return saves;},setSession(x){session=clone(x);}};
}
test("all six deployment gates default off, including bridge and shared dispatch",async()=>{
  const f=fixture();assert.equal(enabled({}),false);
  for(const name of Object.keys(flags)){
    const env={...flags};delete env[name];assert.equal(enabled(env),false);
    await assert.rejects(()=>f.send({env}),e=>e.status===405);
  }
  assert.equal(f.saves,0);
});
test("trusted model reply and user direction persist as one versioned event",async()=>{
  const f=fixture();
  const result=await f.send();
  assert.equal(result.persisted,true);assert.equal(result.render_queued,false);
  assert.equal(result.authorization,"none");assert.equal(result.session_version,2);
  assert.equal(f.session.state,"discussing");
  assert.equal(f.session.messages.length,2);
  assert.deepEqual(f.session.messages.map(m=>m.role),["user","producer"]);
  assert.equal(f.session.messages[0].content,direction);
  assert.equal(f.session.messages[1].content,candidate.explanation);
  assert.equal(f.session.producer_candidate.hash,proposal.candidate_hash);
  assert.equal(f.session.producer_candidate.ready_to_commit,false);
  assert.equal(f.session.review_hold.active,true);
  assert.equal(f.session.approved_attempt_id,null);
  assert.equal(f.session.plan,null);
  assert.equal(f.session.active_job,null);
  assert.equal(f.saves,1);
  const replay=await f.send();
  assert.equal(replay.replay,true);assert.equal(f.saves,1);
  assert.equal(f.session.messages.length,2);
});
test("a different client request after current version change cannot write stale reply",async()=>{
  const f=fixture();
  await f.send();
  await assert.rejects(()=>f.send({client_request_id:"another-client-request-123"}),
    e=>e.code==="STALE_SESSION");
  assert.equal(f.saves,1);
});
test("client-supplied permission and model-validation claims cannot persist",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send({authorization:{...auth,permissions:{}}}),e=>e.status===403);
  await assert.rejects(()=>f.send({authorization:{...auth,user:{record_id:"fake"}}}),e=>e.status===403);
  await assert.rejects(()=>f.send({proposal:{...proposal,requires_fact_validation:false}}),e=>e.status===502);
  await assert.rejects(()=>f.send({proposal:{...proposal,visual_inspection_performed:true}}),e=>e.status===502);
  assert.equal(f.saves,0);
});
test("hold identity and session state cannot be bypassed",async()=>{
  const f=fixture();
  f.hold.active=false;
  await assert.rejects(()=>f.send(),e=>e.code==="HOLD_NOT_VERIFIED");
  assert.equal(f.saves,0);
});
test("later human feedback marks the previous model candidate stale",async()=>{
  const f=fixture();
  await f.send();
  const changed=applyReviewEvent(f.session,{
    type:"MESSAGE",role:"user",content:"Please add a clearer graphic",
    message_id:"rruser-later-message-123",idempotency_key:"rrfeedback-later-123",
    fingerprint:"rrfp-feedback-later-123",expected_version:2,
    at:"2026-10-28T13:23:00Z"});
  assert.equal(changed.session.producer_candidate.stale,true);
  assert.equal(changed.session.active_job,null);
  assert.equal(changed.session.review_hold.active,true);
});
test("Worker mounts persisted Producer route without any render or approval mutation",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const start=worker.indexOf("const conversationMatch = ");
  const stop=worker.indexOf("const proposalMatch = ",start);
  assert.ok(start>0&&stop>start);
  const route=worker.slice(start,stop);
  assert.match(route,/producerConversationWritesEnabled\(env\)/);
  assert.match(route,/reviewAuthorizedProfiles\(env, authorization\)/);
  assert.match(route,/handleReviewProducerProposal/);
  assert.match(route,/persistReviewProducerCandidate/);
  assert.match(route,/mutationGate: true/);
  assert.doesNotMatch(route,/graph\.publish\(|approveOutputRecordForPublishing|RELEASE_REVIEW_HOLD|COMMIT_PLAN/);
});

test("explicit edits reuse already saved reviewer feedback instead of duplicating it",async()=>{
  const f=fixture();
  const session=f.session;
  session.state="discussing";session.version=2;
  session.messages.push({id:"rrm_saved1234567890",role:"user",content:direction,
    at:"2026-10-28T13:21:00Z",attempt_id:session.current_attempt_id});
  f.setSession(session);
  const result=await f.send({expected_version:2});
  assert.equal(result.persisted,true);
  assert.equal(result.render_queued,false);
  assert.equal(f.session.messages.length,2);
  assert.deepEqual(f.session.messages.map(x=>x.role),["user","producer"]);
  assert.equal(f.session.messages[0].content,direction);
  assert.equal(f.session.review_hold.active,true);
  assert.equal(f.session.active_job,null);
});
