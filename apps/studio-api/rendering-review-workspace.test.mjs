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


test('Chicago completed render queue uses exactly two bounded paginated reads and no per-item fetches',async()=>{
  const f=fixture(),calls=[];
  f.args.url=new URL('https://studio.test/api/rendering-review/queue?profile_id='+CHICAGO_PROFILE_ID);
  f.args.operations.listRecordsPage=async(env,table,options)=>{
    calls.push({table,options});
    if(table==='outputs')return {valid:true,offset:'itrNextPage',records:[{
      id:outputId,fields:{
        Content_Item:[f.content.id],Platform:'Instagram',Platform_Output_Type:'Instagram Reel',
        Final_File_ID:'drive-file',Final_File_URL:'https://example.test/video',
        Thumbnail_URL:'https://cdn.example.test/chicago-cover.jpg',
        Output_Title:'Chicago skyline',Output_ID:2507,Render_Status:'Rendered',
        Publish_Status:'Not Published',
        Studio_Render_Review_Hold_Active:true,
        Studio_Render_Review_Hold_ID:session.review_hold.id,
      },
    }]};
    assert.equal(table,'tblwzN9AXWvmKVKPs');
    assert.equal(options.limit,1);
    assert.deepEqual(options.fields,['Content_Profile']);
    assert.match(options.filterFormula,/RECORD_ID\(\)="recC1B2C3D4E5F6G7"/);
    return {valid:true,offset:null,records:[f.content]};
  };
  f.args.operations.airtableFetch=async()=>{throw Error('Unbounded per-row Airtable read forbidden');};
  const result=await read(f.args);
  assert.equal(result.queue.length,1);
  assert.equal(result.queue[0].title,'Chicago skyline');
  assert.equal(result.queue[0].thumbnail_url,'https://cdn.example.test/chicago-cover.jpg');
  assert.ok(calls[0].options.fields.includes('Thumbnail_URL'));
  assert.equal(result.queue[0].profile_id,CHICAGO_PROFILE_ID);
  assert.equal(result.queue[0].manual_admission_enabled,false);
  assert.equal(result.next_cursor,'itrNextPage');
  assert.equal(result.flags.admission_enabled,false);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.limit,40);
  assert.match(calls[0].options.filterFormula,/Final_File_ID/);
});


test('historical sample binding does not hide another held Chicago Reel',async()=>{
  const f=fixture(),calls=[];
  f.args.env.RENDERING_REVIEW_EXACT_OUTPUT_ID='rec0uVrVeiUM6shp9';
  f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  f.args.operations.listRecordsPage=async(_env,table,opts)=>{
    calls.push(table);
    if(table==='outputs'){
      assert.match(opts.filterFormula,/Studio_Render_Review_Hold_Active/);
      return {valid:true,offset:null,records:[{id:outputId,fields:{
        Content_Item:[f.content.id],Platform:'Instagram',Platform_Output_Type:'Instagram Reel',
        Final_File_ID:'drive-file',Output_ID:9389,
        Output_Title:'Chicago: Life Along the Waterfront',
        Render_Status:'Rendered',Studio_Render_Review_Hold_Active:true,
        Studio_Render_Review_Hold_ID:session.review_hold.id,
      }}]};
    }
    return {valid:true,offset:null,records:[f.content]};
  };
  f.args.operations.airtableFetch=async()=>{throw Error('No per-output fetch');};
  const result=await read(f.args);
  assert.deepEqual(result.queue.map(x=>x.output_id),[outputId]);
  assert.equal(result.queue[0].output_number,9389);
  assert.deepEqual(calls,['outputs','tblwzN9AXWvmKVKPs']);
});
test('held queue excludes dispatch-started and foreign-profile rows',async()=>{
  const f=fixture();
  f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  const fields={Content_Item:[f.content.id],Platform:'Instagram',
    Platform_Output_Type:'Instagram Reel',Final_File_ID:'drive-file',
    Studio_Render_Review_Hold_Active:true};
  f.args.operations.listRecordsPage=async(_env,table)=>{
    if(table==='outputs')return {valid:true,records:[
      {id:outputId,fields:{...fields,Platform_Media_ID:'remote-container'}},
      {id:'recZ1B2C3D4E5F6G7',fields:{...fields}},
    ],offset:null};
    return {valid:true,records:[{...f.content,fields:{Content_Profile:['recZ1B2C3D4E5F6G7']}}],offset:null};
  };
  const result=await read(f.args);
  assert.deepEqual(result.queue,[]);
});
test('queue accepts all held platforms in the authorized profile and excludes published or malformed links',async()=>{
  const f=fixture();
  f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  const valid={Content_Item:[f.content.id],Platform:'Instagram',
    Platform_Output_Type:'Instagram Reel',Final_File_ID:'file',Publish_Status:'Ready',
    Studio_Render_Review_Hold_Active:true};
  f.args.operations.listRecordsPage=async(_env,table)=>table==='outputs'?({valid:true,records:[
    {id:outputId,fields:{...valid,Platform:'Facebook'}},
    {id:'recH1B2C3D4E5F6G7',fields:{...valid,Publish_Status:'Published'}},
    {id:'recI1B2C3D4E5F6G7',fields:{...valid,Content_Item:[f.content.id,f.content.id]}},
    {id:'recJ1B2C3D4E5F6G7',fields:valid},
  ]}):{valid:true,records:[f.content]};
  f.content.fields.Content_Profile=['recZ1B2C3D4E5F6G7'];
  const result=await read(f.args);
  assert.deepEqual(result.queue,[]);
  f.content.fields.Content_Profile=[CHICAGO_PROFILE_ID];
  const included=await read(f.args);
  assert.equal(included.queue.length,2);
  assert.deepEqual(included.queue.map(x=>x.output_id),[outputId,'recJ1B2C3D4E5F6G7']);
});

