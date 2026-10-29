import test from "node:test";
import assert from "node:assert/strict";
import {previewAcceptedFactoryRevision} from "./rendering-review-factory-video.mjs";
const id="rec0uVrVeiUM6shp9",attemptId="rrattempt_exact_26054929500";
const file="1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up";
function fixture(){
 const session={
  id:"rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796",
  output_id:id,state:"approved",review_hold:{active:false},version:13,
  current_attempt_id:attemptId,approved_attempt_id:attemptId,
  factory_handoff:{status:"ready_for_factory_approval",attempt_id:attemptId,artifact_id:file},
  attempts:[{id:attemptId,number:2,status:"ready_for_review",artifact_id:file}],
 };
 const row={id,fields:{
  Final_File_ID:file,Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
  Render_Status:"Rendered",Output_Status:"Ready for Review",Review_Status:"Review Sent",
  Publish_Status:"Not Ready",Auto_Publish_Enabled:false,
 }};
 const attempt={fields:{
  Attempt_ID:attemptId,Output_Record_ID:id,Session_ID:session.id,
  Artifact_File_ID:file,Attempt_Status:"ready_for_review",Attempt_Number:2,
 }};
 const evidence={count:0};
 const args={
  request:new Request("https://studio.chicagoshining.com/api/outputs/"+id+"/preview",{
    headers:{"Range":"bytes=0-3"}}),
  env:{RENDERING_REVIEW_EXACT_OUTPUT_ID:id},
  authorization:{authenticated:true,authorized:true,permissions:{outputs_review:true}},
  outputId:id,
  operations:{readSession:async()=>session,readRawOutput:async()=>row,
    readAttempt:async()=>attempt},
  readVideo:async({outputId,attemptId:aid,request})=>{
    assert.equal(outputId,id);assert.equal(aid,attemptId);
    assert.equal(request.headers.get("Range"),"bytes=0-3");
    evidence.count++;
    return new Response("data",{status:206,headers:{
      "Content-Type":"video/mp4","Content-Range":"bytes 0-3/123",
    }});
  },
  copyHeaders:upstream=>new Headers(upstream.headers),
 };
 return {args,session,row,attempt,evidence};
}
test("Factory plays exact accepted V2, not V1 or thumbnail",async()=>{
 const f=fixture();const res=await previewAcceptedFactoryRevision(f.args);
 assert.equal(res.status,206);
 assert.equal(res.headers.get("X-Studio-Preview-Source"),"factory-accepted-review-v2");
 assert.equal(await res.text(),"data");
 assert.equal(f.evidence.count,1);
});
test("preview refuses stale media, dispatch or an altered approval receipt",async()=>{
 for(const change of [
   f=>{f.row.fields.Final_File_ID="old-v1"},
   f=>{f.row.fields.Scheduled_Post_Date="2026-10-30T17:00:00Z"},
   f=>{f.row.fields.Do_Not_Publish=true},
   f=>{f.row.fields.Auto_Publish_Enabled=true},
   f=>{f.session.factory_handoff.artifact_id="old-v1"},
   f=>{f.attempt.fields.Artifact_File_ID="old-v1"},
   f=>{f.session.state="discussing"},
 ]){
   const f=fixture();change(f);
   await assert.rejects(previewAcceptedFactoryRevision(f.args));
   assert.equal(f.evidence.count,0);
 }
});
test("other outputs keep their existing Factory preview path",async()=>{
 const f=fixture();f.args.outputId="recA1B2C3D4E5F6G7";
 assert.equal(await previewAcceptedFactoryRevision(f.args),null);
});
