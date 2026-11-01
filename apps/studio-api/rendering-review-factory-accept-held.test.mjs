import test from "node:test";
import assert from "node:assert/strict";
import {acceptFactoryHeldCreative} from "./rendering-review-factory-accept-held.mjs";
import {REVIEW_SCHEMA,CHICAGO_PROFILE_ID,reviewDispatchGate,applyReviewEvent} from "./rendering-review-policy.mjs";

const outputId="recPnNYghmcJYivOA";
const actor="recABCDEFGHIJKLMN";
const attemptId="rrimport_9593_864436ce242983f69fceaa68f37ac4";
const file="16osgGbNcyet_4WwDLiarSurkF3yXFOcq";
const sid="rrsession_6a40a9aa1fc63d4d48d411bd3fa8ed923ed6fb158a79a666";
const hid="rrhold-f233e320-2b48-4443-a022-c31f60d90ca6";
const source="1JWiW5ieE5vqDV_V6xAr5YLQnXyjOZcdF";
const session=()=>({schema:REVIEW_SCHEMA,id:sid,output_id:outputId,
  profile_id:CHICAGO_PROFILE_ID,output_type:"Instagram Reel",state:"approved",version:9,
  original_do_not_publish:false,review_hold:{id:hid,owner:sid,active:true},
  current_attempt_id:attemptId,approved_attempt_id:attemptId,active_job:null,
  plan:null,producer_candidate:null,pending_authorization:null,
  messages:[],processed:{},history:[],
  attempts:[{id:"rroriginal_1234567890",number:1,status:"ready_for_review",artifact_id:source},
    {id:attemptId,number:2,status:"ready_for_review",artifact_id:file}]});
const fields=()=>({
  Studio_Render_Review_Hold_Active:true,Studio_Render_Review_Hold_ID:hid,
  Studio_Render_Review_Hold_Owner:sid,Studio_Render_Review_Session_ID:sid,
  Do_Not_Publish:true,Auto_Publish_Enabled:false,
  Final_File_ID:file,Final_File_URL:"https://drive.google.com/file/d/"+file+"/view",
  Render_Status:"Rendered",Output_Status:"Ready for Review",
  Review_Status:"Review Sent",Publish_Status:"Not Ready",
});
function fixture(overrides={}){
  let s=session(),row={id:outputId,fields:{...fields(),...overrides}},writes=0;
  const o={
    withOutputLock:async(id,fn)=>{assert.equal(id,outputId);return fn()},
    readSession:async()=>structuredClone(s),
    readRawOutput:async()=>structuredClone(row),
    readNormalizedOutput:async()=>({id:outputId,profile_id:CHICAGO_PROFILE_ID,
      platform:"Instagram",output_type:"Instagram Reel"}),
    readField:(r,k)=>r.fields[k],
    saveSessionIfVersion:async({output_id,expected_version,next})=>{
      assert.equal(output_id,outputId);
      if(s.version!==expected_version)return false;
      s=structuredClone(next);writes++;return true;
    },
  };
  return {o,get session(){return s},get row(){return row},
    get writes(){return writes},setSession:v=>{s=v}};
}
const args=o=>({output_id:outputId,actor_id:actor,expected_version:9,
  client_request_id:"factoryheldreview_9593_1234",operations:o,
  now:()=> "2026-11-01T17:32:00.000Z"});

