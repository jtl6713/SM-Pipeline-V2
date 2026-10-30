import test from "node:test";
import assert from "node:assert/strict";
import {
  handleRenderingReviewEnrollRequest as enroll,
  reviewEnrollmentWriteEnabled as enabled,
} from "./rendering-review-enrollment-http.mjs";
import {CHICAGO_PROFILE_ID,REVIEW_PILOT} from "./rendering-review-policy.mjs";

const outputId="recA1B2C3D4E5F6G7";
const actor="recU1S2E3R4I5D6A7";
const keys=[
  "RENDERING_REVIEW_ENROLL_WRITES_ENABLED",
  "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED",
  "RENDERING_REVIEW_INTEGRATION_VERIFIED",
  "RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED",
  "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED",
];
const flags={...Object.fromEntries(keys.map(x=>[x,"true"])),RENDERING_REVIEW_EXACT_OUTPUT_ID:outputId};
const auth={authenticated:true,authorized:true,user:{record_id:actor},
  permissions:{outputs_review:true}};
const data={client_request_id:"chicago-review-request-0001",note:"Replace the nighttime Riverwalk images with daylight scenes."};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  let output={
    id:outputId,profile_id:CHICAGO_PROFILE_ID,platform:"Instagram",
    output_type:"Instagram Reel",render_status:"Rendered",
    final_file_id:"drive-video-123456",publish_status:"Ready to Schedule",
    scheduled_post_date:"2026-12-16T17:30:00Z",
    approved_attempt_id:"legacy-approved-0001",
  };
  let hold=null,session=null;
  let locked=Promise.resolve(),writes=0,writeAuth=0,membership=0;
  const ops={
    authorizeReview:async id=>id===outputId&&output.profile_id===CHICAGO_PROFILE_ID,
    withOutputLock:async(_id,fn)=>{
      let release;const wait=locked;
      locked=new Promise(resolve=>{release=resolve;});
      await wait;
      try{return await fn();}finally{release();}
    },
    loadSession:async()=>session&&clone(session),
    readSession:async()=>session&&clone(session),
    readOutput:async()=>clone(output),
    assertScheduleRevocationReady:async()=>true,
    claimHold:async({output_id,session_id})=>{
      assert.equal(output_id,outputId);
      if(hold)throw Error("Second hold forbidden");
      hold={id:"rrhold-test-1234",owner:session_id,output_id,active:true,verified:true};
      writes++;
    },
    readHold:async()=>hold&&clone(hold),
    clearStaleSchedule:async()=>{
      assert.equal(hold?.active,true);
      output.scheduled_post_date=null;
      output.studio_scheduled_at=null;
      output.youtube_scheduled_publish_at=null;
      output.approved_attempt_id=null;
      writes++;
    },
    createSessionIfAbsent:async s=>{
      if(session)throw Error("Duplicate session forbidden");
      session=clone(s);writes++;
    },
  };
  const send=async(body=data,{env=flags,authorization=auth,membershipAllowed=true,
    writeGate=true,operations=ops,method="POST",contentType="application/json"}={})=>{
    const request=new Request("https://studio.test/api/rendering-review/factory/outputs/"+outputId+"/request-changes",{
      method,headers:{"Content-Type":contentType},
      body:method==="POST"?(typeof body==="string"?body:JSON.stringify(body)):undefined,
    });
    return enroll({request,env,authorization,output_id:outputId,
      assertWriteRequest:writeGate?()=>{writeAuth++;}:undefined,
      authorizeChicagoMembership:async(_authorization,profile)=>{
        membership++;assert.equal(profile,CHICAGO_PROFILE_ID);return membershipAllowed;},
      operations});
  };
  return {send,ops,get writes(){return writes},get hold(){return hold},
    get session(){return session},get output(){return output},set output(v){output=v},
    get writeAuth(){return writeAuth},get membership(){return membership}};
}

test("five protected enrollment gates default off; no authorization or data writes",async()=>{
  const f=fixture();
  assert.equal(REVIEW_PILOT.enabled,false);
  assert.equal(enabled({}),false);
  for(const name of keys){
    const env={...flags};delete env[name];
    await assert.rejects(()=>f.send(data,{env}),e=>e.status===405);
    assert.equal(enabled(env),false);
  }
  assert.equal(f.writes,0);
  assert.equal(f.writeAuth,0);
});

