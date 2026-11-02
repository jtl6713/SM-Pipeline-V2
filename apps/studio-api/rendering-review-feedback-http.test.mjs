import test from "node:test";
import assert from "node:assert/strict";
import { handleRenderingReviewFeedbackRequest as handle, reviewFeedbackWriteEnabled as enabled }
  from "./rendering-review-feedback-http.mjs";
import { enrollReview, CHICAGO_PROFILE_ID } from "./rendering-review-policy.mjs";

const output_id="recA1B2C3D4E5F6G7";
const flags={RENDERING_REVIEW_FEEDBACK_WRITES_ENABLED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true"};
const producerFlags={RENDERING_REVIEW_PRODUCER_WRITES_ENABLED:"true",
  RENDERING_REVIEW_PRODUCER_BRIDGE_ENABLED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true"};
const auth={authenticated:true,authorized:true,user:{record_id:"recU1S2E3R4I5D6A7"},
  permissions:{outputs_review:true}};
const data={content:"Please give a worked subway route example.",
  expected_version:1,client_request_id:"request-client-12345678",timestamp_seconds:4};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const hold={id:"rrhold-12345678",owner:"rrsession-12345678",output_id,active:true,verified:true};
  let state=enrollReview({id:output_id,profile_id:CHICAGO_PROFILE_ID,platform:"Instagram",
    output_type:"Instagram Reel",render_status:"Rendered",final_file_id:"original-12345678"},
    hold,{enabled:true,profile_ids:[CHICAGO_PROFILE_ID],output_types:["Instagram Reel"],
      manual_admission:true},{session_id:hold.owner,original_attempt_id:"original-12345678"});
  const writes=[];
  const operations={
    getAuthenticatedActor:async()=>({id:auth.user.record_id,
      authenticated:true,authorized:true,permissions:{outputs_review:true}}),
    authorizeReview:async id=>id===output_id,
    authorizeEvent:async(id,event)=>id===output_id&&event.role==="user"&&event.type==="MESSAGE",
    withOutputLock:async(_id,fn)=>fn(),
    loadSession:async()=>clone(state),
    readSession:async()=>clone(state),
    readHold:async()=>clone(hold),
    saveSessionIfVersion:async({expected_version,next})=>{
      assert.equal(expected_version,state.version);
      state=clone(next);writes.push(next.version);return true;
    },
  };
  let writeAuthCalls=0;
  const send=async(body=data, opts={})=>{
    const request=new Request("https://studio.test/api/rendering-review/outputs/"+output_id+"/messages",{
      method:"POST",headers:{"Content-Type":opts.type||"application/json"},
      body:typeof body==="string"?body:JSON.stringify(body),
    });
    return handle({request,env:opts.env||flags,authorization:opts.authorization||auth,
      output_id,assertWriteRequest:()=>{writeAuthCalls++;},operations,
      in_flight_only:opts.in_flight_only===true,
      review_note_only:opts.review_note_only===true});
  };
  return {send,writes,setState:fn=>{fn(state);},get state(){return state;},get writeAuthCalls(){return writeAuthCalls;}};
}
test("all three rollout gates are required; missing one never authorizes a write",async()=>{
  const f=fixture();
  assert.equal(enabled({}),false);
  for(const name of Object.keys(flags)){
    const env={...flags};delete env[name];
    assert.equal(enabled(env),false);
    await assert.rejects(()=>f.send(data,{env}),e=>e.status===405);
  }
  assert.equal(f.writeAuthCalls,0);
  assert.deepEqual(f.writes,[]);
});
test("valid authenticated POST persists literal feedback and only returns safe summary",async()=>{
  const f=fixture();const r=await f.send();
  assert.deepEqual(r,{ok:true,replay:false,session_version:2,message_count:1,review_hold_active:true});
  assert.equal(f.state.messages[0].role,"user");
  assert.equal(f.state.messages[0].content,data.content);
  assert.deepEqual(f.writes,[2]);
  const repeated=await f.send();
  assert.equal(repeated.replay,true);assert.deepEqual(f.writes,[2]);
});
test("body cannot impersonate Producer, approve, schedule, or submit render events",async()=>{
  const f=fixture();
  for(const extra of [{role:"producer"},{type:"COMMIT_PLAN"},{intent:"go ahead"},
    {scheduler_receipt_verified:true},{hold_active:false},{validated:true}]){
    await assert.rejects(()=>f.send({...data,...extra}),e=>e.status===400);
  }
  assert.equal(f.state.version,1);
  assert.deepEqual(f.writes,[]);
});
test("missing permission rejects before write auth or coordinator is entered",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send(data,{authorization:{...auth,permissions:{outputs_review:false}}}),
    e=>e.status===403);
  await assert.rejects(()=>f.send(data,{authorization:{...auth,user:null}}),
    e=>e.status===403);
  assert.equal(f.writeAuthCalls,0);
  assert.deepEqual(f.writes,[]);
});
test("malformed body or content type is not persisted",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send("bad json"),e=>e.status===400);
  await assert.rejects(()=>f.send(data,{type:"text/plain"}),e=>e.status===415);
  await assert.rejects(()=>f.send("x".repeat(7001)),e=>e.status===413);
  await assert.rejects(()=>f.send([]),e=>e.status===400);
  assert.deepEqual(f.writes,[]);
});
test("stale session rejects but does not mutate or release the review hold",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send({...data,expected_version:3}),e=>e.code==="STALE_SESSION");
  assert.equal(f.state.review_hold.active,true);
  assert.deepEqual(f.writes,[]);
});

