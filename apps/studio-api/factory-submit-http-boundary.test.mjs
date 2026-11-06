import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

const origin='https://studio.chicagoshining.com';
const profile='recTestProfile001';
const row={id:'recTestOutput0001',fields:{Output_ID:10001,Content_Item:['recTestContent01'],Platform:'Instagram',Studio_Output_Type:'Reel',Output_Status:'Ready for Review',Review_Status:'Review Sent',Render_Status:'Rendered',Publish_Status:'Not Ready',Final_File_URL:'https://example.invalid/test.mp4',Thumbnail_URL:origin.replace('studio.','media.')+'/studio/previews/thumbnails/test.jpg',Output_Caption:'Fixture'}};
function setup(t,{badOutput=false,failedRead=false}={}) {
 const calls=[]; let r2Reads=0,r2Writes=0;
 const env={AIRTABLE_PAT:'fixture',AIRTABLE_BASE_ID:'appe33zkZn35yirTL',AIRTABLE_IDEA_TABLE_ID:'ideas',AIRTABLE_CONTENT_TABLE_ID:'content',AIRTABLE_OUTPUT_TABLE_ID:'outputs',AIRTABLE_MEDIA_TABLE_ID:'media',ALLOWED_ORIGINS:origin,
 FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED:'true',FACTORY_BATCH_GLOBAL_MODE:'global_all_platforms_v2',FACTORY_BATCH_GLOBAL_MAX_TOTAL:'20',FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:'10',FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:'explicit-review',
 STUDIO_MEDIA:{get:async()=>{r2Reads++;return null},list:async()=>({objects:[],truncated:false}),put:async()=>{r2Writes++;throw Error('No writes allowed')}}};
 const original=globalThis.fetch;
 t.after(()=>{globalThis.fetch=original});
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input); const table=decodeURIComponent(url.pathname.split('/')[3]);
  assert.equal(options.method||'GET','GET'); calls.push(table);
  if(table==='outputs'&&failedRead) return Response.json({error:{type:'SERVICE_UNAVAILABLE',message:'fixture outage'}},{status:503});
  const records={
   'Studio Users':[{id:'recUser',fields:{Email:'fixture@example.invalid',Active:true,User_Status:'Active'}}],
   'Studio Memberships':[{id:'recMembership',fields:{User:['recUser'],Active:true,Membership_Status:'Active',Organization:['recOrg'],Role:'Owner'}}],
   Brands:[],
   'Content Profiles':[{id:profile,fields:{Active:true}}],
   outputs:[{...row,fields:{...row.fields,...(badOutput?{Do_Not_Publish:true}:{})}}],
   content:[{id:'recTestContent01',fields:{Content_Profile:[profile]}}],
  };
  if(table==='Organizations')return Response.json({id:'recOrg',fields:{}});
  assert.ok(Object.hasOwn(records,table),'unexpected network request '+table);
  return Response.json({records:records[table]});
 };
 return {env,calls,counts:()=>({r2Reads,r2Writes})};
}
function request(action='validate_group',extra={}) {
 return new Request(origin+'/api/factory/approval-batches',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Cf-Access-Authenticated-User-Email':'fixture@example.invalid'},body:JSON.stringify({action,request_id:'factory_http_test_20261104',record_ids:[row.id],...extra})});
}
test('real Worker HTTP boundary returns asynchronous validation error as JSON 400',async t=>{
 const {env,counts}=setup(t); const response=await worker.fetch(request('start_group',{request_id:'bad'}),env,{});
 assert.equal(response.status,400);assert.match((await response.json()).error,/Invalid group request ID/);assert.deepEqual(counts(),{r2Reads:0,r2Writes:0});
});
test('real Worker preflight uses canonical ownership and never accesses R2 or approves',async t=>{
 const {env,calls,counts}=setup(t); const response=await worker.fetch(request(),env,{});
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.accepted,false);assert.equal(body.read_only,true);assert.equal(body.preflight_valid,true);assert.equal(body.records[0].profile_id,profile);assert.ok(calls.includes('content'));assert.deepEqual(counts(),{r2Reads:0,r2Writes:0});
});
test('held output retains exact JSON 409 reason through full fetch handler',async t=>{
 const {env,counts}=setup(t,{badOutput:true});const response=await worker.fetch(request('start_group'),env,{});
 assert.equal(response.status,409);assert.match((await response.json()).error,/Output #10001: publishing hold/);assert.equal(counts().r2Writes,0);
});
test('upstream outage stays JSON 503 and does not turn into uncaught 500',async t=>{
 const {env,counts}=setup(t,{failedRead:true}); const response=await worker.fetch(request('start_group'),env,{});
 assert.equal(response.status,503);assert.match((await response.json()).error,/fixture outage/);assert.equal(counts().r2Writes,0);
});
