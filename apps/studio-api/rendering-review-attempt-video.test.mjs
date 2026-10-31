import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serveReviewAttemptVideo,fetchTrustedRunnerReviewMedia} from "./rendering-review-attempt-video.mjs";
const output="rec0uVrVeiUM6shp9", id="rrattempt_1234567890abcdef";
const file="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4";
const session={id:"rrsession_test12345678",output_id:output,
  review_hold:{active:true},
  attempts:[{id,number:2,status:"ready_for_review",artifact_id:file}]};
function fixture(){
  let count=0;
  const args={
    request:new Request("https://studio.example/api/rendering-review/outputs/"+output+"/attempts/"+id+"/preview",
      {headers:{"Range":"bytes=0-100"}}),
    url:new URL("https://studio.example/api/rendering-review/outputs/"+output+"/attempts/"+id+"/preview"),
    env:{RENDERING_REVIEW_EXACT_OUTPUT_ID:output},
    authorization:{authenticated:true,authorized:true,permissions:{outputs_review:true}},
    loadWorkspace:async()=>({ok:true,publication_hold_verified:true,session}),
    listAttempts:async()=>[{fields:{Attempt_ID:id,Session_ID:session.id,
      Output_Record_ID:output,Attempt_Number:2,Attempt_Status:"ready_for_review",Artifact_File_ID:file}}],
    readVideo:async(a,b,req)=>{
      count++;assert.equal(a,file);assert.match(b,/drive.google.com/);
      assert.equal(req.headers.get("Range"),"bytes=0-100");
      return new Response("mp4",{status:206,headers:{
        "Content-Type":"video/mp4","Content-Range":"bytes 0-100/400","Accept-Ranges":"bytes"}});
    },
    copyHeaders:r=>new Headers(r.headers),
  };
  return {args,calls:()=>count};
}
test("streams verified V2 with byte ranges, never embedding Drive",async()=>{
  const f=fixture();
  const r=await serveReviewAttemptVideo(f.args);
  assert.equal(r.status,206);
  assert.equal(r.headers.get("X-Studio-Preview-Source"),"rendering-review-owned-drive-attempt");
  assert.equal(r.headers.get("Cache-Control"),"private, no-store");
  assert.equal(f.calls(),1);
});
test("a stale exact-output binding cannot block a held V2, but permissions and hold still gate media",async()=>{
  const f=fixture();
  // A prior exact-output binding cannot shadow a separately enrolled,
  // authenticated held Review output. Studio and Runner both re-read scope.
  f.args.env.RENDERING_REVIEW_EXACT_OUTPUT_ID="recA1B2C3D4E5F6G7";
  assert.equal((await serveReviewAttemptVideo(f.args)).status,206);
  f.args.env.RENDERING_REVIEW_EXACT_OUTPUT_ID=output;
  f.args.authorization.permissions.outputs_review=false;
  await assert.rejects(()=>serveReviewAttemptVideo(f.args),e=>e.status===403);
  f.args.authorization.permissions.outputs_review=true;
  f.args.loadWorkspace=async()=>({ok:true,publication_hold_verified:false,session});
  await assert.rejects(()=>serveReviewAttemptVideo(f.args),e=>e.status===409);
  assert.equal(f.calls(),0);
});
test("rejects mismatched persistent attempt, missing artifact and unready status",async()=>{
  const f=fixture();
  f.args.listAttempts=async()=>[{fields:{Attempt_ID:id,Session_ID:session.id,
    Output_Record_ID:output,Attempt_Number:2,Attempt_Status:"queued",Artifact_File_ID:file}}];
  await assert.rejects(()=>serveReviewAttemptVideo(f.args),e=>e.status===409);
  const wrong={...session,attempts:[{...session.attempts[0],status:"rendering"}]};
  f.args.loadWorkspace=async()=>({ok:true,publication_hold_verified:true,session:wrong});
  await assert.rejects(()=>serveReviewAttemptVideo(f.args),e=>e.status===409);
  assert.equal(f.calls(),0);
});

