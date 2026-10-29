import test from "node:test";
import assert from "node:assert/strict";
import {requestFactoryRevisionFeedback} from "./rendering-review-factory-feedback.mjs";
import {reviewDispatchGate} from "./rendering-review-policy.mjs";
const output="rec0uVrVeiUM6shp9",chicago="recT2rbKX3MF7cVFU";
const attempt="rrattempt_26054929500b8abe981e3f6131b5c668209bf9c765edb06c";
const file="1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up",owner="rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796";
const hold="rrhold-64201956-6207-464a-8e9c-616974479c1c";
const clone=x=>structuredClone(x);
function fixture(){
 let session={schema:"studio.render-review.1",id:owner,output_id:output,
  profile_id:chicago,output_type:"Instagram Reel",version:13,
  state:"approved",review_hold:{id:hold,owner,active:false},original_do_not_publish:false,
  current_attempt_id:attempt,approved_attempt_id:attempt,
  factory_handoff:{attempt_id:attempt,artifact_id:file,status:"ready_for_factory_approval"},
  attempts:[{id:attempt,number:2,artifact_id:file,status:"ready_for_review"}],
  messages:[],history:[],processed:{},plan:null};
 let row={id:output,fields:{Final_File_ID:file,Platform:"Instagram",
  Platform_Output_Type:"Instagram Reel",Output_Status:"Ready for Review",
  Review_Status:"Review Sent",Publish_Status:"Not Ready",
  Auto_Publish_Enabled:false}};
 const counts={patch:0,save:0,sync:0};
 let abort=false;
 const ops={
  withOutputLock:async(_,run)=>run(),
  readSession:async()=>clone(session),
  readRawOutput:async()=>clone(row),
  readField:(x,k)=>x.fields[k],
  patchOutput:async(_,fields)=>{counts.patch++;row.fields={...row.fields,...clone(fields)}},
  saveSessionIfVersion:async({expected_version,next})=>{
    if(abort)throw new Error("lost session response");
    assert.equal(expected_version,session.version);
    session=clone(next);counts.save++;return true;
  },
  syncOutput:async()=>{counts.sync++;return {ok:true}},
 };
 const submit=(note="Please adjust the music levels",client_request_id="factory_change_12345678")=>
  requestFactoryRevisionFeedback({output_id:output,env:{RENDERING_REVIEW_EXACT_OUTPUT_ID:output},
   actor:"recA1B2C3D4E5F6G7",note,client_request_id,operations:ops});
 return {submit,ops,counts,get session(){return session},get row(){return row},abort:x=>abort=x};
}
test("accepted V2 returns to same Producer transcript and cannot publish",async()=>{
 const f=fixture();
 const receipt=await f.submit();
 assert.equal(receipt.rendering_review_reopened,true);
 assert.equal(receipt.note_saved,true);
 assert.equal(f.session.version,14);
 assert.equal(f.session.state,"discussing");
 assert.equal(f.session.approved_attempt_id,null);
 assert.equal(f.session.current_attempt_id,attempt);
 assert.equal(f.session.review_hold.active,true);
 assert.equal(f.session.messages.at(-1).content,"Please adjust the music levels");
 assert.equal(f.session.messages.at(-1).source,"factory_request_changes");
 assert.equal(f.row.fields.Final_File_ID,file);
 assert.equal(f.row.fields.Do_Not_Publish,true);
 assert.equal(f.row.fields.Studio_Render_Review_Hold_Active,true);
 assert.equal(f.row.fields.Auto_Publish_Enabled,false);
 assert.equal(f.row.fields.Output_Status,"In Production");
 assert.equal(f.row.fields.Review_Status,"Changes Requested");
 assert.equal(f.counts.save,1);
 assert.equal(f.counts.patch,1);
 const dispatch=reviewDispatchGate(f.session,{}, {attempt_id:attempt,artifact_id:file});
 assert.equal(dispatch.allowed,false);
});
test("retry after durable hold before session save never releases protection",async()=>{
 const f=fixture();f.abort(true);
 await assert.rejects(f.submit(),/lost session response/);
 assert.equal(f.row.fields.Do_Not_Publish,true);
 f.abort(false);
 assert.equal((await f.submit()).rendering_review_reopened,true);
 assert.equal(f.counts.patch,1);
 assert.equal(f.session.messages.length,1);
});
test("duplicate delivery is idempotent and conflicting note denied",async()=>{
 const f=fixture();await f.submit();
 assert.equal((await f.submit()).replay,true);
 assert.equal(f.counts.save,1);
 await assert.rejects(f.submit("Different note"),e=>e.code==="FACTORY_REVISION_REPLAY_CONFLICT");
});
test("no schedule, already published, changed file or hold owner ever passes",async()=>{
 for(const change of [
  f=>{f.row.fields.Scheduled_Post_Date="2026-11-01T12:00:00.000Z"},
  f=>{f.row.fields.Platform_Post_ID="already-posted"},
  f=>{f.row.fields.Final_File_ID="untrusted"},
  f=>{f.row.fields.Studio_Render_Review_Hold_ID="someone-else"},
 ]){
  const f=fixture();change(f);
  await assert.rejects(f.submit());
  assert.equal(f.counts.patch,0);
 }
});
