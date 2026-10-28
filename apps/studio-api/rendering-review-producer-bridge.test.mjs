import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleReviewProducerProposal as handle,reviewProducerBridgeEnabled as enabled}
  from "./rendering-review-producer-bridge.mjs";

const OUTPUT="recA1B2C3D4E5F6G7";
const SESSION="rrsession_1234567890";
const CHICAGO="recT2rbKX3MF7cVFU";
const flags={
  RENDERING_REVIEW_PRODUCER_BRIDGE_ENABLED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
  PIPELINE_RUNNER_URL:"https://runner.test",
  PIPELINE_RUNNER_SHARED_SECRET:"runner-test-secret",
};
const auth={authenticated:true,authorized:true,permissions:{outputs_review:true},
  user:{record_id:"recU1S2E3R4I5D6A7"}};
const body={direction:"Make the steps explicit and keep the existing opening.",
  expected_version:2,client_request_id:"request-12345678"};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture({status=200,badResponse=false}={}){
  const hold={id:"rrhold-12345678",owner:SESSION,output_id:OUTPUT,verified:true,active:true};
  const session={id:SESSION,output_id:OUTPUT,profile_id:CHICAGO,
    output_type:"Instagram Reel",state:"discussing",version:2,
    current_attempt_id:"attempt-12345678",
    review_hold:{id:hold.id,owner:SESSION,active:true}};
  const output={id:OUTPUT,profile_id:CHICAGO,platform:"Instagram",
    output_type:"Instagram Reel",publish_status:"Ready to Schedule"};
  const counts={locks:0,model:0,reads:0,writes:0};
  const operations={
    authorizeReview:async()=>true,
    withOutputLock:async(_id,fn)=>{counts.locks++;return fn();},
    readOutput:async()=>{counts.reads++;return clone(output);},
    loadSession:async()=>clone(session),
    readHold:async()=>clone(hold),
  };
  const runnerFetch=async(url,options)=>{
    counts.model++;
    assert.equal(url,"https://runner.test/jobs/rendering-review/propose");
    assert.equal(options.headers["X-Pipeline-Secret"],flags.PIPELINE_RUNNER_SHARED_SECRET);
    assert.deepEqual(JSON.parse(options.body),{
      output_id:OUTPUT,session_id:SESSION,expected_version:2,direction:body.direction,
    });
    return {ok:status===200,status,json:async()=>({
      ok:status===200,output_id:OUTPUT,session_id:SESSION,expected_version:2,
      authorization:"none",render_queued:false,publication_changed:false,
      proposal:{candidate_only:true,requires_fact_validation:true,
        visual_inspection_performed:badResponse===true,candidate:{changes:["More detail"]}},
    })};
  };
  async function send(changes={},extra={}){
    const request=new Request("https://studio.test/api/rendering-review/outputs/"+OUTPUT+"/producer-proposal",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...body,...changes}),
    });
    return handle({request,env:extra.env||flags,authorization:extra.auth||auth,
      output_id:OUTPUT,assertWriteRequest:()=>{counts.writes++;},operations,runnerFetch});
  }
  return {send,session,hold,output,counts};
}
test("bridge is default-off and requires every protected deployment gate",async()=>{
  const f=fixture();
  assert.equal(enabled({}),false);
  for(const key of Object.keys(flags).filter(k=>k.startsWith("RENDERING_REVIEW_"))){
    const env={...flags};delete env[key];
    assert.equal(enabled(env),false);
    await assert.rejects(()=>f.send({}, {env}),e=>e.status===405);
  }
  assert.equal(f.counts.model,0);assert.equal(f.counts.writes,0);
});
test("authenticated read-only proposal passes exact server session to Runner",async()=>{
  const f=fixture();
  const result=await f.send();
  assert.equal(result.authorization,"none");
  assert.equal(result.persisted,false);
  assert.equal(result.render_queued,false);
  assert.equal(result.publication_changed,false);
  assert.equal(result.proposal.candidate_only,true);
  assert.equal(f.counts.model,1);
  assert.equal(f.counts.locks,2);
  assert.equal(f.counts.writes,1); // Studio CSRF/write gate, not an Airtable mutation
});
test("client cannot impersonate roles, supply evidence, or authorize side effects",async()=>{
  const f=fixture();
  for(const extra of [{role:"producer"},{model_context:"fabricated"},
    {publish:true},{commit_plan:true},{session_id:SESSION},{intent:"go ahead"},
    {expected_version:true},{direction:""}, {direction:"x".repeat(3001)}]){
    await assert.rejects(()=>f.send(extra),e=>e.status===400);
  }
  assert.equal(f.counts.model,0);
});
test("permission, scope and existing review hold are independently required",async()=>{
  const f=fixture();
  await assert.rejects(()=>f.send({}, {auth:{...auth,permissions:{}}}),e=>e.status===403);
  f.output.profile_id="recANOTHER1234567";
  await assert.rejects(()=>f.send(),e=>e.status===403);
  f.output.profile_id=CHICAGO;
  f.hold.active=false;
  await assert.rejects(()=>f.send(),e=>e.status===409);
  assert.equal(f.counts.model,0);
});
test("publisher owner, remote media and stale session block model before call",async()=>{
  const f=fixture();
  f.output.publish_locked_by="ap1-ig";
  await assert.rejects(()=>f.send(),e=>e.status===409);
  delete f.output.publish_locked_by;
  f.output.platform_media_id="1789000000000";
  await assert.rejects(()=>f.send(),e=>e.status===409);
  delete f.output.platform_media_id;
  f.session.version=3;
  await assert.rejects(()=>f.send(),e=>e.status===409);
  assert.equal(f.counts.model,0);
});
test("changed authoritative session after model is rejected without committing",async()=>{
  const f=fixture();
  const ops={authorizeReview:async()=>true,withOutputLock:async(_id,fn)=>fn(),
    readOutput:async()=>clone(f.output),loadSession:async()=>clone(f.session),
    readHold:async()=>clone(f.hold)};
  const request=new Request("https://studio.test/review",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const runnerFetch=async()=>{
    f.session.version=3; // Another reviewer changed the session during the model call.
    return {
      ok:true,status:200,
      json:async()=>({
        ok:true,output_id:OUTPUT,session_id:SESSION,expected_version:2,
        authorization:"none",render_queued:false,publication_changed:false,
        proposal:{candidate_only:true,requires_fact_validation:true,
          visual_inspection_performed:false},
      }),
    };
  };
  await assert.rejects(()=>handle({
    request,env:flags,authorization:auth,output_id:OUTPUT,
    assertWriteRequest:()=>{},operations:ops,runnerFetch,
  }),e=>e.status===409);
});
test("invalid upstream authority claims and upstream errors never become proposals",async()=>{
  const f=fixture({badResponse:true});
  await assert.rejects(()=>f.send(),e=>e.status===502);
  const g=fixture({status:503});
  await assert.rejects(()=>g.send(),e=>e.status===502);
});
test("Worker route has protected reviewer, Chicago scope and NO publish action",()=>{
  const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const b=worker.indexOf("const proposalMatch = ");
  const e=worker.indexOf("const acceptMatch = ",b);
  assert.ok(b>0 && e>b,"Protected Producer proposal route not mounted");
  const route=worker.slice(b,e);
  assert.match(route,/reviewProducerBridgeEnabled\(env\)/);
  assert.match(route,/reviewAuthorizedProfiles\(env, authorization\)/);
  assert.match(route,/CHICAGO_PROFILE_ID/);
  assert.match(route,/handleReviewProducerProposal/);
  assert.match(route,/mutationGate: false/);
  assert.doesNotMatch(route,/graph\.publish\(|COMMIT_PLAN|APPROVE_ATTEMPT|publishNow/);
});


test('Runner producer errors are actionable but never expose upstream private response data',async()=>{
  const f=fixture();
  const request=new Request("https://studio.test/api/rendering-review/outputs/"+OUTPUT+"/producer-conversation",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const cases=[
    [405,"producer_proposal_disabled",503,/not enabled/],
    [422,"producer_proposal_invalid",502,/invalid revision proposal/],
    [502,"producer_model_unavailable",502,/AI service could not generate/],
    [503,"review_evidence_unavailable",503,/could not read the saved Reel context/],
  ];
  for(const [status,code,wantStatus,pattern] of cases){
    await assert.rejects(()=>handle({
      request:request.clone(),env:flags,authorization:auth,output_id:OUTPUT,
      assertWriteRequest:()=>{},operations:{
        authorizeReview:async()=>true,withOutputLock:async(_id,fn)=>fn(),
        readOutput:async()=>f.output,loadSession:async()=>f.session,
        readHold:async()=>f.hold,
      },
      runnerFetch:async()=>({ok:false,status,json:async()=>({ok:false,error:code,
        debug_secret:"NEVER-SHOW-PRIVATE-DETAILS"})}),
    }),e=>e.status===wantStatus&&pattern.test(e.message)&&
      !e.message.includes("NEVER-SHOW-PRIVATE-DETAILS"));
  }
});