test('queue excludes Reels with already-created Instagram containers or post URLs',async()=>{
  const f=fixture();f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  const base={Content_Item:[f.content.id],Platform:'Instagram',
    Platform_Output_Type:'Instagram Reel',Final_File_ID:'drive-file',
    Publish_Status:'Not Published',Render_Status:'Rendered',
    Studio_Render_Review_Hold_Active:true};
  f.args.operations.listRecordsPage=async(_env,table,opts)=>{
    if(table==='outputs'){
      assert.ok(opts.fields.includes('Platform_Media_ID'));
      assert.ok(opts.fields.includes('Platform_Post_URL'));
      assert.ok(opts.fields.includes('Publish_Locked_By'));
      return {valid:true,records:[
        {id:outputId,fields:{...base,Platform_Media_ID:'ig-existing-container'}},
        {id:'recH1B2C3D4E5F6G7',fields:{...base,Platform_Post_URL:'https://instagram.com/reel/existing'}},
        {id:'recI1B2C3D4E5F6G7',fields:base},
        {id:'recK1B2C3D4E5F6G7',fields:{...base,Publish_Locked_By:'active-owner'}},
      ]};
    }
    return {valid:true,records:[f.content]};
  };
  const result=await read(f.args);
  assert.deepEqual(result.queue.map(x=>x.output_id),['recI1B2C3D4E5F6G7']);
});

test('40 completed outputs with shared and distinct content IDs use one exact-match Content Item batch',async()=>{
  const f=fixture();f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  const contentIds=Array.from({length:20},(_,n)=>'rec'+String(n).padStart(14,'0'));
  const outputs=Array.from({length:40},(_,n)=>({
    id:'rec'+String(n+100).padStart(14,'0'),
    fields:{Platform:'Instagram',Platform_Output_Type:'Instagram Reel',
      Final_File_ID:'drive-file',Content_Item:[contentIds[n%20]],
      Studio_Render_Review_Hold_Active:true},
  }));
  let reads=0;
  f.args.operations.listRecordsPage=async(_env,table,options)=>{
    reads++;
    if(table==='outputs')return {valid:true,records:outputs};
    assert.equal(table,'tblwzN9AXWvmKVKPs');
    assert.equal(options.limit,20);
    assert.equal((options.filterFormula.match(/RECORD_ID\(\)/g)||[]).length,20);
    return {valid:true,offset:null,records:contentIds.map(id=>({
      id,fields:{Content_Profile:[CHICAGO_PROFILE_ID]},
    }))};
  };
  f.args.operations.airtableFetch=async()=>{throw Error('No serial per-output fetches');};
  const result=await read(f.args);
  assert.equal(result.queue.length,40);
  assert.equal(reads,2);
});

