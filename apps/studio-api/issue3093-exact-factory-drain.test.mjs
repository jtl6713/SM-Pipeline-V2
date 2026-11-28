import test from "node:test";
import assert from "node:assert/strict";
import {exactZooFactoryDrain,ZOO_REQUEST} from "./issue3093-exact-factory-drain.mjs";
const ids=["recRL0ElgmiMeCrCB","reckgKjanErnF0fu6","recCOqBl4WBgm9gDV","recMNRgOhg55kroN2","rec9dNkjjXVczL2cv","rece3pyxERb3K2pOj"];
const profile="recpNlNn6U6eq0M9r",actor="recaKAksAFrEv21RO",child="fgc_exact_zoo_test";
const secret="test-secret-of-at-least-24-characters";
const records=ids.map((id,i)=>({id,output_id:11366+i,profile_id:profile}));
function fixture(){
 let count=1,calls=0;
 const group={request_id:ZOO_REQUEST,submitted_by:actor,created_at:"2026-11-28T13:37:00Z",records,children:[{profile_id:profile,request_id:child,records}]};
 const job={request_id:child,group_request_id:ZOO_REQUEST,profile_id:profile,submitted_by:actor,items:records};
 const opts={now:()=>Date.parse("2026-11-28T14:00:00Z"),outage:()=>({active:true}),source:()=> "supabase",configured:()=>true,
 readGroup:async()=>group,readChild:async()=>job,readStatus:async()=>({request_id:ZOO_REQUEST,total:6,failed_count:0,pending_count:6-count}),
 readRows:async()=>new Map(records.map((r,i)=>{const approved=i<count;const schedule="2026-11-28T19:05:00Z";return [r.id,{profileId:profile,row:{airtable_record_id:r.id,output_number:r.output_id,content_item_airtable_id:"recQ12ZNaNvUCFHUZ",render_status:"Rendered",do_not_publish:false,final_file_url:"https://example.test/video",studio_preview_url:"https://example.test/preview",updated_at:"2026-11-28T13:36:00Z",review_status:approved?"Approved":"Review Sent",output_status:approved?"Approved for Publishing":"Ready for Review",publish_status:approved?"Ready to Schedule":"Not Ready",auto_publish_enabled:approved,scheduled_post_date:approved?schedule:null,studio_scheduled_at:approved?schedule:null,error_messages:approved?{SM_Factory_Supabase_Approval_Receipt:{request_id:ZOO_REQUEST,approval_actor_record_id:actor,actor_provenance:"authenticated_factory_submission",scheduled_for:schedule,published:false}}:{}}}]}))};
 const process=async(env,p,c,ctx,o)=>{assert.equal(p,profile);assert.equal(c,child);assert.equal(ctx,null);assert.equal(o.continueSlice,8);assert.equal(o.scheduled,true);calls++;count=Math.min(count+2,6);};
 return {opts,process,group,get calls(){return calls}};
}
const req=(s=secret,body)=>new Request("https://example.test/api/internal/factory/zoo3093-resume",{method:"POST",headers:{"X-Pipeline-Secret":s},body});
const env={PIPELINE_RUNNER_SHARED_SECRET:secret,STUDIO_MEDIA:{}};
test("exact existing group drains via normal locks, no sibling continuation",async()=>{
 const f=fixture();const result=await exactZooFactoryDrain(req(),env,f.process,f.opts);
 assert.equal(result.complete,true);assert.equal(result.approved,6);assert.equal(result.publication_authorized,false);assert.equal(f.calls,3);
});
test("reject unauthenticated, caller scope, changed owner, or wrong group before drain",async()=>{
 for(const kind of ["auth","body","owner","scope"]){
  const f=fixture();
  if(kind==="owner")f.group.submitted_by="recAAAAAAAAAAAAAA";
  if(kind==="scope")f.group.records=records.slice(1);
  await assert.rejects(exactZooFactoryDrain(kind==="auth"?req("bad"):kind==="body"?req(secret,"{}"):req(),env,f.process,f.opts));
  assert.equal(f.calls,0);
 }
});