test("separately admitted #9389 V2 has a playable authorized preview route",async()=>{
  const f=fixture();
  const nextOutput="recVFaT3VnhCD3dcb";
  const nextAttempt="rrattempt_2fd0ffb68ead349090898bc8cf69bac093a08f1706ff230a";
  const nextFile="1aS0OwooNJY5cmoCK-z6T8gpxzRcD-fux";
  const nextSession={...session,output_id:nextOutput,
    attempts:[{id:nextAttempt,number:2,status:"ready_for_review",artifact_id:nextFile}]};
  f.args.request=new Request("https://studio.example/api/rendering-review/outputs/"+nextOutput+
    "/attempts/"+nextAttempt+"/preview",{headers:{Range:"bytes=0-100"}});
  f.args.url=new URL(f.args.request.url);
  f.args.env.RENDERING_REVIEW_EXACT_OUTPUT_ID=output;
  f.args.loadWorkspace=async()=>({ok:true,publication_hold_verified:true,session:nextSession});
  f.args.listAttempts=async()=>[{fields:{Attempt_ID:nextAttempt,Session_ID:nextSession.id,
    Output_Record_ID:nextOutput,Attempt_Number:2,Attempt_Status:"ready_for_review",
    Artifact_File_ID:nextFile}}];
  f.args.readVideo=async(file,source,probe,config,identity)=>{
    assert.equal(file,nextFile);
    assert.equal(identity.outputId,nextOutput);
    assert.equal(identity.attemptId,nextAttempt);
    assert.equal(probe.headers.get("Range"),"bytes=0-100");
    return new Response("mp4",{status:206,headers:{"Content-Type":"video/mp4"}});
  };
  const response=await serveReviewAttemptVideo(f.args);
  assert.equal(response.status,206);
  assert.equal(response.headers.get("X-Studio-Preview-Source"),"rendering-review-owned-drive-attempt");
  f.args.listAttempts=async()=>[{fields:{Attempt_ID:nextAttempt,Session_ID:nextSession.id,
    Output_Record_ID:nextOutput,Attempt_Number:2,Attempt_Status:"ready_for_review",
    Artifact_File_ID:"some-other-drive-file-identity"}}];
  await assert.rejects(()=>serveReviewAttemptVideo(f.args),e=>e.status===409);
});

test("exact Runner Google relay preserves Range and credentials never appear in media URL",async()=>{
  let seen;
  const reply=await fetchTrustedRunnerReviewMedia({
    env:{PIPELINE_RUNNER_URL:"https://pipeline.chicagoshining.com",
      PIPELINE_RUNNER_SHARED_SECRET:"x".repeat(32)},
    outputId:output,attemptId:id,
    request:new Request("https://studio.example/media",{headers:{Range:"bytes=50-99"}}),
    transport:async(url,options)=>{seen={url,options};return new Response("video",{
      status:206,headers:{"Content-Type":"video/mp4","Content-Range":"bytes 50-99/700"}})},
  });
  assert.equal(reply.status,206);
  assert.equal(seen.url,"https://pipeline.chicagoshining.com/jobs/rendering-review/attempt-media/"+output+"/"+id);
  assert.equal(seen.options.headers.get("Range"),"bytes=50-99");
  assert.equal(seen.options.headers.get("X-Pipeline-Secret"),"x".repeat(32));
  assert.equal(seen.url.includes("x".repeat(32)),false);
});
test("Runner relay fails closed for untrusted origin and malformed range",async()=>{
  const base={PIPELINE_RUNNER_URL:"https://untrusted.example",
    PIPELINE_RUNNER_SHARED_SECRET:"x".repeat(32)};
  const request=new Request("https://studio.example/media",{headers:{Range:"bytes=0-99"}});
  await assert.rejects(()=>fetchTrustedRunnerReviewMedia({
    env:base,outputId:output,attemptId:id,request}),e=>e.status===503);
  await assert.rejects(()=>fetchTrustedRunnerReviewMedia({
    env:{...base,PIPELINE_RUNNER_URL:"https://pipeline.chicagoshining.com"},
    outputId:output,attemptId:id,
    request:new Request("https://studio.example/media",{headers:{Range:"nonsense"}}),
  }),e=>e.status===416);
});

test("Worker awaits preview promise so a rejected V2 stream becomes JSON rather than Error 1101",()=>{
  const source=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  assert.match(source,/if \(isReviewAttemptPreviewRoute\) \{\s*\/\/[^\n]*\n\s*return await serveReviewAttemptVideo\(/);
});
