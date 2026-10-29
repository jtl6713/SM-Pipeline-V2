import test from "node:test";
import assert from "node:assert/strict";
import {returnFactoryRevisionToProducer} from "./rendering-review-factory-return.mjs";
const id="rec0uVrVeiUM6shp9",attemptId="rrattempt_exact_26054929500";
const v2="1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up";
const sid="rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796";
const hid="rrhold-64201956-6207-464a-8e9c-616974479c1c";
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 let session={schema:"studio.render-review.1",id:sid,output_id:id,
  profile_id:"recT2rbKX3MF7cVFU",output_type:"Instagram Reel",
  state:"approved",version:13,original_do_not_publish:false,
  review_hold:{id:hid,owner:sid,active:false},
  current_attempt_id:attemptId,approved_attempt_id:attemptId,
  factory_handoff:{status:"ready_for_factory_approval",attempt_id:attemptId,artifact_id:v2},
  attempts:[{id:attemptId,number:2,status:"ready_for_review",artifact_id:v2}],
  messages:[],history:[],processed:{},plan:null,
 };
 let row={id,fields:{Final_File_ID:v2,Platform:"Instagram",
  Platform_Output_Type:"Instagram Reel",Render_Status:"Rendered",
  Output_Status:"Ready for Review",Review_Status:"Review Sent",
  Publish_Status:"Not Ready",Auto_Publish_Enabled:false,
 }};
 const counts={patches:0,sessions:0,mirrors:0};
 const ops={
  withOutputLock:async(id,fn)=>fn(),
  readSession:async()=>clone(session),readRawOutput:async()=>clone(row),
  readField:(r,k)=>r.fields[k],
  readAttempt:async()=>({fields:{
    Attempt_ID:attemptId,Output_Record_ID:id,
    Session_ID:sid,Artifact_File_ID:v2,
  }}),
  patchOutput:async(_,fields)=>{counts.patches++;Object.assign(row.fields,fields)},
  saveSessionIfVersion:async({expected_version,next})=>{
    if(expected_version!==session.version)return false;
    session=clone(next);counts.sessions++;return true;
  },
  syncOutput:async()=>{counts.mirrors++;return {ok:true}},
 };
 const invoke=(note="Please replace the second image with a daytime Riverwalk photo",
   client_request_id="factory_test_one")=>returnFactoryRevisionToProducer({
      output_id:id,note,client_request_id,
      env:{RENDERING_REVIEW_EXACT_OUTPUT_ID:id},operations:ops,
      now:()=> "2026-10-29T19:30:00.000Z",
    });
 return {ops,invoke,counts,get session(){return session},
  get row(){return row}};
}
test("Factory Request Changes saves exact note and returns to existing held conversation",async()=>{
 const f=fixture(),result=await f.invoke();
 assert.equal(result.received,true);
 assert.equal(result.open_page,"rendering-review");
 assert.equal(result.review_hold_active,true);
 assert.equal(result.queued_for_render,false);
 assert.equal(result.approved_for_publishing,false);
 assert.equal(f.session.state,"discussing");
 assert.equal(f.session.messages.length,1);
 assert.equal(f.session.messages[0].source,"factory_request_changes");
 assert.equal(f.session.messages[0].attempt_id,attemptId);
 assert.match(f.session.messages[0].content,/daytime Riverwalk/);
 assert.equal(f.session.review_hold.active,true);
 assert.equal(f.row.fields.Do_Not_Publish,true);
 assert.equal(f.row.fields.Studio_Render_Review_Hold_ID,hid);
 assert.equal(f.row.fields.Final_File_ID,v2);
 assert.equal(f.row.fields.Scheduled_Post_Date,undefined);
 assert.equal(f.counts.sessions,1);
});
test("replay is idempotent and does not duplicate notes or hold",async()=>{
 const f=fixture();await f.invoke();const same=await f.invoke();
 assert.equal(same.replay,true);assert.equal(f.counts.sessions,1);
 assert.equal(f.counts.patches,1);
 assert.equal(f.session.messages.length,1);
});
test("scheduled or published output cannot be reheld",async()=>{
 for(const prop of ["Scheduled_Post_Date","Published_At","Platform_Post_ID"]){
  const f=fixture();f.row.fields[prop]="blocked";
  await assert.rejects(f.invoke());
  assert.equal(f.counts.patches,0);
 }
});
