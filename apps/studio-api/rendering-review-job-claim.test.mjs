import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {claimReviewRenderJob as claim, reviewRendererJobClaimEnabled as enabled}
  from "./rendering-review-job-claim.mjs";

const OUTPUT="recA1B2C3D4E5F6G7";
const SESSION="rrsession_12345678";
const ATTEMPT="rrattempt_12345678";
const JOB="rrjob_12345678";
const PLAN="a".repeat(64);
const SECRET="separate-internal-render-job-secret-12345";
const flags={
  RENDERING_REVIEW_JOB_CLAIM_ENABLED:"true",
  RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET:SECRET,
};
const body={output_id:OUTPUT,job_id:JOB,client_request_id:"runner_request_12345678"};
const clone=x=>structuredClone(x);
function fixture({secret=SECRET,env=flags,requestBody=body}={}){
  const hold={verified:true,active:true,owner:SESSION,id:"rrhold_12345678",output_id:OUTPUT};
  const output={id:OUTPUT,profile_id:"recT2rbKX3MF7cVFU",platform:"Instagram",
    output_type:"Instagram Reel",review_hold_active:true,publish_status:"Not Ready"};
  const session={id:SESSION,output_id:OUTPUT,profile_id:"recT2rbKX3MF7cVFU",
    output_type:"Instagram Reel",state:"queued",current_attempt_id:ATTEMPT,
    review_hold:{active:true,id:hold.id,owner:SESSION},
    active_job:{id:JOB,plan_hash:PLAN}};
  const job={record_id:"recJ1O2B3S4T5A6B7",job_id:JOB,output_id:OUTPUT,
    session_id:SESSION,attempt_id:ATTEMPT,plan_hash:PLAN,
    state:"queued",lease_owner:"",lease_fence:0};
  let reads=0,patches=0,locks=0,failPatch=false;
  const operations={
    withOutputLock:async(id,fn)=>{locks++;assert.equal(id,OUTPUT);return fn()},
    readSession:async()=>clone(session),
    readHold:async()=>clone(hold),
    readOutput:async()=>clone(output),
    readJob:async()=>{reads++;return clone(job)},
    patchJob:async(id,fields)=>{
      patches++;assert.equal(id,job.record_id);
      if(failPatch)return;
      job.state=fields.Job_State;job.lease_owner=fields.Lease_Owner;
      job.lease_fence=fields.Lease_Fence;
    },
  };
  const send=(b=requestBody,opts={})=>{
    const request=new Request("https://studio.test/internal/rendering-review/claim-render-job",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-Rendering-Review-Job-Secret":opts.secret||secret},
      body:JSON.stringify(b),
    });
    return claim({request,env:opts.env||env,operations});
  };
  return {send,operations,hold,session,output,job,
    setPatchFailure:v=>failPatch=v,
    get reads(){return reads},
    get patches(){return patches},
    get locks(){return locks}};
}
test("inactive by default, never touches Airtable without all five verified flags",async()=>{
  assert.equal(enabled({}),false);
  for(const k of Object.keys(flags).filter(x=>x!=="RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET")){
    const env={...flags};delete env[k];
    const f=fixture({env});
    await assert.rejects(()=>f.send(),e=>e.status===405);
    assert.equal(f.locks,0);assert.equal(f.patches,0);
  }
});
test("independent render job secret required before reading tenant state",async()=>{
  const f=fixture({secret:"wrong-secret"});
  await assert.rejects(()=>f.send(),e=>e.status===403);
  assert.equal(f.locks,0);
});
test("exact verified held job reserves one positive fence under R2 lock",async()=>{
  const f=fixture();
  const result=await f.send();
  assert.equal(result.ok,true);
  assert.equal(result.lease_verified,true);
  assert.equal(result.lease_fence,1);
  assert.equal(result.job_id,JOB);
  assert.equal(result.attempt_id,ATTEMPT);
  assert.equal(result.render_started,false);
  assert.equal(result.public_post_created,false);
  assert.equal(f.job.state,"claimed");
  assert.equal(f.patches,1);
  assert.equal(f.locks,1);
  const replay=await f.send();
  assert.equal(replay.replay,true);
  assert.equal(replay.lease_fence,1);
  assert.equal(f.patches,1);
});
test("a different runner request cannot steal already-claimed job",async()=>{
  const f=fixture();
  await f.send();
  await assert.rejects(()=>f.send({...body,client_request_id:"different_runner_req_123"}),
    e=>e.code==="RENDER_JOB_ALREADY_CLAIMED");
  assert.equal(f.patches,1);
});
test("lost hold or publisher ownership blocks job claim",async()=>{
  const f=fixture();
  f.hold.active=false;
  await assert.rejects(()=>f.send(),e=>e.code==="RENDER_JOB_AUTHORITY_STALE");
  f.hold.active=true;
  f.output.publish_locked_by="AP1-IG";
  await assert.rejects(()=>f.send(),e=>e.code==="RENDER_JOB_AUTHORITY_STALE");
  assert.equal(f.patches,0);
});
test("stale session, different job, or plan hash drift cannot be claimed",async()=>{
  const f=fixture();
  f.session.current_attempt_id="other_attempt_123";
  await assert.rejects(()=>f.send(),e=>e.code==="RENDER_JOB_AUTHORITY_STALE");
  f.session.current_attempt_id=ATTEMPT;
  f.job.plan_hash="b".repeat(64);
  await assert.rejects(()=>f.send(),e=>e.code==="RENDER_JOB_IDENTITY_UNVERIFIED");
  assert.equal(f.patches,0);
});
test("nonpersistent PATCH denies before returning a render lease",async()=>{
  const f=fixture();f.setPatchFailure(true);
  await assert.rejects(()=>f.send(),e=>e.code==="RENDER_CLAIM_READBACK_FAILED");
  assert.equal(f.patches,1);
});
test("only body allowlist; caller cannot supply holds or lease owner",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send({...body,lease_fence:88,lease_owner:"attacker"}),
    e=>e.status===400);
  assert.equal(f.locks,0);
});
test("Worker route uses same canonical output lock and no model/publish operations",()=>{
  const s=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const i=s.indexOf('url.pathname === "/internal/rendering-review/claim-render-job"');
  const end=s.indexOf('// Internal AP1-IG dispatch claim:',i);
  const auth=s.indexOf('const authorization = await resolveAuthorization(request, env);',i);
  assert.ok(i>0&&end>i&&auth>end);
  const route=s.slice(i,end);
  assert.match(route,/claimReviewRenderJob/);
  assert.match(route,/reviewRendererJobClaimEnabled/);
  assert.match(route,/withOutputApprovalLock\(env.STUDIO_MEDIA,outputId,fn\)/);
  assert.match(route,/RENDER_REVIEW_TABLES.jobs/);
  assert.doesNotMatch(route,/graph.publish\(|APPROVE_ATTEMPT|RELEASE_REVIEW_HOLD|post_render/);
});