test("in-flight notes save on a held queued render without changing the job or plan",async()=>{
  const f=fixture();
  f.setState(state=>{
    state.state="queued";
    state.version=5;
    state.active_job={id:"rrjob-queued-123",attempt_id:"attempt-queued-123",
      plan_hash:"rrplan-queued-123"};
    state.plan={version:2,hash:"rrplan-queued-123",frozen:true,missing_assets:[]};
    state.current_attempt_id="attempt-queued-123";
    state.attempts.push({id:"attempt-queued-123",number:2,status:"queued",
      plan_version:2,job_id:"rrjob-queued-123",artifact_id:null});
  });
  const before=clone(f.state);
  const res=await f.send({...data,expected_version:5,content:
    "For V3, use scene 3 planet exhibit instead of the existing image."},{
      env:producerFlags,in_flight_only:true});
  assert.equal(res.ok,true);
  assert.equal(res.session_version,6);
  assert.equal(f.state.messages.at(-1).role,"user");
  assert.equal(f.state.state,"queued");
  assert.deepEqual(f.state.active_job,before.active_job);
  assert.deepEqual(f.state.plan,before.plan);
  assert.deepEqual(f.state.attempts,before.attempts);
  assert.equal(f.state.review_hold.active,true);
  assert.equal(f.state.version,6);
});

test("in-flight comments reject completed, unlocked, or stale sessions without writing",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send(data,{env:producerFlags,in_flight_only:true}),
    e=>e.code==="IN_FLIGHT_FEEDBACK_NOT_ALLOWED");
  assert.deepEqual(f.writes,[]);
  f.setState(s=>{s.state="queued";s.active_job={id:"rrjob-queued-123"};
    s.review_hold.active=false;});
  await assert.rejects(()=>f.send(data,{env:producerFlags,in_flight_only:true}),
    e=>e.code==="IN_FLIGHT_FEEDBACK_NOT_ALLOWED");
  assert.deepEqual(f.writes,[]);
  f.setState(s=>{s.state="queued";s.review_hold.active=true;});
  await assert.rejects(()=>f.send({...data,expected_version:99},{
    env:producerFlags,in_flight_only:true}),e=>e.code==="STALE_SESSION");
  assert.deepEqual(f.writes,[]);
  const disabled={...producerFlags};delete disabled.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED;
  await assert.rejects(()=>f.send(data,{env:disabled,in_flight_only:true}),e=>e.status===405);
  assert.deepEqual(f.writes,[]);
});

test("save-only review comments remain a separate choice from Producer planning and rendering",async()=>{
  const f=fixture();
  const before=clone(f.state);
  const response=await f.send({...data,content:"Use the original frame two photo."},{
    env:producerFlags,review_note_only:true});
  assert.equal(response.ok,true);
  assert.equal(f.state.state,before.state);
  assert.equal(f.state.messages.at(-1).role,"user");
  assert.equal(f.state.messages.at(-1).content,"Use the original frame two photo.");
  assert.deepEqual(f.state.attempts,before.attempts);
  assert.deepEqual(f.state.active_job,before.active_job);
  assert.equal(f.state.review_hold.active,true);
  assert.equal(f.state.producer_candidate,undefined);
  assert.equal(f.state.plan,null);
});
test("save-only review comments require an active hold and Producer rollout flags",async()=>{
  const f=fixture();
  f.setState(x=>x.review_hold.active=false);
  await assert.rejects(()=>f.send(data,{env:producerFlags,review_note_only:true}),
    e=>e.code==="REVIEW_NOTE_NOT_ALLOWED");
  const disabled={...producerFlags};delete disabled.RENDERING_REVIEW_PRODUCER_WRITES_ENABLED;
  await assert.rejects(()=>f.send(data,{env:disabled,review_note_only:true}),e=>e.status===405);
  assert.deepEqual(f.writes,[]);
});
