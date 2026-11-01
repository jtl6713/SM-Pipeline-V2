import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyApprovedFactoryHandoff} from './rendering-review-factory-gate.mjs';

const source='1JWiW5ieE5vqDV_V6xAr5YLQnXyjOZcdF';
const v2='16osgGbNcyet_4WwDLiarSurkF3yXFOcq';
const aid='rrimport_9593_864436ce242983f69fceaa68f37ac4';
const session=()=>({
 id:'rrsession_6a40a9aa1fc63d4d48d411bd3fa8ed923ed6fb158a79a666',
 output_id:'recPnNYghmcJYivOA',state:'approved',
 approved_attempt_id:aid,current_attempt_id:aid,
 review_hold:{active:true},
 attempts:[{id:'original',number:1,artifact_id:source},
           {id:aid,number:2,artifact_id:v2,status:'ready_for_review'}]
});
const qa=(watermark=false)=>[{
 fields:{
 Attempt_ID:aid,Session_ID:session().id,Output_Record_ID:session().output_id,
 Attempt_Number:2,Attempt_Status:'ready_for_review',Artifact_File_ID:v2,
 Artifact_URL:'https://drive.google.com/file/d/'+v2+'/view',
 Validation_Evidence_JSON:JSON.stringify({
  sha256:'864436ce242983f69fceaa68f37ac4002c2c382ab8c8189098bdc5cab2072d34',
  byte_count:46824860,mime_type:'video/mp4',width:1080,height:1920,
  audio_verified:true,watermark_verified:watermark,
  google_drive_verified:true,google_drive_mime_type:'video/mp4'
 })
 }}];

test('Michigan #9593: creative approval cannot promote media with watermark QA false',()=>{
 const s=session();
 const result=classifyApprovedFactoryHandoff({session:s,held:true,attemptRecords:qa(false)});
 assert.equal(result.status,'blocked');
 assert.equal(result.code,'WATERMARK_QA_REQUIRED');
 assert.equal(s.review_hold.active,true);
 assert.equal(s.approved_attempt_id,aid);
});
test('same exact saved V2 can become preflight ready only after independent evidence',()=>{
 const result=classifyApprovedFactoryHandoff({session:session(),held:true,attemptRecords:qa(true)});
 assert.equal(result.status,'ready');
 assert.equal(result.code,'QA_PREFLIGHT_PASSED');
});
test('lost hold, missing evidence and mismatched attempt remain blocked',()=>{
 assert.equal(classifyApprovedFactoryHandoff({
  session:session(),held:false,attemptRecords:qa(true)}).code,'REVIEW_HOLD_NOT_VERIFIED');
 assert.equal(classifyApprovedFactoryHandoff({
  session:session(),held:true,attemptRecords:[]}).code,'QA_ATTEMPT_NOT_VERIFIED');
 const wrong=qa(true);wrong[0].fields.Artifact_File_ID=source;
 assert.equal(classifyApprovedFactoryHandoff({
  session:session(),held:true,attemptRecords:wrong}).code,'QA_ATTEMPT_MISMATCH');
});
test('unavailable QA never claims readiness',()=>{
 const result=classifyApprovedFactoryHandoff({
  session:session(),held:true,attemptRecords:null});
 assert.equal(result.status,'unavailable');
});
test('completed Factory handoff is reported without retry or fresh attempt read',()=>{
 const s=session();
 s.review_hold.active=false;
 s.factory_handoff={attempt_id:aid,artifact_id:v2};
 assert.equal(classifyApprovedFactoryHandoff({
  session:s,held:false,attemptRecords:[]}).status,'transferred');
});
test('unapproved and still-in-review sessions have no Factory gate',()=>{
 const s=session();s.state='ready_for_review';
 assert.equal(classifyApprovedFactoryHandoff({
  session:s,held:true,attemptRecords:qa(true)}),null);
});