test('malformed or incomplete Content Item batch results fail closed instead of exposing records',async()=>{
  const f=fixture();f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  let contentReply={valid:true,records:[f.content],offset:'unexpectedNextPage'};
  f.args.operations.listRecordsPage=async(_env,table)=>table==='outputs'?{
    valid:true,records:[{id:outputId,fields:{Platform:'Instagram',
      Platform_Output_Type:'Instagram Reel',Final_File_ID:'drive-file',Content_Item:[f.content.id]}}],
  }:contentReply;
  await assert.rejects(()=>read(f.args),e=>e.status===503);
  contentReply={valid:true,offset:null,records:[{id:'recZ1B2C3D4E5F6G7',fields:{Content_Profile:[CHICAGO_PROFILE_ID]}}]};
  await assert.rejects(()=>read(f.args),e=>e.status===503);
  contentReply={valid:false,records:[]};
  await assert.rejects(()=>read(f.args),e=>e.status===503);
});
test('queue denies wrong profile, invalid cursor and missing permissions',async()=>{
  const f=fixture();f.args.url=new URL('https://studio.test/api/rendering-review/queue?profile_id=recZ1B2C3D4E5F6G7');
  await assert.rejects(()=>read(f.args),e=>e.status===403);
  f.args.url=new URL('https://studio.test/api/rendering-review/queue?cursor=bad%24cursor');
  await assert.rejects(()=>read(f.args),e=>e.status===400);
  f.args.authorization.permissions.outputs_review=false;
  await assert.rejects(()=>read(f.args),e=>e.status===403);
});
test('queue fails closed when authoritative Airtable scan is not complete',async()=>{
  const f=fixture();f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  f.args.operations.listRecordsPage=async()=>({valid:false,records:[]});
  await assert.rejects(()=>read(f.args),e=>e.status===503);
});

test('unflagged completed outputs never appear in conversational review queue',async()=>{
  const f=fixture();
  f.args.env.RENDERING_REVIEW_EXACT_OUTPUT_ID=outputId;
  f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  f.output.fields.Platform='Instagram';
  f.output.fields.Platform_Output_Type='Instagram Reel';
  f.output.fields.Render_Status='Rendered';
  f.output.fields.Studio_Render_Review_Hold_Active=false;
  f.output.fields.Studio_Render_Review_Hold_ID='';
  f.output.fields.Studio_Render_Review_Hold_Owner='';
  f.output.fields.Studio_Render_Review_Session_ID='';
  f.args.operations.airtableFetch=async(_env,table)=>table==='outputs'?f.output:f.content;
  const result=await read(f.args);
  assert.deepEqual(result.queue,[]);
  assert.equal(result.flags.admission_enabled,false);
});

test('held Facebook, TikTok, YouTube and photo output discovery respects profile membership',async()=>{
  const f=fixture();
  const nyc='recNYC12345678901', chicago=CHICAGO_PROFILE_ID;
  const secondId='recXYZ12345678901';
  const content2={id:'recNYCONT12345678',fields:{Content_Profile:[nyc]}};
  const types=[['Facebook','Facebook Reel'],['TikTok','TikTok Video'],['YouTube','YouTube Short'],
    ['Instagram','Instagram Carousel'],['Facebook','Facebook Story']];
  const outputs=types.map(([platform,kind],i)=>({
    id:'rec'+String(i+100).padStart(14,'0'),
    fields:{Content_Item:[i===4?content2.id:f.content.id],
      Platform:platform,Platform_Output_Type:kind,Final_File_ID:'drive-asset',
      Studio_Render_Review_Hold_Active:true},
  }));
  f.args.url=new URL('https://studio.test/api/rendering-review/queue');
  f.args.operations.listRecordsPage=async(_env,table)=>table==='outputs'
    ? {valid:true,records:outputs}
    : {valid:true,records:[f.content,content2]};
  const onlyChicago=await read(f.args);
  assert.equal(onlyChicago.queue.length,4);
  assert.deepEqual(onlyChicago.queue.map(x=>x.output_type),types.slice(0,4).map(x=>x[1]));
  f.args.operations.authorizedProfiles=async()=>[{id:chicago},{id:nyc}];
  const both=await read(f.args);
  assert.equal(both.queue.length,5);
  f.args.url=new URL('https://studio.test/api/rendering-review/queue?profile_id='+nyc);
  const onlyNY=await read(f.args);
  assert.deepEqual(onlyNY.queue.map(x=>x.output_type),['Facebook Story']);
});
