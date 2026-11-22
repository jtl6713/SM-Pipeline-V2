import test from "node:test";
import assert from "node:assert/strict";
import { classifyAdminPublishingHold, handleAdminPublishingHolds } from "./admin-publishing-holds.mjs";

const REC="recABCDEFGHIJKLMN";
const PROFILE="recZYXWVUTSRQPON";
const uuid="f7d5a786-fd54-4286-b22a-4c975049de60";
const row=()=>({
  id:"f1cf1255-0c34-487c-a938-cb2ddb9f9070",
  airtable_record_id:REC,output_number:11125,content_profile_id:uuid,
  output_title:"Example held output",platform:"Facebook",
  output_status:"Approved for Publishing",publish_status:"Ready to Publish",
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
    releasable:true,block_reason:null,reason:"Reason not recorded — historical hold"
  });
});
test("protected review, factory, legal, tests, dispatch and published receipts cannot be toggled",()=>{
  for(const extras of [
    {Studio_Render_Review_Hold_Active:true},
    {Studio_Render_Review_Hold_ID:"nghold_abc"},
    {Factory_Review_Handoff_Safety_Hold_At:"2026-11-22"},
    {SM_False_Changes_Requested_Recovery_2563:"protected"},
    {Copyright_Hold:true},
    {Publish_Started_At:"2026-11-22"}
  ]){
    assert.equal(classifyAdminPublishingHold({...row(),error_messages:extras}).releasable,false);
  }
  assert.equal(classifyAdminPublishingHold({...row(),test_run_id:"test"}).releasable,false);
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
