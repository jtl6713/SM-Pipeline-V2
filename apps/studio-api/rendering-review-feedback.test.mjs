import test from "node:test";
import assert from "node:assert/strict";
import { submitManualReviewFeedback as send } from "./rendering-review-feedback.mjs";
import { enrollReview, REVIEW_SCHEMA, CHICAGO_PROFILE_ID } from "./rendering-review-policy.mjs";

const output_id = "recA1B2C3D4E5F6G7";
const policy = {enabled:true,profile_ids:[CHICAGO_PROFILE_ID],
  output_types:["Instagram Reel"],manual_admission:true};
const original = {
  id:output_id,profile_id:CHICAGO_PROFILE_ID,output_type:"Instagram Reel",
  platform:"Instagram",render_status:"Rendered",final_file_id:"file-12345678",
};
const hold = {id:"rrhold-12345678",output_id,owner:"rrsession-12345678",verified:true};
const jsonCopy = x => JSON.parse(JSON.stringify(x));
function setup(){
  let persisted = enrollReview(original,hold,policy,{
    session_id:hold.owner,original_attempt_id:"original-12345678",
  });
  const counts={writes:0,authorized:0,events:0,locks:0};
  let actor={id:"studio-user-12345678",authenticated:true,authorized:true,
    permissions:{outputs_review:true}};
  let held=true;
  const operations={
    getAuthenticatedActor:async()=>actor,
    authorizeReview:async id=>{counts.authorized++;return id===output_id;},
    authorizeEvent:async (id,event)=>{
      counts.events++;
      return id===output_id && event.type==="MESSAGE" && event.role==="user" &&
        event.idempotency_key.startsWith("rrmsg_") && event.fingerprint.startsWith("rrfp_");
    },
    withOutputLock:async(id,fn)=>{counts.locks++;assert.equal(id,output_id);return fn();},
    loadSession:async()=>jsonCopy(persisted),
    saveSessionIfVersion:async({expected_version,next})=>{
      if(persisted.version!==expected_version)return false;
      persisted=jsonCopy(next);counts.writes++;return true;
    },
    readSession:async()=>jsonCopy(persisted),
    readHold:async()=>({...hold,active:held}),
  };
  return {
    operations,counts,
    get saved(){return persisted;},
    setActor(value){actor=value;},
    setHold(value){held=value;},
  };
}
const payload = {
  output_id,content:"Please explain which subway line to take, with an actual example.",
  expected_version:1,client_request_id:"client-request-12345678",timestamp_seconds:5.2,
};

test("authenticated human feedback persists exactly once under the review hold",async()=>{
  const f=setup();
  const result=await send({...payload,operations:f.operations,now:()=>new Date("2026-10-28T12:00:00Z")});
  assert.equal(result.replay,false);
  assert.equal(f.saved.version,2);
  assert.equal(f.saved.state,"discussing");
  assert.equal(f.saved.messages.length,1);
  assert.equal(f.saved.messages[0].role,"user");
  assert.equal(f.saved.messages[0].content,payload.content);
  assert.equal(f.saved.messages[0].timestamp_seconds,5.2);
  assert.equal(f.saved.messages[0].at,"2026-10-28T12:00:00.000Z");
  assert.equal(f.counts.writes,1);
  assert.equal(f.saved.review_hold.active,true);
  assert.equal(f.saved.current_attempt_id,"original-12345678");
  assert.equal(f.saved.active_job,null);
  assert.equal(f.saved.approved_attempt_id,null);
});
test("retry of the identical client request never produces a second message",async()=>{
  const f=setup();
  await send({...payload,operations:f.operations});
  const replay=await send({...payload,operations:f.operations,now:()=>new Date("2026-10-29T00:00:00Z")});
  assert.equal(replay.replay,true);
  assert.equal(f.saved.messages.length,1);
  assert.equal(f.counts.writes,1);
});
test("reusing a request ID for different feedback rejects without changing state",async()=>{
  const f=setup();
  await send({...payload,operations:f.operations});
  await assert.rejects(()=>send({...payload,content:"Publish immediately",operations:f.operations}),
    e=>e.code==="IDEMPOTENCY_CONFLICT");
  assert.equal(f.counts.writes,1);
  assert.equal(f.saved.messages.length,1);
});
test("client cannot choose Producer identity or trigger a revision or approval",async()=>{
  const f=setup();
  const result=await send({...payload,role:"producer",type:"COMMIT_PLAN",
    intent:"explicit_go_ahead",approval:true,operations:f.operations});
  assert.equal(result.session.messages[0].role,"user");
  assert.equal(f.saved.latest_attempt_number,1);
  assert.equal(f.saved.state,"discussing");
  assert.equal(f.saved.review_hold.active,true);
});
test("unauthenticated or underprivileged actors never touch the coordinator",async()=>{
  const f=setup();
  for(const actor of [
    null,
    {id:"studio-user-12345678",authenticated:false,authorized:true,permissions:{outputs_review:true}},
    {id:"studio-user-12345678",authenticated:true,authorized:true,permissions:{outputs_review:false}},
    {id:"studio-user-12345678",authenticated:true,authorized:false,permissions:{outputs_review:true}},
  ]){
    f.setActor(actor);
    await assert.rejects(()=>send({...payload,operations:f.operations}),e=>e.status===403);
  }
  assert.equal(f.counts.locks,0);
  assert.equal(f.counts.writes,0);
});
test("strict input contract rejects missing trusted auth, invalid IDs and bad timestamps",async()=>{
  const f=setup();
  const cases=[
    {...payload,output_id:"not-a-record"},
    {...payload,content:""},
    {...payload,content:"x".repeat(3001)},
    {...payload,expected_version:0},
    {...payload,client_request_id:"short"},
    {...payload,timestamp_seconds:-1},
    {...payload,timestamp_seconds:NaN},
    {...payload,timestamp_seconds:86401},
    {...payload,timestamp_seconds:"5"},
  ];
  for(const sample of cases)
    await assert.rejects(()=>send({...sample,operations:f.operations}),e=>e.status===400);
  await assert.rejects(()=>send({...payload,operations:{}}),e=>e.status===503);
  assert.equal(f.counts.writes,0);
});
test("stale versions and lost holds fail closed",async()=>{
  const f=setup();
  await assert.rejects(()=>send({...payload,expected_version:2,operations:f.operations}),
    e=>e.code==="STALE_SESSION");
  f.setHold(false);
  await assert.rejects(()=>send({...payload,operations:f.operations}),e=>e.code==="HOLD_NOT_VERIFIED");
  assert.equal(f.counts.writes,0);
});
test("another client request creates a separate message only at the latest version",async()=>{
  const f=setup();
  await send({...payload,operations:f.operations});
  await send({...payload,expected_version:2,client_request_id:"client-request-23456789",
    content:"Also describe uptown versus downtown trains.",operations:f.operations});
  assert.equal(f.saved.messages.length,2);
  assert.equal(f.saved.version,3);
  assert.equal(f.counts.writes,2);
});
