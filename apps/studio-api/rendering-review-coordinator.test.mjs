import test from "node:test";
import assert from "node:assert/strict";
import {
  enrollManualReviewCommand, mutateReviewSessionCommand,
} from "./rendering-review-coordinator.mjs";
import {CHICAGO_PROFILE_ID,REVIEW_PILOT} from "./rendering-review-policy.mjs";

const outputId="recA1B2C3D4E5F6G7";
const policy={...REVIEW_PILOT,enabled:true};
const args={
  output_id:outputId,session_id:"session-12345678",
  original_attempt_id:"attempt-00000001",
  idempotency_key:"request-00000001",
  policy,
};
const clone=x=>JSON.parse(JSON.stringify(x));
const check=(fn,code)=>assert.rejects(fn,error=>error.code===code);
function fixture() {
  let output={
    id:outputId,profile_id:CHICAGO_PROFILE_ID,
    output_type:"Instagram Reel",platform:"Instagram",
    output_status:"Ready for Review",publish_status:"Ready to Schedule",
    render_status:"Rendered",final_file_id:"drive-file-00001",
    scheduled_post_date:"2026-11-01T12:00:00Z",
    approved_attempt_id:"attempt-oldapproval",
  };
  let hold=null, session=null, locked=Promise.resolve();
  const log=[];
  const ops={
    authorizeReview:async()=>true,
    authorizeEvent:async()=>true,
    withOutputLock:async(key,work)=>{
      assert.equal(key,outputId);
      let release;
      const waiting=locked;
      locked=new Promise(resolve=>{release=resolve});
      await waiting;
      log.push("lock_acquired");
      try{return await work()}finally{log.push("lock_released");release()}
    },
    loadSession:async()=>session&&clone(session),
    readOutput:async()=>clone(output),
    claimHold:async({output_id,session_id})=>{
      if(hold)throw Error("hold already exists");
      assert.equal(output_id,outputId);
      hold={id:"hold-00000001",output_id,owner:session_id,verified:true,active:true};
      log.push("hold_claimed");
    },
    readHold:async()=>hold&&clone(hold),
    clearStaleSchedule:async()=>{
      assert.equal(hold?.active,true);
      output.scheduled_post_date=null;
      output.studio_scheduled_at=null;
      output.youtube_scheduled_publish_at=null;
      output.approved_attempt_id=null;
      log.push("schedule_revoked");
    },
    createSessionIfAbsent:async s=>{
      if(session)throw Error("session already present");
      session=clone(s);
      log.push("session_created");
    },
    readSession:async()=>session&&clone(session),
    saveSessionIfVersion:async({expected_version,next})=>{
      if(session?.version!==expected_version)return false;
      session=clone(next);
      log.push("session_updated");
      return true;
    },
  };
  return {
    ops,log,
    get output(){return output},
    set output(v){output=v},
    get hold(){return hold},
    set hold(v){hold=v},
    get session(){return session},
    set session(v){session=v},
  };
}

test("disabled pilot and unauthorized user produce zero writes",async()=>{
  const f=fixture();
  await check(()=>enrollManualReviewCommand({...args,policy:REVIEW_PILOT,operations:f.ops}),"FEATURE_DISABLED");
  f.ops.authorizeReview=async()=>false;
  await check(()=>enrollManualReviewCommand({...args,operations:f.ops}),"NOT_AUTHORIZED");
  assert.deepEqual(f.log,[]);
});

test("manual enrollment holds before schedule revocation, then persists and verifies",async()=>{
  const f=fixture();
  const outcome=await enrollManualReviewCommand({...args,operations:f.ops});
  assert.equal(outcome.replay,false);
  assert.equal(outcome.session.output_id,outputId);
  assert.equal(outcome.session.review_hold.active,true);
  assert.equal(outcome.session.original_approval,"attempt-oldapproval");
  assert.deepEqual(f.log,["lock_acquired","hold_claimed","schedule_revoked","session_created","lock_released"]);
  assert.equal(f.output.scheduled_post_date,null);
});

test("reloaded retry after HTTP timeout returns same durable session",async()=>{
  const f=fixture();
  const once=await enrollManualReviewCommand({...args,operations:f.ops});
  const again=await enrollManualReviewCommand({...args,operations:f.ops});
  assert.equal(again.replay,true);
  assert.equal(again.session.id,once.session.id);
  assert.equal(f.log.filter(s=>s==="session_created").length,1);
});

test("concurrent manual double-click creates exactly one session",async()=>{
  const f=fixture();
  const result=await Promise.all([
    enrollManualReviewCommand({...args,operations:f.ops}),
    enrollManualReviewCommand({...args,operations:f.ops}),
  ]);
  assert.deepEqual(result.map(x=>x.replay).sort(),[false,true]);
  assert.equal(f.log.filter(s=>s==="hold_claimed").length,1);
  assert.equal(f.log.filter(s=>s==="session_created").length,1);
});

test("different request cannot steal an enrolled output",async()=>{
  const f=fixture();
  await enrollManualReviewCommand({...args,operations:f.ops});
  await check(()=>enrollManualReviewCommand({
    ...args,session_id:"session-other1234",idempotency_key:"request-00000002",operations:f.ops,
  }),"ALREADY_ENROLLED");
  assert.equal(f.hold.owner,args.session_id);
});

test("a readback failure preserves the hold and returns no session",async()=>{
  const f=fixture();
  f.ops.readHold=async()=>({...f.hold,verified:false});
  await check(()=>enrollManualReviewCommand({...args,operations:f.ops}),"HOLD_NOT_VERIFIED");
  assert.equal(f.hold?.active,true);
  assert.equal(f.session,null);
  assert.equal(f.log.includes("schedule_revoked"),false);
});

