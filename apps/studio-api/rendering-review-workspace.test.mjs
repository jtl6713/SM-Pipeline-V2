import test from 'node:test';
import assert from 'node:assert/strict';
import {readRenderingReviewWorkspace as read} from './rendering-review-workspace.mjs';
import {REVIEW_SCHEMA,CHICAGO_PROFILE_ID} from './rendering-review-policy.mjs';

const outputId='recA1B2C3D4E5F6G7';
const session={schema:REVIEW_SCHEMA,id:'session-12345678',output_id:outputId,profile_id:CHICAGO_PROFILE_ID,
  version:2,current_attempt_id:'attempt-12345678',review_hold:{id:'hold-12345678',owner:'session-12345678',active:true},
  messages:[{role:'user',content:'Add an example'}]};
function fixture(){
  const row={id:'recB1B2C3D4E5F6G7',fields:{Session_ID:session.id,Output_Record_ID:outputId,
    Profile_Record_ID:CHICAGO_PROFILE_ID,Row_Version:2,Current_Attempt_ID:session.current_attempt_id,
    Hold_ID:session.review_hold.id,Hold_Owner:session.id,Session_JSON:JSON.stringify(session)}};
  const content={id:'recC1B2C3D4E5F6G7',fields:{Content_Profile:[CHICAGO_PROFILE_ID]}};
  const output={id:outputId,fields:{Content_Item:[content.id],Final_File_ID:'drive-file',Final_File_URL:'https://example.test/video',
    Studio_Render_Review_Hold_Active:true,Studio_Render_Review_Hold_ID:session.review_hold.id,
    Studio_Render_Review_Hold_Owner:session.id,Studio_Render_Review_Session_ID:session.id}};
  const operations={authorizedProfiles:async()=>[{id:CHICAGO_PROFILE_ID}],
    listRecordsPage:async()=>({valid:true,records:[row],offset:'next-page'}),
    listRecords:async()=>[row],airtableFetch:async(env,table)=>table==='outputs'?output:content};
  return {row,output,content,args:{env:{AIRTABLE_OUTPUT_TABLE_ID:'outputs'},
    authorization:{authenticated:true,authorized:true,permissions:{outputs_review:true}},operations,
    url:new URL('https://studio.test/api/rendering-review/outputs/'+outputId)}};
}
test('workspace reload returns durable messages and verifies exact publication hold',async()=>{
  const f=fixture(),result=await read(f.args);
  assert.equal(result.session.messages[0].content,'Add an example');
  assert.equal(result.publication_hold_verified,true);
  assert.equal(result.flags.admission_enabled,false);
});
test('missing hold is visible but cannot become an enrollment or release',async()=>{
  const f=fixture();f.output.fields.Studio_Render_Review_Hold_Active=false;
  assert.equal((await read(f.args)).integrity_error,'HOLD_NOT_VERIFIED');
});
test('no permission and another profile cannot read review history',async()=>{
  const f=fixture();f.args.authorization.permissions.outputs_review=false;
  await assert.rejects(()=>read(f.args),e=>e.status===403);
  f.args.authorization.permissions.outputs_review=true;
  f.row.fields.Profile_Record_ID='recZ1B2C3D4E5F6G7';
  await assert.rejects(()=>read(f.args),e=>e.status===403);
});
test('list is scoped, bounded, paginated and never falls back to a mirror',async()=>{
  const f=fixture();f.args.url=new URL('https://studio.test/api/rendering-review/sessions');
  const original=f.args.operations.listRecordsPage;
  f.args.operations.listRecordsPage=async(env,table,opts)=>{
    assert.equal(opts.limit,30);assert.match(opts.filterFormula,new RegExp(CHICAGO_PROFILE_ID));
    return original();
  };
  const result=await read(f.args);assert.equal(result.next_cursor,'next-page');
});
test('duplicate sessions and corrupted session versions fail closed',async()=>{
  const f=fixture();f.args.operations.listRecords=async()=>[f.row,f.row];
  await assert.rejects(()=>read(f.args),e=>e.status===409);
  f.args.operations.listRecords=async()=>[f.row];f.row.fields.Row_Version=9;
  await assert.rejects(()=>read(f.args),e=>e.status===409);
});

test('workspace cannot expose another profile after authoritative content drift',async()=>{
  const f=fixture();f.content.fields.Content_Profile=['recZ1B2C3D4E5F6G7'];
  await assert.rejects(()=>read(f.args),e=>e.status===403);
  f.output.fields.Content_Item.push('recD1B2C3D4E5F6G7');
  await assert.rejects(()=>read(f.args),e=>e.status===409);
});