test("server generates session and initial attempt; hold precedes schedule revocation",async()=>{
  const f=fixture();
  const result=await f.send();
  assert.equal(result.ok,true);
  assert.equal(result.replay,false);
  assert.equal(result.review_state,"discussing");
  assert.equal(result.review_notes_saved,true);
  assert.equal(f.session.messages[0].content,data.note);
  assert.equal(f.session.factory_entry.source,"factory");
  assert.equal(result.review_hold_active,true);
  assert.match(result.session_id,/^rrsession_[0-9a-f]{48}$/);
  assert.match(result.current_attempt_id,/^rroriginal_[0-9a-f]{40}$/);
  assert.equal(f.session.id,result.session_id);
  assert.equal(f.hold.owner,result.session_id);
  assert.equal(f.output.scheduled_post_date,null);
  assert.equal(f.writes,3);
  assert.equal(f.writeAuth,1);
  const replay=await f.send();
  assert.equal(replay.replay,true);
  assert.equal(replay.session_id,result.session_id);
  assert.equal(f.writes,3);
});

test("two concurrent identical enrollment requests produce a single hold and session",async()=>{
  const f=fixture();
  const results=await Promise.all([f.send(),f.send()]);
  assert.deepEqual(results.map(x=>x.replay).sort(),[false,true]);
  assert.equal(results[0].session_id,results[1].session_id);
  assert.equal(f.writes,3);
});

test("client cannot set role, hold, policy, approval or attempt identity",async()=>{
  const f=fixture();
  for(const extra of [
    {session_id:"attacker-session"}, {original_attempt_id:"attacker-attempt"},
    {actor:"producer"},{force:true},{policy:{enabled:true}},
    {publish:true},{review_hold_active:false},
  ]){
    await assert.rejects(()=>f.send({...data,...extra}),e=>e.code==="UNTRUSTED_BODY");
  }
  assert.equal(f.writes,0);
});

test("invalid body, content type and request ID fail before a hold",async()=>{
  const f=fixture();
  for(const body of ["not json",[],{}, {client_request_id:"short"}]){
    await assert.rejects(()=>f.send(body),e=>e.status===400);
  }
  await assert.rejects(()=>f.send(data,{contentType:"text/plain"}),e=>e.status===415);
  await assert.rejects(()=>f.send("x".repeat(3601)),e=>e.status===413);
  for(const note of ["","   ","x".repeat(3001)]){
    await assert.rejects(()=>f.send({...data,note}),e=>e.status===400);
  }
  assert.equal(f.writes,0);
});

test("permission, membership and write security are mandatory",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send(data,{authorization:{...auth,permissions:{outputs_review:false}}}),e=>e.status===403);
  await assert.rejects(()=>f.send(data,{authorization:{...auth,user:null}}),e=>e.status===403);
  await assert.rejects(()=>f.send(data,{membershipAllowed:false}),e=>e.status===403);
  await assert.rejects(()=>f.send(data,{writeGate:false}),e=>e.status===503);
  assert.equal(f.writes,0);
});

test("missing schedule owner and in-flight dispatch refuse all writes",async()=>{
  const f=fixture();
  f.ops.assertScheduleRevocationReady=async()=>false;
  await assert.rejects(()=>f.send(),e=>e.code==="SCHEDULE_REVOCATION_UNAVAILABLE");
  assert.equal(f.writes,0);
  const g=fixture();
  g.output.publish_started_at="2026-10-28T12:00:00Z";
  await assert.rejects(()=>g.send(),e=>e.code==="DISPATCH_ALREADY_STARTED");
  assert.equal(g.writes,0);
});

test("wrong authoritative profile and existing session cannot be hijacked",async()=>{
  const f=fixture();
  f.output.profile_id="recZ1B2C3D4E5F6G7";
  await assert.rejects(()=>f.send(),e=>e.code==="NOT_AUTHORIZED");
  assert.equal(f.writes,0);
  const g=fixture();
  const once=await g.send();
  await assert.rejects(()=>g.send({...data,client_request_id:"other-request-0000001"}),
    e=>e.code==="ALREADY_ENROLLED");
  assert.equal(g.session.id,once.session_id);
  assert.equal(g.writes,3);
});

test("request ID replay with different comments is refused, not silently accepted",async()=>{
  const f=fixture();
  await f.send();
  await assert.rejects(()=>f.send({...data,note:"Different feedback"}),
    e=>e.code==="FACTORY_FEEDBACK_CONFLICT");
  assert.equal(f.session.messages.length,1);
  assert.equal(f.writes,3);
});

test("Factory-selected Chicago Reel does not require the historical 8447 global sample",async()=>{
  const f=fixture();
  const receipt=await f.send(data,{env:{...flags,RENDERING_REVIEW_EXACT_OUTPUT_ID:"rec0uVrVeiUM6shp9"}});
  assert.equal(receipt.ok,true);
  assert.equal(f.session.output_id,outputId);
  assert.equal(f.hold.output_id,outputId);
  assert.equal(f.writes,3);
});
