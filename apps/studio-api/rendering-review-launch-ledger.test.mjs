import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleReviewLaunchLedger as ledger,reviewLaunchLedgerEnabled as enabled}
  from "./rendering-review-launch-ledger.mjs";

const OUTPUT="recA1B2C3D4E5F6G7", SESSION="rrsession_12345678";
const ATTEMPT="rrattempt_12345678", JOB="rrjob_12345678";
const PLAN="a".repeat(64),HASH="b".repeat(64);
const LEASE="rrrunner_1234567890",SECRET="separate-render-job-ledger-secret-long-enough";
const REMOTION="https://review-render.test";
const flags={RENDERING_REVIEW_JOB_CLAIM_ENABLED:"true",
  RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_LAUNCH_LEDGER_ENABLED:"true",
  RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET:SECRET,
  RENDERING_REVIEW_REMOTION_BASE_URL:REMOTION};
const standard={output_id:OUTPUT,job_id:JOB,lease_owner:LEASE,lease_fence:1};
const clone=x=>structuredClone(x);

function setup(){
  const s={id:SESSION,output_id:OUTPUT,profile_id:"recT2rbKX3MF7cVFU",
    output_type:"Instagram Reel",state:"queued",current_attempt_id:ATTEMPT,
    active_job:{id:JOB,plan_hash:PLAN},
    review_hold:{active:true,id:"rrhold_12345678",owner:SESSION}};
  const h={verified:true,active:true,id:s.review_hold.id,owner:SESSION,output_id:OUTPUT};
  const o={id:OUTPUT,profile_id:"recT2rbKX3MF7cVFU",
    platform:"Instagram",output_type:"Instagram Reel",do_not_publish:true,
    review_hold_active:true,publish_status:"Not Ready"};
  const j={record_id:"recJ1O2B3S4T5A6B7",job_id:JOB,output_id:OUTPUT,
    session_id:SESSION,attempt_id:ATTEMPT,plan_hash:PLAN,state:"claimed",
    lease_owner:LEASE,lease_fence:1,event_history_json:"[]"};
  let patches=0,locks=0,skipPatch=false;
  const operations={
    withOutputLock:async(id,fn)=>{assert.equal(id,OUTPUT);locks++;return fn()},
    readSession:async()=>clone(s),readHold:async()=>clone(h),
    readOutput:async()=>clone(o),readJob:async()=>clone(j),
    patchJob:async(id,fields)=>{
      patches++;assert.equal(id,j.record_id);
      if(!skipPatch){
        j.event_history_json=fields.Event_History_JSON;
        j.progress=fields.Progress_Stage;
      }
    },
  };
  async function send(action,extra={},opts={}){
    const req=new Request("https://studio.test/internal/rendering-review/launch-ledger",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-Rendering-Review-Job-Secret":opts.secret||SECRET},
      body:JSON.stringify({action,...standard,...extra}),
    });
    return ledger({request:req,env:opts.env||flags,operations});
  }
  return {s,h,o,j,send,
    noPatch:()=>skipPatch=true,get patches(){return patches},
    get locks(){return locks}};
}

