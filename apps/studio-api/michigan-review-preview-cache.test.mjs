import test from "node:test";
import assert from "node:assert/strict";
import {
  MICHIGAN_V2,MICHIGAN_V2_CACHE_KEY,
  serveMichiganV2CachedPreview,ensureMichiganV2CachedPreview,
} from "./michigan-review-preview-cache.mjs";
const meta={role:"review-only-v2-preview",sourceDriveFileId:MICHIGAN_V2.file_id,
  sourceAttemptId:MICHIGAN_V2.attempt_id,sha256:MICHIGAN_V2.sha256};
const original=new Uint8Array([0,0,0,24,102,116,121,112]);

function cache(){
  let object=null,writes=0;
  const env={STUDIO_MEDIA:{
    head:async key=>{assert.equal(key,MICHIGAN_V2_CACHE_KEY);return object},
    get:async (key,opts)=>{
      assert.equal(key,MICHIGAN_V2_CACHE_KEY);
      if(!object)return null;
      return {...object,range:opts?{offset:0,length:4}:null,
        body:new Blob([original]).stream()};
    },
    put:async (key,stream,options)=>{
      assert.equal(key,MICHIGAN_V2_CACHE_KEY);
      assert.equal(options.customMetadata.sourceDriveFileId,MICHIGAN_V2.file_id);
      assert.equal(options.customMetadata.role,"review-only-v2-preview");
      const reader=stream.getReader();while(!(await reader.read()).done){}
      writes++;object={size:MICHIGAN_V2.bytes,customMetadata:options.customMetadata};
    },
  }};
  return {env,get writes(){return writes},corrupt:()=>{object={size:123,customMetadata:meta}}};
}
test("held V2 source copies once into private R2; retry never reads Runner again",async()=>{
  const x=cache();let runnerCalls=0;
  const fetchVerifiedVideo=async(id,attempt,request)=>{
    assert.equal(id,MICHIGAN_V2.source_output_id);
    assert.equal(attempt,MICHIGAN_V2.attempt_id);
    assert.equal(request.headers.get("Range"),"bytes=0-");
    runnerCalls++;
    return new Response(new Blob([original]).stream(),{status:206,headers:{
      "Content-Type":"video/mp4",
      "Content-Range":"bytes 0-7/"+MICHIGAN_V2.bytes,
    }});
  };
  const args={env:x.env,sourceOutputId:MICHIGAN_V2.source_output_id,
    attemptId:MICHIGAN_V2.attempt_id,fetchVerifiedVideo,
    makeFixedLengthStream:()=>new TransformStream()};
  assert.equal((await ensureMichiganV2CachedPreview(args)).cached,false);
  assert.equal((await ensureMichiganV2CachedPreview(args)).cached,true);
  assert.equal(runnerCalls,1);assert.equal(x.writes,1);
  const response=await serveMichiganV2CachedPreview({
    env:x.env,fileId:MICHIGAN_V2.file_id,
    request:new Request("https://studio.chicagoshining.com/api/outputs/recAAA/preview",{
      headers:{Range:"bytes=0-3"}})});
  assert.equal(response.status,206);
  assert.equal(response.headers.get("Content-Range"),"bytes 0-3/"+MICHIGAN_V2.bytes);
  assert.equal(response.headers.get("X-Studio-Preview-Source"),"verified-review-r2");
  assert.equal(response.headers.get("Content-Type"),"video/mp4");
  assert.equal(response.headers.get("Content-Length"),"4");
  const head=await serveMichiganV2CachedPreview({env:x.env,fileId:MICHIGAN_V2.file_id,
    request:new Request("https://studio.chicagoshining.com/",{method:"HEAD"})});
  assert.equal(head.status,200);assert.equal(Number(head.headers.get("Content-Length")),MICHIGAN_V2.bytes);
});
test("cache never accepts another Drive file or a bad source/cache receipt",async()=>{
  const x=cache();
  assert.equal(await serveMichiganV2CachedPreview({
    request:new Request("https://studio.chicagoshining.com/"),
    env:x.env,fileId:"different"}),null);
  await assert.rejects(ensureMichiganV2CachedPreview({env:x.env,
    sourceOutputId:"recDifferentIDxxxx",attemptId:MICHIGAN_V2.attempt_id,
    fetchVerifiedVideo:async()=>{throw Error("should not be fetched")}}),
  /REVIEW_PREVIEW_CACHE_SOURCE_NOT_AUTHORIZED/);
  x.corrupt();
  await assert.rejects(serveMichiganV2CachedPreview({env:x.env,
    fileId:MICHIGAN_V2.file_id,
    request:new Request("https://studio.chicagoshining.com/")}),
  /REVIEW_PREVIEW_CACHE_PROVENANCE_INVALID/);
});