test("held #9593 Factory can accept human creative review despite absent watermark QA",async()=>{
  const f=fixture();const original=structuredClone(f.row.fields);
  const receipt=await acceptFactoryHeldCreative(args(f.o));
  assert.equal(receipt.factory_creative_accepted,true);
  assert.equal(receipt.qa_pending,true);
  assert.equal(receipt.publishing_authorized,false);
  assert.equal(receipt.review_hold_active,true);
  assert.equal(receipt.scheduled,false);
  assert.equal(receipt.public_post_created,false);
  assert.equal(f.session.factory_review.status,"accepted_pending_qa");
  assert.equal(f.session.factory_review.artifact_id,file);
  assert.equal(f.session.approved_attempt_id,attemptId);
  assert.equal(f.session.review_hold.active,true);
  assert.deepEqual(f.row.fields,original);
  assert.equal(f.writes,1);
  assert.equal(reviewDispatchGate(f.session,{},{}).reason,"REVIEW_HOLD_ACTIVE");
});
test("same Factory review request is idempotent without duplicate writes",async()=>{
  const f=fixture();
  await acceptFactoryHeldCreative(args(f.o));
  assert.equal((await acceptFactoryHeldCreative(args(f.o))).replay,true);
  assert.equal(f.writes,1);
});
test("held Factory creative approval fails closed on absent hold, changed media, schedule and dispatch",async()=>{
  for(const patch of [
    {Do_Not_Publish:false},
    {Studio_Render_Review_Hold_Active:false},
    {Studio_Render_Review_Hold_ID:"other"},
    {Final_File_ID:source},
    {Auto_Publish_Enabled:true},
    {Publish_Started_At:"2026-11-01T17:00:00Z"},
    {Scheduled_Post_Date:"2026-11-02T11:00:00Z"},
    {Review_Status:"Approved"},
  ]){
    const f=fixture(patch);
    await assert.rejects(acceptFactoryHeldCreative(args(f.o)),
      e=>e.code==="FACTORY_CREATIVE_NOT_HELD");
    assert.equal(f.writes,0);
  }
});
test("held acceptance requires current creative approval, exact actor and version",async()=>{
  const f=fixture();
  await assert.rejects(acceptFactoryHeldCreative({...args(f.o),actor_id:"not-a-record"}),
    e=>e.code==="FACTORY_CREATIVE_SCOPE");
  await assert.rejects(acceptFactoryHeldCreative({...args(f.o),expected_version:7}),
    e=>e.code==="FACTORY_CREATIVE_VERSION_CHANGED");
  let changed=f.session;changed.approved_attempt_id=null;f.setSession(changed);
  await assert.rejects(acceptFactoryHeldCreative(args(f.o)),
    e=>e.code==="FACTORY_CREATIVE_NOT_HELD");
  assert.equal(f.writes,0);
});

test("Factory QA resolution replaces pending label without erasing human acceptance",async()=>{
  const f=fixture();await acceptFactoryHeldCreative(args(f.o));
  const accepted=f.session;
  const next=applyReviewEvent(accepted,{
    type:"FACTORY_HANDOFF",expected_version:accepted.version,
    attempt_id:attemptId,artifact_id:file,original_artifact_id:source,
    factory_receipt_verified:true,hold_id:hid,hold_owner:sid,
    idempotency_key:"rrfactoryhand_9593",fingerprint:"rrfactoryhand_9593",
    at:"2026-11-02T10:00:00Z",
  }).session;
  assert.equal(next.factory_review.status,"handoff_verified");
  assert.equal(next.factory_review.publishing_authorized,false);
  assert.equal(next.review_hold.active,false);
  assert.equal(next.factory_handoff.status,"ready_for_factory_approval");
});
test("requesting another creative redo invalidates the prior Factory human acceptance",async()=>{
  const f=fixture();await acceptFactoryHeldCreative(args(f.o));
  const before=f.session;
  const next=applyReviewEvent(before,{
    type:"REOPEN_APPROVED_HELD_REDO",expected_version:before.version,
    attempt_id:attemptId,artifact_id:file,
    hold_id:hid,hold_owner:sid,
    message_id:"rr_factory_redo_9593_note",note:"Please remove the phone glance.",
    idempotency_key:"rr_factory_redo_9593",fingerprint:"rr_factory_redo_9593",
    at:"2026-11-02T10:05:00Z",
  }).session;
  assert.equal(next.factory_review,null);
  assert.equal(next.state,"discussing");
  assert.equal(next.review_hold.active,true);
  assert.equal(next.approved_attempt_id,null);
});
