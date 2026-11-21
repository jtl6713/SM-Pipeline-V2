import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

const origin='https://studio.chicagoshining.com';
const profile='recTestProfile001';
const row={id:'recTestOutput0001',fields:{Output_ID:10001,Content_Item:['recTestContent001'],Platform:'Instagram',Studio_Output_Type:'Reel',Output_Status:'Ready for Review',Review_Status:'Review Sent',Render_Status:'Rendered',Publish_Status:'Not Ready',Final_File_URL:'https://example.invalid/test.mp4',Thumbnail_URL:origin.replace('studio.','media.')+'/studio/previews/thumbnails/test.jpg',Output_Caption:'Fixture'}};
function setup(t,{badOutput=false,failedRead=false}={}) {
 const calls=[]; let r2Reads=0,r2Writes=0;
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',STUDIO_WRITE_SOURCE:'supabase',STUDIO_PHASE6_WRITE_SOURCE:'supabase',AIRTABLE_BASE_ID:'appe33zkZn35yirTL',AIRTABLE_IDEA_TABLE_ID:'ideas',AIRTABLE_CONTENT_TABLE_ID:'content',AIRTABLE_OUTPUT_TABLE_ID:'outputs',AIRTABLE_MEDIA_TABLE_ID:'media',ALLOWED_ORIGINS:origin,
 FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED:'true',FACTORY_BATCH_GLOBAL_MODE:'global_all_platforms_v2',FACTORY_BATCH_GLOBAL_MAX_TOTAL:'20',FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE:'10',FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF:'explicit-review',
 STUDIO_MEDIA:{get:async()=>{r2Reads++;return null},list:async()=>({objects:[],truncated:false}),put:async()=>{r2Writes++;throw Error('No writes allowed')}}};
 const original=globalThis.fetch;
 t.after(()=>{globalThis.fetch=original});
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input);
  assert.equal(options.method||'GET','GET');
  if(url.hostname==='example.supabase.co') {
    const table=url.pathname.split('/').at(-1);
    calls.push('sb:'+table);
    const userUuid='91807514-7fd9-4163-a6f1-5ee3c6e46ff7';
    const orgUuid='c659413b-f8f3-4fa3-a85a-148d44e37f61';
    const profileUuid='3d0d5221-9e53-4513-972c-67b70963a97d';
    const contentUuid='91cb9fd0-7c20-434c-b5ef-03af2832c940';
    if(table==='studio_users')return Response.json([{id:userUuid,airtable_record_id:'recFixtureUser001',email:'fixture@example.invalid',display_name:'Fixture',active:true,user_status:'Active',user_key:'USR-FIXTURE',extras:{}}]);
    if(table==='studio_memberships')return Response.json([{id:'71807514-7fd9-4163-a6f1-5ee3c6e46ff7',airtable_record_id:'recFixtureMemb001',user_id:userUuid,organization_id:orgUuid,role:'Owner',active:true,membership_status:'Active',is_default:true,extras:{Organization:['recOrg'],Allowed_Brands:[]}}]);
    if(table==='organizations')return Response.json([{id:orgUuid,airtable_record_id:'recOrg',name:'Fixture Studio'}]);
    if(table==='brands')return Response.json([]);
    if(table==='content_profiles')return Response.json([{id:profileUuid,airtable_record_id:profile,profile_name:'Fixture',brand_name:'Chicago',market_name:'Chicago',active:true,platform_setup:{}}]);
    if(table==='content_items')return Response.json([{id:contentUuid,airtable_record_id:'recTestContent001',content_profile_id:profileUuid,content_title:'Fixture'}]);
    if(table==='platform_outputs'){
      if(failedRead)return Response.json({message:'fixture outage'},{status:503});
      return Response.json([{
        id:'d178139e-87a7-4ab6-9137-2ed4f4c24ddd',airtable_record_id:row.id,
        output_number:10001,content_item_id:contentUuid,
        content_item_airtable_id:'recTestContent001',content_profile_id:profileUuid,
        platform:'Instagram',studio_output_type:'Reel',format:'Reel',
        output_status:'Ready for Review',review_status:'Review Sent',
        publish_status:'Not Ready',render_status:'Rendered',do_not_publish:badOutput,
        output_caption:'Fixture',final_file_url:'https://example.invalid/test.mp4',
        thumbnail_url:'https://media.chicagoshining.com/studio/previews/thumbnails/test.jpg',
        error_messages:{},updated_at:'2026-11-18T03:00:00+00:00',
      }]);
    }
    throw Error('Unexpected Supabase fixture query: '+table);
  }
  const table=decodeURIComponent(url.pathname.split('/')[3]);
  calls.push(table);
  if(table==='outputs'&&failedRead) return Response.json({error:{type:'SERVICE_UNAVAILABLE',message:'fixture outage'}},{status:503});
  const records={
   'Studio Users':[{id:'recUser',fields:{Email:'fixture@example.invalid',Active:true,User_Status:'Active'}}],
   'Studio Memberships':[{id:'recMembership',fields:{User:['recUser'],Active:true,Membership_Status:'Active',Organization:['recOrg'],Role:'Owner'}}],
   Brands:[],
   'Content Profiles':[{id:profile,fields:{Active:true}}],
   outputs:[{...row,fields:{...row.fields,...(badOutput?{Do_Not_Publish:true}:{})}}],
   content:[{id:'recTestContent001',fields:{Content_Profile:[profile]}}],
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
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.accepted,false);assert.equal(body.read_only,true);assert.equal(body.preflight_valid,true);assert.equal(body.records[0].profile_id,profile);assert.ok(calls.includes('sb:content_items'));assert.deepEqual(counts(),{r2Reads:0,r2Writes:0});
});
test('held output retains exact JSON 409 reason through full fetch handler',async t=>{
 const {env,counts}=setup(t,{badOutput:true});const response=await worker.fetch(request('start_group'),env,{});
 assert.equal(response.status,409);assert.match((await response.json()).error,/Output #10001: publishing hold/);assert.equal(counts().r2Writes,0);
});
test('upstream outage stays JSON 503 and does not turn into uncaught 500',async t=>{
 const {env,counts}=setup(t,{failedRead:true}); const response=await worker.fetch(request('start_group'),env,{});
 assert.equal(response.status,503);assert.match((await response.json()).error,/fixture outage/);assert.equal(counts().r2Writes,0);
});

test('real Worker HTTP validate_group uses Supabase review state, never Airtable outputs or content', async t => {
 const {env,calls,counts}=setup(t);
 env.STUDIO_WRITE_SOURCE='supabase';
 env.SUPABASE_URL='https://example.supabase.co';
 env.SUPABASE_SERVICE_ROLE_KEY='fixture';
 const legacyFetch=globalThis.fetch;
 const touched=[];
 const contentUuid='91cb9fd0-7c20-434c-b5ef-03af2832c940';
 const profileUuid='3d0d5221-9e53-4513-972c-67b70963a97d';
 globalThis.fetch=async (input,options={})=>{
   const url=new URL(input);
   if(url.hostname!=='example.supabase.co')return legacyFetch(input,options);
   touched.push(url.pathname);
   assert.equal(options.method||'GET','GET','read-only preflight');
   if(url.pathname.endsWith('/content_profiles'))return Response.json([{
     id:profileUuid,airtable_record_id:profile,
     profile_name:'Fixture',brand_name:'Chicago',market_name:'Chicago',
     active:true,platform_setup:{},
   }]);
   if(url.pathname.endsWith('/content_items'))return Response.json([{
     id:contentUuid,airtable_record_id:'recTestContent001',content_profile_id:profileUuid,
   }]);
   if(url.pathname.endsWith('/platform_outputs'))return Response.json([{
     id:'d178139e-87a7-4ab6-9137-2ed4f4c24ddd',
     airtable_record_id:row.id,output_number:10001,
     content_item_id:contentUuid,content_item_airtable_id:'recTestContent001',
     content_profile_id:profileUuid,platform:'Instagram',
     studio_output_type:'Reel',format:'Reel',output_status:'Ready for Review',
     review_status:'Review Sent',publish_status:'Not Ready',
     render_status:'Rendered',do_not_publish:false,test_run_id:null,
     output_caption:'Fixture',final_file_url:'https://example.invalid/test.mp4',
     thumbnail_url:'https://media.chicagoshining.com/studio/previews/thumbnails/test.jpg',
     error_messages:{},updated_at:'2026-11-18T03:00:00+00:00',
   }]);
   throw Error('unexpected Supabase route: '+url.pathname);
 };
 const response=await worker.fetch(request(),env,{});
 const body=await response.json();
 assert.equal(response.status,200,JSON.stringify(body));
 assert.equal(body.preflight_valid,true);
 assert.equal(body.records[0].profile_id,profile);
 assert.ok(touched.some(x=>x.endsWith('/platform_outputs')),'used Supabase output authority');
 assert.ok(touched.some(x=>x.endsWith('/content_items')),'checked Supabase content ownership');
 assert.ok(!calls.includes('outputs')&&!calls.includes('content')&&!calls.includes('Content Profiles'),
   'zero Airtable output, content or profile reads');
 assert.deepEqual(counts(),{r2Reads:0,r2Writes:0});
});