test("schedule clearing failed: hold remains, nothing incorrectly marked enrolled",async()=>{
  const f=fixture();
  f.ops.clearStaleSchedule=async()=>{throw Error("Airtable returned 503")};
  await assert.rejects(()=>enrollManualReviewCommand({...args,operations:f.ops}),/Airtable returned 503/);
  assert.equal(f.hold.active,true);
  assert.equal(f.session,null);
});

test("scheduled approval remains on readback: session is not created",async()=>{
  const f=fixture();
  f.ops.clearStaleSchedule=async()=>{};
  await check(()=>enrollManualReviewCommand({...args,operations:f.ops}),"SCHEDULE_REVOCATION_UNVERIFIED");
  assert.equal(f.hold.active,true);
  assert.equal(f.session,null);
});

test("dispatch begins while claiming the hold: refuse and preserve hold",async()=>{
  const f=fixture();
  const claim=f.ops.claimHold;
  f.ops.claimHold=async(...values)=>{
    await claim(...values);
    f.output={...f.output,publish_started_at:"2026-10-28T06:00:00Z"};
  };
  await check(()=>enrollManualReviewCommand({...args,operations:f.ops}),"DISPATCH_RACE");
  assert.equal(f.hold.active,true);
  assert.equal(f.session,null);
});

test("server-only events cannot be spoofed as producer/validated renderer events",async()=>{
  const f=fixture();
  await enrollManualReviewCommand({...args,operations:f.ops});
  f.ops.authorizeEvent=async()=>false;
  await check(()=>mutateReviewSessionCommand({output_id:outputId,
    event:{type:"MESSAGE",role:"producer"},operations:f.ops}),"UNTRUSTED_EVENT");
  assert.equal(f.session.version,1);
});

test("generic mutation deliberately cannot approve/schedule or release the hold",async()=>{
  const f=fixture();
  await enrollManualReviewCommand({...args,operations:f.ops});
  for(const type of ["APPROVE_ATTEMPT","RELEASE_REVIEW_HOLD"])
    await check(()=>mutateReviewSessionCommand({output_id:outputId,event:{type},operations:f.ops}),"ORCHESTRATION_REQUIRED");
  assert.equal(f.hold.active,true);
});

test("authored event persists under exact lock and reloads from authoritative storage",async()=>{
  const f=fixture();
  await enrollManualReviewCommand({...args,operations:f.ops});
  const data=await mutateReviewSessionCommand({
    output_id:outputId,
    event:{
      type:"MESSAGE",expected_version:1,idempotency_key:"request-00000099",
      fingerprint:"digest-00000099",message_id:"message-00000001",
      role:"user",content:"Keep my opening shot, explain the navigation.",
    },
    operations:f.ops,
  });
  assert.equal(data.session.version,2);
  assert.equal(data.session.messages.length,1);
  assert.equal(f.session.messages[0].content,"Keep my opening shot, explain the navigation.");
});

test("session mutation refuses missing authoritative hold",async()=>{
  const f=fixture();
  await enrollManualReviewCommand({...args,operations:f.ops});
  f.hold={...f.hold,active:false};
  await check(()=>mutateReviewSessionCommand({
    output_id:outputId,
    event:{type:"MESSAGE",expected_version:1,idempotency_key:"request-00000099",
      fingerprint:"digest-00000099",message_id:"message-00000001",role:"user",content:"change it"},
    operations:f.ops,
  }),"HOLD_NOT_VERIFIED");
});

test("failed atomic compare-and-set cannot mutate session despite a valid event",async()=>{
  const f=fixture();
  await enrollManualReviewCommand({...args,operations:f.ops});
  f.ops.saveSessionIfVersion=async()=>false;
  await check(()=>mutateReviewSessionCommand({
    output_id:outputId,
    event:{type:"MESSAGE",expected_version:1,idempotency_key:"request-00000099",
      fingerprint:"digest-00000099",message_id:"message-00000001",role:"user",content:"change it"},
    operations:f.ops,
  }),"STALE_SESSION");
  assert.equal(f.session.version,1);
});

test("idempotent replay fails closed if its original durable hold was lost",async()=>{
  const f=fixture();
  await enrollManualReviewCommand({...args,operations:f.ops});
  f.hold={...f.hold,active:false};
  await check(()=>enrollManualReviewCommand({...args,operations:f.ops}),"HOLD_LOST");
  assert.equal(f.session.review_hold.active,true);
});

test("changing completed artifact after hold claim blocks stale preview enrollment",async()=>{
  const f=fixture();
  const claim=f.ops.claimHold;
  f.ops.claimHold=async(...values)=>{
    await claim(...values);
    f.output={...f.output,final_file_id:"drive-newer-000001"};
  };
  await check(()=>enrollManualReviewCommand({...args,operations:f.ops}),"RENDER_CHANGED_DURING_ENROLLMENT");
  assert.equal(f.hold.active,true);
  assert.equal(f.session,null);
});

test("profile or output type drift during admission also fails closed",async()=>{
  for(const change of [
    {profile_id:"recNYC12345678901"},
    {output_type:"Instagram Story"},
    {render_status:"Rendering"},
  ]){
    const f=fixture();
    const claim=f.ops.claimHold;
    f.ops.claimHold=async(...values)=>{
      await claim(...values);
      f.output={...f.output,...change};
    };
    await check(()=>enrollManualReviewCommand({...args,operations:f.ops}),"RENDER_CHANGED_DURING_ENROLLMENT");
    assert.equal(f.hold.active,true);
    assert.equal(f.session,null);
  }
});