test("strict flags default OFF and must prevent any write",async()=>{
  assert.equal(enabled({}),false);
  const a=setup();
  await assert.rejects(()=>a.send("read_authority",{},{
    env:{...flags,RENDERING_REVIEW_LAUNCH_LEDGER_ENABLED:"false"},
  }),e=>e.code==="LAUNCH_LEDGER_DISABLED");
  assert.equal(a.locks,0);
});
test("server secret checked before looking up job",async()=>{
  const a=setup();
  await assert.rejects(()=>a.send("read_authority",{},{
    secret:"untrusted-client-secret"}),
    e=>e.code==="LAUNCH_LEDGER_AUTH_DENIED");
  assert.equal(a.locks,0);
});
test("current job authority requires real owned hold and claimed lease",async()=>{
  const a=setup();
  const v=await a.send("read_authority");
  assert.equal(v.verified,true);
  assert.equal(v.lease_owner,LEASE);
  assert.equal(v.current_attempt_id,ATTEMPT);
  a.h.active=false;
  await assert.rejects(()=>a.send("reserve_intent",{payload_hash:HASH}),
    e=>e.code==="LAUNCH_AUTHORITY_STALE");
  a.h.active=true;a.o.publish_locked_by="AP1-IG";
  await assert.rejects(()=>a.send("reserve_intent",{payload_hash:HASH}),
    e=>e.code==="LAUNCH_AUTHORITY_STALE");
  assert.equal(a.patches,0);
});
test("only one durable launch intent; retries cannot authorize a second POST",async()=>{
  const a=setup();
  const first=await a.send("reserve_intent",{payload_hash:HASH});
  assert.deepEqual(first,{created:true,verified:true});
  assert.equal(a.patches,1);
  const intent=await a.send("read_intent");
  assert.equal(intent.verified,true);
  assert.equal(intent.payload_hash,HASH);
  const replay=await a.send("reserve_intent",{payload_hash:HASH});
  assert.deepEqual(replay,{created:false,verified:true});
  assert.equal(a.patches,1);
  await assert.rejects(()=>a.send("reserve_intent",{payload_hash:"c".repeat(64)}),
    e=>e.code==="LAUNCH_INTENT_CONFLICT");
});
test("ambiguous write readback denies, never returns a new launch authorization",async()=>{
  const a=setup();a.noPatch();
  await assert.rejects(()=>a.send("reserve_intent",{payload_hash:HASH}),
    e=>e.code==="LAUNCH_INTENT_CONFLICT");
  assert.equal(a.patches,1);
});
test("remote receipt must bind exact job, lease, payload, and renderer status ID",async()=>{
  const a=setup();
  await a.send("reserve_intent",{payload_hash:HASH});
  const receipt={payload_hash:HASH,remotion_job_id:"remotion_12345678",
    status_url:REMOTION+"/status/remotion_12345678"};
  await assert.rejects(()=>a.send("persist_receipt",{
    ...receipt,status_url:"https://hostile.test/status/remotion_12345678",
  }),e=>e.code==="REMOTION_RECEIPT_UNTRUSTED");
  assert.equal(a.patches,1);
  const saved=await a.send("persist_receipt",receipt);
  assert.equal(saved.remotion_job_id,receipt.remotion_job_id);
  assert.equal(saved.status_url,receipt.status_url);
  assert.equal(a.patches,2);
  const read=await a.send("read_receipt");
  assert.equal(read.verified,true);
  const repeat=await a.send("persist_receipt",receipt);
  assert.equal(repeat.status_url,receipt.status_url);
  assert.equal(a.patches,2);
  await assert.rejects(()=>a.send("persist_receipt",{
    ...receipt,remotion_job_id:"remotion_87654321",
    status_url:REMOTION+"/status/remotion_87654321",
  }),e=>e.code==="REMOTION_RECEIPT_CONFLICT");
});
test("untrusted/forged body cannot specify publisher or source authority",async()=>{
  const a=setup();
  await assert.rejects(()=>a.send("reserve_intent",{
    payload_hash:HASH,publish_approved:true}),
    e=>e.code==="INVALID_LEDGER_REQUEST");
  assert.equal(a.locks,0);
});
test("corrupt duplicate/out-of-band history blocks all commits",async()=>{
  const a=setup();a.j.event_history_json="not-json";
  await assert.rejects(()=>a.send("reserve_intent",{payload_hash:HASH}),
    e=>e.code==="LEDGER_HISTORY_UNVERIFIED");
  assert.equal(a.patches,0);
});
test("Worker mounting uses same lock and separate authenticated route",()=>{
  const s=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const start=s.indexOf('url.pathname === "/internal/rendering-review/launch-ledger"');
  const end=s.indexOf("// Internal AP1-IG dispatch claim:",start);
  const route=s.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(route,/handleReviewLaunchLedger/);
  assert.match(route,/RENDER_REVIEW_TABLES.jobs/);
  assert.match(route,/withOutputApprovalLock\(env.STUDIO_MEDIA,id,fn\)/);
  assert.doesNotMatch(route,/post_render|graph.publish|APPROVE_ATTEMPT|RELEASE_REVIEW_HOLD/);
});

test("protected ledger supports any verified held profile, never a foreign city",async()=>{
  const a=setup();
  const la="recF7UAn0LkMZZrWZ";
  Object.assign(a.s,{profile_id:la,platform:"TikTok",output_type:"TikTok Video"});
  Object.assign(a.o,{profile_id:la,platform:"TikTok",output_type:"TikTok Video"});
  const global={...flags,
    RENDERING_REVIEW_ENROLL_WRITES_ENABLED:"true",
    RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
    RENDERING_REVIEW_GLOBAL_MANUAL_ENABLED:"true",
    RENDERING_REVIEW_GLOBAL_RUNNER_VERIFIED:"true",
  };
  for(const flag of ["RENDERING_REVIEW_GLOBAL_MANUAL_ENABLED",
                     "RENDERING_REVIEW_GLOBAL_RUNNER_VERIFIED"]){
    await assert.rejects(()=>a.send("read_authority",{},{
      env:{...global,[flag]:"false"}
    }),e=>e.code==="LAUNCH_AUTHORITY_STALE");
    assert.equal(a.patches,0);
  }
  const accepted=await a.send("reserve_intent",{payload_hash:HASH},{env:global});
  assert.equal(accepted.verified,true);
  assert.equal(a.patches,1);
  a.o.profile_id="recT2rbKX3MF7cVFU";
  await assert.rejects(()=>a.send("read_authority",{},{
    env:global
  }),e=>e.code==="LAUNCH_AUTHORITY_STALE");
  assert.equal(a.patches,1);
});
