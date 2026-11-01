import test from 'node:test';
import assert from 'node:assert/strict';
import {requestApprovedHeldCreativeRedo} from './rendering-review-held-redo.mjs';
import {reviewDispatchGate,REVIEW_SCHEMA,CHICAGO_PROFILE_ID} from './rendering-review-policy.mjs';

const outputId='recPnNYghmcJYivOA',actor='recABCD01234EFGHij';
const attemptId='rrimport_9593_864436ce242983f69fceaa68f37ac4';
const file='16osgGbNcyet_4WwDLiarSurkF3yXFOcq';
const sessionId='rrsession_6a40a9aa1fc63d4d48d411bd3fa8ed923ed6fb158a79a666';
const hold='rrhold-f233e320-2b48-4443-a022-c31f60d90ca6';
const approved=()=>({schema:REVIEW_SCHEMA,id:sessionId,output_id:outputId,
  profile_id:CHICAGO_PROFILE_ID,output_type:'Instagram Reel',
  state:'approved',version:9,approved_attempt_id:attemptId,current_attempt_id:attemptId,
  review_hold:{id:hold,owner:sessionId,active:true},
  attempts:[{id:'rroriginal_1234567890',number:1,status:'ready_for_review',artifact_id:'1JWiW5ieE5vqDV_V6xAr5YLQnXyjOZcdF'},
    {id:attemptId,number:2,status:'ready_for_review',artifact_id:file}],
  messages:[],processed:{},history:[],active_job:null,
  factory_handoff:null,original_do_not_publish:false,
  producer_candidate:null,plan:null,pending_authorization:null});
const fields=()=>({
  Studio_Render_Review_Hold_Active:true,Studio_Render_Review_Hold_ID:hold,
  Studio_Render_Review_Hold_Owner:sessionId,Studio_Render_Review_Session_ID:sessionId,
  Do_Not_Publish:true,Auto_Publish_Enabled:false,
  Final_File_ID:file,Final_File_URL:'https://drive.google.com/file/d/'+file+'/view',
  Render_Status:'Rendered',Output_Status:'Ready for Review',
  Review_Status:'Review Sent',Publish_Status:'Not Ready'
});
function setup(patch={}){
 let s=approved(),row={id:outputId,fields:{...fields(),...patch}};
 const actions={writes:0,locks:0,patches:0,renders:0};
 const operations={
  withOutputLock:async(id,fn)=>{actions.locks++;return fn()},
  readSession:async()=>JSON.parse(JSON.stringify(s)),
  readRawOutput:async()=>JSON.parse(JSON.stringify(row)),
  readNormalizedOutput:async()=>({id:outputId,profile_id:CHICAGO_PROFILE_ID,
    platform:'Instagram',output_type:'Instagram Reel'}),
  readField:(r,name)=>r.fields[name],
  saveSessionIfVersion:async({output_id,expected_version,next})=>{
    assert.equal(output_id,outputId);
    if(s.version!==expected_version)return false;
    actions.writes++;s=JSON.parse(JSON.stringify(next));return true;
  },
 };
 return {operations,actions,getSession:()=>s,getRow:()=>row,changeSession:v=>{s=v}};
}
const params=ops=>({output_id:outputId,actor_id:actor,expected_version:9,
 client_request_id:'heldredo_9593_12345678',
 note:'Redo this version. Keep my approved creative edits.',
 operations:ops,now:()=> '2026-11-01T16:30:00.000Z'});
test('watermark verification is never inspected on approved-held creative redo',async()=>{
 const a=setup();
 const v=await requestApprovedHeldCreativeRedo(params(a.operations));
 assert.equal(v.ok,true);assert.equal(v.redo_requested,true);
 assert.equal(v.render_queued,false);assert.equal(v.review_hold_active,true);
 assert.equal(v.publication_changed,false);
 assert.equal(a.actions.writes,1);
 const saved=a.getSession();
 assert.equal(saved.state,'discussing');
 assert.equal(saved.review_hold.active,true);
 assert.equal(saved.approved_attempt_id,null);
 assert.equal(saved.current_attempt_id,attemptId);
 assert.equal(saved.attempts[1].artifact_id,file);
 assert.equal(saved.messages.at(-1).content,params(a.operations).note);
 assert.equal(a.getRow().fields.Do_Not_Publish,true);
 assert.equal(reviewDispatchGate(saved,{},{}).reason,'REVIEW_HOLD_ACTIVE');
});
test('identical request is idempotent and does not append feedback twice',async()=>{
 const a=setup();
 const first=await requestApprovedHeldCreativeRedo(params(a.operations));
 const again=await requestApprovedHeldCreativeRedo(params(a.operations));
 assert.equal(first.replay,false);assert.equal(again.replay,true);
 assert.equal(a.actions.writes,1);assert.equal(a.getSession().messages.length,1);
});
test('refuses missing hold, active publishing, scheduled, altered or foreign media',async()=>{
 const patches=[
  {Studio_Render_Review_Hold_Active:false},{Do_Not_Publish:false},
  {Auto_Publish_Enabled:true},{Publish_Locked_By:'publisher-worker'},
  {Scheduled_Post_Date:'2026-11-02T12:00:00Z'},
  {Final_File_ID:'changedsource-0123456789'},
  {Output_Status:'Approved for Publishing'}
 ];
 for(const patch of patches){
  const a=setup(patch);
  await assert.rejects(requestApprovedHeldCreativeRedo(params(a.operations)),
    e=>e.code==='REDO_OUTPUT_NOT_HELD');
  assert.equal(a.actions.writes,0);
 }
});
test('rejects stale version, forged actor and drifted attempt',async()=>{
 const a=setup();
 await assert.rejects(requestApprovedHeldCreativeRedo({...params(a.operations),expected_version:8}),
  e=>e.code==='REDO_APPROVAL_CHANGED');
 await assert.rejects(requestApprovedHeldCreativeRedo({...params(a.operations),actor_id:'other'}),
  e=>e.code==='REDO_SCOPE_DENIED');
 const drift=a.getSession();drift.approved_attempt_id='different_attempt_1';a.changeSession(drift);
 await assert.rejects(requestApprovedHeldCreativeRedo(params(a.operations)),
  e=>e.code==='REDO_APPROVAL_CHANGED');
 assert.equal(a.actions.writes,0);
});
