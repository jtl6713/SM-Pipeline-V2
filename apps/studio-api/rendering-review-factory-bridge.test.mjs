import test from "node:test";
import assert from "node:assert/strict";
import {returnFactoryRevisionToProducer} from "./rendering-review-factory-return.mjs";
import {factorySelectedReviewAttempt,serveFactorySelectedReviewVideo} from "./rendering-review-factory-preview.mjs";

const id="rec0uVrVeiUM6shp9",profile="recT2rbKX3MF7cVFU";
const v1="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4",v2="1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up";
const attemptId="rrattempt_26054929500b8abe981e3f6131b5c668209bf9c765edb06c";
const sessionId="rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796";
const holdId="rrhold-64201956-6207-464a-8e9c-616974479c1c";
const url=i=>"https://drive.google.com/file/d/"+i+"/view";
const env={RENDERING_REVIEW_EXACT_OUTPUT_ID:id};
const c=x=>structuredClone(x);
function fixture(){
  let s={schema:"studio.render-review.1",id:sessionId,output_id:id,profile_id:profile,
    output_type:"Instagram Reel",state:"approved",version:13,
    review_hold:{active:false,id:holdId,owner:sessionId},
    current_attempt_id:attemptId,approved_attempt_id:attemptId,
    original_do_not_publish:false,
    factory_handoff:{status:"ready_for_factory_approval",attempt_id:attemptId,
      artifact_id:v2,original_artifact_id:v1},
    attempts:[
      {id:"rroriginal_5db47c3f652bf0f80162c4e933cb8b7a913c92c8",number:1,status:"ready_for_review",artifact_id:v1},
      {id:attemptId,number:2,status:"ready_for_review",artifact_id:v2}],
    messages:[],history:[],processed:{},active_job:null,plan:null,pending_authorization:null};
  let r={id,fields:{Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
    Render_Status:"Rendered",Output_Status:"Ready for Review",
    Review_Status:"Review Sent",Publish_Status:"Not Ready",Final_File_ID:v2,
    Final_File_URL:url(v2),Auto_Publish_Enabled:false,Do_Not_Publish:false}};
  let writes=0,saves=0,failSession=false;
  const ops={
    withOutputLock:async (k,fn)=>{assert.equal(k,id);return fn()},
    readSession:async()=>c(s),readRawOutput:async()=>c(r),
    readNormalizedOutput:async()=>({id,profile_id:profile,output_type:"Instagram Reel",platform:"Instagram"}),
    readField:(row,k)=>row.fields[k],
    patchOutput:async(k,fields)=>{assert.equal(k,id);r.fields={...r.fields,...fields};writes++;return c(r)},
    saveSessionIfVersion:async({expected_version,next})=>{
      if(failSession)throw Error("session transient failure");
      if(s.version!==expected_version)return false;
      s=c(next);saves++;return true;
    },
    syncOutput:async()=>({ok:true}),
  };
  const run=(note="Please adjust the rhythm.",client_request_id="factoryreview_a1b2c3d4")=>
    returnFactoryRevisionToProducer({output_id:id,env,operations:ops,note,client_request_id,
      now:()=>"2026-10-29T18:00:00.000Z"});
  return {ops,run,get row(){return r},get session(){return s},get writes(){return writes},
    get saves(){return saves},set failSession(b){failSession=b}};
}
test("Factory accepted V2 returns notes to held Producer conversation with no new render",async()=>{
 const f=fixture();
 const result=await f.run();
 assert.equal(result.review_notes_saved,true);
 assert.equal(result.review_hold_active,true);
 assert.equal(result.render_queued,false);
 assert.equal(result.public_post_created,false);
 assert.equal(f.row.fields.Final_File_ID,v2);
 assert.equal(f.row.fields.Output_Status,"Changes Requested");
 assert.equal(f.row.fields.Do_Not_Publish,true);
 assert.equal(f.row.fields.Studio_Render_Review_Hold_ID,holdId);
 assert.equal(f.session.state,"discussing");
 assert.equal(f.session.review_hold.active,true);
 assert.equal(f.session.approved_attempt_id,null);
 assert.equal(f.session.messages.at(-1).content,"Please adjust the rhythm.");
 assert.equal(f.session.messages.at(-1).role,"user");
 assert.equal(f.session.factory_handoff.status,"returned_for_changes");
 assert.equal(f.session.attempts[0].artifact_id,v1);
 assert.equal(f.session.attempts[1].artifact_id,v2);
 assert.equal(f.session.version,14);
 assert.equal(f.writes,1);assert.equal(f.saves,1);
});
test("replay and interrupted session write are idempotent with matching owned hold",async()=>{
 const f=fixture();f.failSession=true;
 await assert.rejects(f.run(),/session transient failure/);
 assert.equal(f.row.fields.Do_Not_Publish,true);
 assert.equal(f.session.state,"approved");
 f.failSession=false;
 assert.equal((await f.run()).ok,true);
 assert.equal((await f.run()).replay,true);
 assert.equal(f.session.messages.length,1);
 assert.equal(f.writes,1);assert.equal(f.saves,1);
});
test("rejects change of request text using same id, and forged/late stage",async()=>{
 const f=fixture();await f.run();
 await assert.rejects(f.run("A different note."),e=>e.code==="FACTORY_RETURN_DUPLICATE_ID");
 for(const change of [
   r=>r.row.fields.Published_At="2026-10-29T18:00:00Z",
   r=>r.row.fields.Final_File_ID=v1,
   r=>r.row.fields.Scheduled_Post_Date="2026-11-01T10:00:00Z",
   r=>r.row.fields.Studio_Render_Review_Hold_ID="another-hold"
 ]){
   const t=fixture();change(t);
   await assert.rejects(t.run());assert.equal(t.writes,0);
 }
});
test("Factory Preview selects only the exact accepted V2 and not stale media",()=>{
 const f=fixture();
 assert.equal(factorySelectedReviewAttempt({session:f.session,row:f.row,profile,outputId:id})?.id,attemptId);
 f.row.fields.Final_File_ID=v1;
 assert.equal(factorySelectedReviewAttempt({session:f.session,row:f.row,profile,outputId:id}),null);
 f.row.fields.Final_File_ID=v2;
 f.row.fields.Published_At="2026-10-29T18:00:00Z";
 assert.equal(factorySelectedReviewAttempt({session:f.session,row:f.row,profile,outputId:id}),null);
});
test("private Factory V2 stream supports range and never leaks Drive links",async()=>{
 const f=fixture();
 const request=new Request("https://studio.chicagoshining.com/api/factory/outputs/"+id+"/preview",{headers:{Range:"bytes=0-99"}});
 let observed=null;
 const response=await serveFactorySelectedReviewVideo({request,env,outputId:id,
  authorization:{authenticated:true,authorized:true,permissions:{outputs_review:true}},
  readSession:f.ops.readSession,readRow:f.ops.readRawOutput,readProfile:async()=>profile,
  readVideo:async(outputId,attemptId,proxy)=>{
    observed={outputId,attemptId,range:proxy.headers.get("Range")};
    return new Response("MP4",{status:206,headers:{"Content-Type":"video/mp4",
      "Content-Length":"3","Content-Range":"bytes 0-2/20"}});
  },
  copyHeaders:upstream=>new Headers(upstream.headers)});
 assert.equal(response.status,206);
 assert.deepEqual(observed,{outputId:id,attemptId,range:"bytes=0-99"});
 assert.equal(response.headers.get("X-Studio-Preview-Source"),"factory-selected-review-attempt");
 assert.equal(response.headers.get("Cache-Control"),"private, no-store");
});
