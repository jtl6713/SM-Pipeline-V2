import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeMasterKey,projectCreativeMasterGroup,readCreativeMasterRegistry,
  nextApprovedCreativeMaster,MASTER_FIELD,MASTER_SCHEMA} from './creative-master-registry.mjs';
const c=x=>structuredClone(x);
const contentId='recYhIjy4BW0U3WaW';
const igId='recPnNYghmcJYivOA';
const original='1JWiW5ieE5vqDV_V6xAr5YLQnXyjOZcdF';
const revised='16osgGbNcyet_4WwDLiarSurkF3yXFOcq';
const a='rrimport_9593_864436ce242983f69fceaa68f37ac4';
const v=(name)=>({name});
function output(id,platform,type,format='Vertical Short Video',ratio='9:16'){
  return {id,fields:{Content_Item:[contentId],Platform:v(platform),
    Platform_Output_Type:v(type),Output_ID:9593,
    Format:v(format),Aspect_Ratio:v(ratio),Publish_Status:v('Not Ready')}};
}
function fixture(){
  const outputs=[output(igId,'Instagram','Instagram Reel'),
    output('recyYKgkfRksIZPun','Facebook','Facebook Reel'),
    output('rec8JDQW2Jilnzc9u','TikTok','TikTok Video'),
    output('recgJR5bTcYfCCwAL','YouTube','YouTube Short'),
    output('recqw7DTgYsqYkl51','Instagram','Instagram Story','Story'),
    output('recZ1X5QfeFZTot1F','Facebook','Facebook Story','Story')];
  outputs[1].fields.Scheduled_Post_Date='2026-11-29';
  outputs[2].fields.Published_At='2026-10-30';
  const content={id:contentId,fields:{Content_Type:v('Vertical Short Video'),
    'Platform Outputs':outputs.map(o=>o.id)}};
  const session={id:'rrsession_6a40a9aa1fc63d4d48d411bd3fa8ed923ed6fb158a79a666',
    output_id:igId,state:'approved',current_attempt_id:a,approved_attempt_id:a,
    review_hold:{active:true}};
  const attempt={id:a,status:'ready_for_review',artifact_id:revised};
  const proof={sha256:'864436ce242983f69fceaa68f37ac4002c2c382ab8c8189098bdc5cab2072d34',
    byte_count:46824860,mime_type:'video/mp4',
    audio_verified:true,watermark_verified:true,
    google_drive_verified:true,google_drive_mime_type:'video/mp4'};
  return {outputs,content,session,attempt,proof};
}
test('exact content + format + ratio, never a fixed platform count',()=>{
  const f=fixture();
  const result=projectCreativeMasterGroup({source:f.outputs[0],content:f.content,
    outputs:f.outputs});
  assert.equal(result.linked_count,4);
  assert.equal(result.key,'vertical short video|9:16');
  assert.equal(result.master,null);
  assert.deepEqual(result.outputs.map(o=>o.platform),['Instagram','Facebook','TikTok','YouTube']);
  const newOne=output('recA1B2C3D4E5F6G7','Future Social','New Video Type');
  f.content.fields['Platform Outputs'].push(newOne.id);
  assert.equal(projectCreativeMasterGroup({source:f.outputs[0],content:f.content,
    outputs:[...f.outputs,newOne]}).linked_count,5);
});
test('same 9:16 Stories do not inherit video creative',()=>{
  const f=fixture();
  assert.equal(projectCreativeMasterGroup({source:f.outputs[4],content:f.content,
    outputs:f.outputs}).linked_count,2);
  assert.notEqual(creativeMasterKey('Story','9:16'),creativeMasterKey('Vertical Short Video','9:16'));
});
test('scheduled or published sibling remains linked but untouched',()=>{
  const f=fixture(),before=JSON.stringify(f.outputs);
  const r=projectCreativeMasterGroup({source:f.outputs[0],content:f.content,
    outputs:f.outputs});
  assert.equal(r.outputs.find(o=>o.platform==='TikTok').dispatched,true);
  assert.equal(r.outputs.find(o=>o.platform==='Facebook').scheduled,true);
  assert.ok(r.outputs.every(o=>o.handoff==='link_only'&&o.delivery_unchanged));
  assert.equal(JSON.stringify(f.outputs),before);
});
test('approved creative master registry version is content-owned, with QA evidence',()=>{
  const f=fixture();
  const r=nextApprovedCreativeMaster({...f,source:f.outputs[0],
    at:'2026-10-31T21:55:00Z'});
  assert.equal(r.changed,true);assert.equal(r.master.version,1);
  assert.equal(r.master.publishing_authorized,false);
  assert.equal(r.master.platform_media_replaced,false);
  assert.equal(r.master.file_id,revised);
  f.content.fields[MASTER_FIELD]=JSON.stringify(r.registry);
  const shown=projectCreativeMasterGroup({source:f.outputs[0],content:f.content,
    outputs:f.outputs});
  assert.equal(shown.master.approved_attempt_id,a);assert.equal(shown.linked_count,4);
  assert.equal(nextApprovedCreativeMaster({...f,source:f.outputs[0],
    at:'2026-10-31T21:56:00Z'}).changed,false);
});
test('a newer approved attempt from same source advances only its format key',()=>{
  const f=fixture();
  const first=nextApprovedCreativeMaster({...f,source:f.outputs[0],at:'2026-10-31'});
  f.content.fields[MASTER_FIELD]=JSON.stringify(first.registry);
  f.session.current_attempt_id=f.session.approved_attempt_id='rrattempt_next_12345678';
  f.attempt.id='rrattempt_next_12345678';f.attempt.artifact_id=original;
  const next=nextApprovedCreativeMaster({...f,source:f.outputs[0],at:'2026-11-01'});
  assert.equal(next.master.version,2);
  assert.equal(next.master.file_id,original);
});
test('independent media proof and current creative approval required',()=>{
  const f=fixture();
  for(const bad of [
    v=>v.session.state='discussing',
    v=>v.session.review_hold.active=false,
    v=>v.session.approved_attempt_id='different',
    v=>v.proof.audio_verified=false,
    v=>v.proof.watermark_verified=false,
    v=>v.proof.google_drive_verified=false,
    v=>v.proof.sha256='invalid',
  ]){
    const candidate=c(f);bad(candidate);
    assert.throws(()=>nextApprovedCreativeMaster({...candidate,source:candidate.outputs[0],
      at:'2026-10-31'}));
  }
});
test('refuse cross-content, missing format and incomplete membership',()=>{
  const f=fixture();
  assert.throws(()=>projectCreativeMasterGroup({source:f.outputs[0],content:f.content,
    outputs:f.outputs.slice(0,3)}),e=>e.code==='CREATIVE_MASTER_MEMBERS_INCOMPLETE');
  const other=c(f.outputs[1]);other.fields.Content_Item=['recOtherItem12345'];
  assert.throws(()=>projectCreativeMasterGroup({source:f.outputs[0],content:f.content,
    outputs:[f.outputs[0],other,...f.outputs.slice(2)]}),e=>e.code==='CREATIVE_MASTER_MEMBER_CONTENT_MISMATCH');
  assert.equal(creativeMasterKey('','9:16'),'');
  assert.equal(creativeMasterKey('Video',''),'');
  assert.throws(()=>readCreativeMasterRegistry('{bad json'));
});
test('different source output cannot silently overwrite existing approved master',()=>{
  const f=fixture();
  const first=nextApprovedCreativeMaster({...f,source:f.outputs[0],at:'2026-10-31'});
  f.content.fields[MASTER_FIELD]=JSON.stringify(first.registry);
  f.session.output_id=f.outputs[1].id;
  assert.throws(()=>nextApprovedCreativeMaster({...f,source:f.outputs[1],at:'2026-11-01'}),
    e=>e.code==='CREATIVE_MASTER_COMPETING_SOURCE');
});
test('unknown/mismatched registry cannot be treated as approved',()=>{
  const f=fixture();
  f.content.fields[MASTER_FIELD]=JSON.stringify({schema:MASTER_SCHEMA,masters:{
    'vertical short video|9:16':{key:'story|9:16',content_item_id:contentId,
      source_output_id:igId,file_id:revised}
  }});
  assert.throws(()=>projectCreativeMasterGroup({source:f.outputs[0],content:f.content,
    outputs:f.outputs}),e=>e.code==='CREATIVE_MASTER_BINDING_UNVERIFIED');
});

test('completed Factory transfer replays only the exact preexisting approved master',()=>{
  const f=fixture();
  const first=nextApprovedCreativeMaster({...f,source:f.outputs[0],at:'2026-10-31'});
  f.content.fields[MASTER_FIELD]=JSON.stringify(first.registry);
  f.session.review_hold.active=false;
  f.session.factory_handoff={status:'ready_for_factory_approval',
    attempt_id:a,artifact_id:revised};
  assert.equal(nextApprovedCreativeMaster({...f,source:f.outputs[0],
    at:'2026-11-01'}).changed,false);
  delete f.content.fields[MASTER_FIELD];
  assert.throws(()=>nextApprovedCreativeMaster({...f,source:f.outputs[0],
    at:'2026-11-01'}),e=>e.code==='CREATIVE_MASTER_REPLAY_MISSING');
});
