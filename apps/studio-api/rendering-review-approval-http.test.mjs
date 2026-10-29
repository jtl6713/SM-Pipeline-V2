import test from "node:test";
import assert from "node:assert/strict";
import {acceptReviewCreativeOnly,reviewCreativeApprovalEnabled} from "./rendering-review-approval-http.mjs";
import {enrollReview,REVIEW_PILOT,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
const outputId="recA1B2C3D4E5F6G7";
const actor="recP1I2L3O4T5R6V7";
const flags={RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED:"true",
  RENDERING_REVIEW_ENROLL_WRITES_ENABLED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
  RENDERING_REVIEW_EXACT_OUTPUT_ID:outputId};
const auth={authenticated:true,authorized:true,user:{record_id:actor},
  permissions:{outputs_review:true}};
function fixture(){
  let output={id:outputId,profile_id:CHICAGO_PROFILE_ID,platform:"Instagram",
    output_type:"Instagram Reel",render_status:"Rendered",
    final_file_id:"source-drive-file-123456",publish_status:"Not Ready",
    do_not_publish:true,review_hold_active:true};
  const hold={verified:true,active:true,id:"rrhold-12345678",
    owner:"rrsession-12345678",output_id:outputId};
  let session=enrollReview(output,hold,{...REVIEW_PILOT,enabled:true},{
    session_id:hold.owner,original_attempt_id:"rroriginal-12345678"});
  let writes=0;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const ops={
    authorizeReview:async id=>id===outputId,
    authorizeEvent:async(_id,e)=>e.type==="APPROVE_ATTEMPT"&&e.pilot_creative_only===true,
    withOutputLock:async(_id,fn)=>fn(),
    loadSession:async()=>clone(session),readSession:async()=>clone(session),
    readHold:async()=>clone(hold),readOutput:async()=>clone(output),
    saveSessionIfVersion:async({expected_version,next})=>{
      if(session.version!==expected_version)return false;
      session=clone(next);writes++;return true;
    }
  };
  const send=async(opts={})=>{
    const req=new Request("https://studio.example/api/rendering-review/outputs/"+outputId+"/approve",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        expected_version:1,attempt_id:session.current_attempt_id,client_request_id:"pilot-accept-12345678"})});
    return acceptReviewCreativeOnly({request:req,env:opts.env||flags,
      authorization:auth,output_id:outputId,operations:ops,assertWriteRequest:()=>{},
    afterCreativeAcceptance:opts.afterCreativeAcceptance||null});
  };
  return {send,get session(){return session},get output(){return output},
    set output(o){output=o},get writes(){return writes}};
}
test("creative accept is OFF by default and denies without enabling protected release flag",async()=>{
  assert.equal(reviewCreativeApprovalEnabled({}),false);
  const f=fixture();
  await assert.rejects(()=>f.send({env:{...flags,RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED:"false"}}),e=>e.status===405);
  assert.equal(f.writes,0);
});
test("reviewer's acceptance persists current attempt while never clearing hold or changing publishing",async()=>{
  const f=fixture();
  const r=await f.send();
  assert.equal(r.ok,true);assert.equal(r.accepted,true);
  assert.equal(r.review_hold_active,true);assert.equal(r.publication_changed,false);
  assert.equal(r.instagram_upload_created,false);
  assert.equal(f.session.state,"approved");
  assert.equal(f.session.review_hold.active,true);
  assert.equal(f.session.approved_attempt_id,f.session.current_attempt_id);
  assert.equal(f.output.do_not_publish,true);
  assert.equal(f.writes,1);
});
test("creative approval rejects output without durable publication safety and makes no write",async()=>{
  const f=fixture();f.output={...f.output,do_not_publish:false};
  await assert.rejects(()=>f.send(),e=>e.code==="REVIEW_PUBLICATION_FENCE_LOST");
  assert.equal(f.writes,0);
});

test("creative acceptance also invokes guarded Factory handoff automatically",async()=>{
  const f=fixture();
  let calls=0;
  const result=await f.send({afterCreativeAcceptance:async()=>{
    calls++;return {ready_for_factory:true,session_version:2,factory_mirror_synced:true};
  }});
  assert.equal(calls,1);
  assert.equal(result.accepted,true);
  assert.equal(result.ready_for_factory,true);
  assert.equal(result.factory_mirror_synced,true);
  assert.equal(result.published,false);
  assert.equal(result.scheduled,false);
});
test("failed Factory handoff does not misreport committed creative acceptance",async()=>{
  const f=fixture();
  const result=await f.send({afterCreativeAcceptance:async()=>{
    const error=new Error("Temporary mirror failure");error.code="FACTORY_BUSY";throw error;
  }});
  assert.equal(f.session.state,"approved");
  assert.equal(result.accepted,true);
  assert.equal(result.factory_handoff_pending,true);
  assert.equal(result.reason,"FACTORY_BUSY");
  assert.equal(result.publication_changed,false);
});
