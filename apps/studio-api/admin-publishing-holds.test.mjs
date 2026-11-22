import test from "node:test";
import assert from "node:assert/strict";
import { classifyAdminPublishingHold, handleAdminPublishingHolds } from "./admin-publishing-holds.mjs";

const REC="recABCDEFGHIJKLMN";
const PROFILE="recZYXWVUTSRQPONM";
const uuid="f7d5a786-fd54-4286-b22a-4c975049de60";
const row=()=>({
  id:"f1cf1255-0c34-487c-a938-cb2ddb9f9070",
  airtable_record_id:REC,output_number:11125,content_profile_id:uuid,
  output_title:"Example held output",platform:"Facebook",
  output_status:"Approved for Publishing",review_status:"Approved",publish_status:"Ready to Publish",
  do_not_publish:true,auto_publish_enabled:true,updated_at:"2026-11-22T16:00:00Z",
  publish_hold_set_at:"2026-11-22T15:50:00Z",
  publish_hold_reason:null,error_messages:{},
});
const auth={permissions:{tenant_admin:true},user:{record_id:"recAUDITOR1234567"},organization:{record_id:"recORGABCDEFGHIJK"}};
function fixture({held=row(),history=[{operation:"released",reason:"Reviewed safely",actor:auth.user.record_id,occurred_at:"2026-11-22T17:00:00Z"}]}={}){
  const calls=[];
  const ops={
    withOutputLock:async(id,fn)=>{assert.equal(id,REC);return fn();},
    supabaseRest:async(_env,path,opt={})=>{
      calls.push({path,opt});
      if(path.startsWith("organizations?"))return [{id:"4c13a6db-49cd-4d7f-9746-b36d489f576e"}];
      if(path.startsWith("content_profiles?"))return [{id:uuid,airtable_record_id:PROFILE,profile_name:"ChicagoShining"}];
      if(path.startsWith("platform_output_hold_events?"))return history;
      if(opt.method==="PATCH"){
        assert.match(path,/do_not_publish=eq.true/);
        if(opt.body.do_not_publish!==false)throw Error("unsafe");
        if(opt.body.auto_publish_enabled!==false)throw Error("auto publish re-enabled");
        held.do_not_publish=false;held.auto_publish_enabled=false;
        return [{airtable_record_id:REC,do_not_publish:false,auto_publish_enabled:false}];
      }
      if(path.startsWith("platform_outputs?"))return [held];
      throw Error("Unexpected DB call "+path);
    }
  };
  return {ops,calls,held};
}
const req=(path,init={})=>new Request("https://studio.chicagoshining.com"+path,init);
const handle=(request,ops,authorization=auth)=>
  handleAdminPublishingHolds({request,url:new URL(request.url),env:{},authorization,ops});

test("legacy hold has truthful unknown reason and can be reviewed",()=>{
  assert.deepEqual(classifyAdminPublishingHold(row()),{
    releasable:true,block_reason:null,reason:"Reason not recorded — historical hold",reason_source:"Historical / unrecorded",release_warning:null
  });
});
test("protected review, factory, legal, tests, dispatch and published receipts cannot be toggled",()=>{
  for(const extras of [
    {Studio_Render_Review_Hold_Active:true},
    {Studio_Render_Review_Hold_ID:"nghold_abc"},
    {Factory_Review_Handoff_Safety_Hold_At:"2026-11-22"},
    {SM_False_Changes_Requested_Recovery_2563:"protected"},
    {Copyright_Hold:true},
    {Publish_Started_At:"2026-11-22"},
    {Studio_Overdue_UnsafeGallery_Hold_20261121:"needs original-gallery verification"},
    {SM_Native_Gallery_Preflight_Hold_2294:true},
    {SM_Factory_Visual_Review_Hold_Restored_20261122:true},
    {SM_NYC_Sibling_Visual_QA_Hold_20261122:"source mismatch"},
    {SM_Miami_Frost_Copy_QA_Hold_20261122:"caption needs correction"},
    {P1_2340_Ambiguous_Child_Retry_Hold:"unknown provider attempt"},
    {Backlog_20261120_Asset_Caption_Mismatch_Hold:true},
    {SM_Factory_Held_Review_Staged_20261120:true},
    {IG_Story_Attempt_Count:1},
    {IG_Carousel_Retry_Count:2},
    {Last_Publish_Attempt_At:"2026-11-21T10:00:00Z"}
  ]){
    assert.equal(classifyAdminPublishingHold({...row(),error_messages:extras}).releasable,false,JSON.stringify(extras));
  }
  assert.equal(classifyAdminPublishingHold({...row(),test_run_id:"test"}).releasable,false);
  assert.equal(classifyAdminPublishingHold({...row(),review_status:"Pending Review"}).releasable,true);
  assert.equal(classifyAdminPublishingHold({...row(),output_status:"In Production"}).releasable,true);
  assert.equal(classifyAdminPublishingHold({...row(),review_status:"Changes Requested"}).releasable,true);
  assert.equal(classifyAdminPublishingHold({...row(),output_status:"Changes Requested"}).releasable,true);
  assert.equal(classifyAdminPublishingHold({...row(),published_at:"2026-11-22"}).releasable,false);
});
test("GET scopes the list to membership and exposes reasons and release eligibility",async()=>{
  const {ops,calls}=fixture();
  const response=await handle(req("/api/operations/publishing-holds"),ops);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.records.length,1);
  assert.equal(data.records[0].reason,"Reason not recorded — historical hold");
  assert.equal(data.records[0].profile_name,"ChicagoShining");
  const query=calls.find(x=>x.path.startsWith("platform_outputs?")).path;
  assert.ok(query.includes("content_profile_id=in.("+uuid+")"));
  assert.ok(query.includes("do_not_publish=eq.true"));
});
test("unauthorized user cannot see or release holds",async()=>{
  const {ops,calls}=fixture();
  const response=await handle(req("/api/operations/publishing-holds"),ops,{permissions:{}});
  assert.equal(response.status,403);
  assert.equal(calls.length,0);
});
test("release requires exact output identity, explicit note, revision and active hold",async()=>{
  const {ops,calls}=fixture();
  const response=await handle(req("/api/operations/publishing-holds/"+REC+"/release",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({confirm_output_id:REC,release_note:"short",revision:row().updated_at})
  }),ops);
  assert.equal(response.status,400);
  assert.equal(calls.filter(x=>x.opt.method==="PATCH").length,0);
});
test("release disables auto-publishing, verifies database readback and audit",async()=>{
  const {ops,calls,held}=fixture();
  const response=await handle(req("/api/operations/publishing-holds/"+REC+"/release",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({confirm_output_id:REC,
      release_note:"Reviewed and safe for next manual approval",
      revision:held.updated_at,hold_set_at:held.publish_hold_set_at})
  }),ops);
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  assert.equal(data.publication_triggered,false);
  assert.equal(data.automatic_publishing_enabled,false);
  assert.equal(held.do_not_publish,false);
  assert.equal(held.auto_publish_enabled,false);
  assert.equal(calls.filter(x=>x.opt.method==="PATCH").length,1);
});
test("protected or stale hold refuses a release without writing",async()=>{
  for(const mutate of [
    held=>held.error_messages.Studio_Render_Review_Hold_Active=true,
    held=>held.updated_at="2026-11-23T00:00:00Z"
  ]){
    const {ops,calls,held}=fixture();mutate(held);
    const response=await handle(req("/api/operations/publishing-holds/"+REC+"/release",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({confirm_output_id:REC,
        release_note:"Confirmed safe to resume from review",
        revision:row().updated_at,hold_set_at:row().publish_hold_set_at})
    }),ops);
    assert.equal(response.status,409);
    assert.equal(calls.filter(x=>x.opt.method==="PATCH").length,0);
  }
});

test("historical reasons use actual output evidence without pretending to be original hold notes",()=>{
  const cases=[
    [{Studio_Production_Hold_Reason:"Editorial QA awaiting city-specific images"},"Editorial QA awaiting city-specific images","Recorded output evidence"],
    [{Studio_Overdue_UnsafeGallery_Hold_20261121:true},"Historical protected hold marker","Historical output record"],
    [{Studio_Publish_Dispatch_Count:2},"Historical publish hold with a prior dispatch","Historical provider attempt"],
  ];
  for (const [extras,fragment,source] of cases) {
    const state=classifyAdminPublishingHold({...row(),error_messages:extras});
    assert.match(state.reason,new RegExp(fragment));
    assert.match(state.reason_source,new RegExp(source));
  }
  const cancelled=classifyAdminPublishingHold({...row(),output_status:"Cancelled"});
  assert.match(cancelled.reason,/output is Cancelled/);
  assert.equal(cancelled.releasable,false);
});
test("explicit captured reason takes precedence over historical markers but never overrides safety",()=>{
  const state=classifyAdminPublishingHold({...row(),
    publish_hold_reason:"Rights review required before Instagram Story",
    publish_hold_source:"rights-review",
    error_messages:{Copyright_Hold:true}});
  assert.equal(state.reason,"Rights review required before Instagram Story");
  assert.equal(state.reason_source,"rights-review");
  assert.equal(state.releasable,false);
});
test("protected historical hold denies mutation even when approved for publishing",async()=>{
  for(const marker of [
    {Studio_Overdue_UnsafeGallery_Hold_20261121:true},
    {SM_Native_Gallery_Preflight_Hold_2294:true},
    {IG_Story_Attempt_Count:1}
  ]) {
    const held=row();held.error_messages=marker;
    const {ops,calls}=fixture({held});
    const response=await handle(req("/api/operations/publishing-holds/"+REC+"/release",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({confirm_output_id:REC,
        release_note:"Safety inspection requires more work",
        revision:held.updated_at,hold_set_at:held.publish_hold_set_at})
    }),ops);
    assert.equal(response.status,409,JSON.stringify(marker));
    assert.equal(calls.filter(x=>x.opt.method==="PATCH").length,0);
  }
});

test("ordinary early-stage production output can release a hold without advancing or enabling publishing",async()=>{
  const held={...row(),output_status:"In Production",review_status:"Pending Review",
    publish_status:"Not Ready",auto_publish_enabled:false,
    error_messages:{
      Output_Notes:"Studio single-parent output seed. Production Request Output is the per-platform execution authority.",
      Production_Request_Output:["recEkDe7BES0FsYtU"]
    }};
  const decision=classifyAdminPublishingHold(held);
  assert.equal(decision.releasable,true);
  assert.match(decision.release_warning,/does not advance production or Factory approval/);
  const {ops,calls}=fixture({held});
  const response=await handle(req("/api/operations/publishing-holds/"+REC+"/release",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({confirm_output_id:REC,
      release_note:"Authorized operator cleared the generic hold only",
      revision:held.updated_at,hold_set_at:held.publish_hold_set_at})
  }),ops);
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  assert.equal(held.do_not_publish,false);
  assert.equal(held.auto_publish_enabled,false);
  assert.equal(held.review_status,"Pending Review");
  assert.equal(held.output_status,"In Production");
  assert.equal(calls.filter(x=>x.opt.method==="PATCH").length,1);
});
test("ordinary in-production row with a genuine Gallery or recovery safety marker remains locked",async()=>{
  const held={...row(),output_status:"In Production",review_status:"Pending Review",
    publish_status:"Not Ready",
    error_messages:{SM_Native_Gallery_Preflight_Hold_2294:true}};
  assert.equal(classifyAdminPublishingHold(held).releasable,false);
  const {ops,calls}=fixture({held});
  const response=await handle(req("/api/operations/publishing-holds/"+REC+"/release",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({confirm_output_id:REC,
      release_note:"Attempted plain hold release with marker active",
      revision:held.updated_at,hold_set_at:held.publish_hold_set_at})
  }),ops);
  assert.equal(response.status,409);
  assert.equal(calls.filter(x=>x.opt.method==="PATCH").length,0);
});
test("GET history exposes both existing events and truthful empty legacy history",async()=>{
  for(const events of [[],[{operation:"held",reason:"Studio hold",source:"studio",actor:"tester",
    occurred_at:"2026-11-22T17:00:00Z"}]]){
    const {ops,calls}=fixture({history:events});
    const response=await handle(req("/api/operations/publishing-holds?history_for="+REC),ops);
    assert.equal(response.status,200);
    const data=await response.json();
    assert.deepEqual(data.events,events);
    assert.equal(data.output_id,REC);
    assert.equal(calls.filter(x=>x.opt.method==="PATCH").length,0);
  }
});
