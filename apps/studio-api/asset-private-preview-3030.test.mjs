import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ISSUE3030_PROFILE, ISSUE3030_PHOTOS, eligibleIssue3030Photo, serveIssue3030Photo } from "./asset-private-preview-3030.mjs";
const id=Object.keys(ISSUE3030_PHOTOS)[0],[file,size]=ISSUE3030_PHOTOS[id];
const row={airtable_record_id:id,active:true,do_not_use:false,asset_status:"Available",media_class:"Image",mime_type:"image/png",google_drive_file_id:file,file_size_bytes:size,metadata:{content_profile_airtable_id:ISSUE3030_PROFILE,studio_transfer_id:"ITEM4-MASTER-test"}};
const bytes=Uint8Array.from([255,216,255,...Array(24).fill(0),255,217]);
const digest=createHash("sha256").update(bytes).digest("hex");
const headers={"Content-Type":"image/jpeg","Content-Length":String(bytes.length),"X-Asset-Preview-Record":id,"X-Asset-Preview-Source-Id":file,"X-Asset-Preview-Source-Bytes":String(size),"X-Asset-Preview-Sha256":digest};
const opts=(overrides={})=>({request:new Request("https://studio.invalid/api/media-assets/"+id+"/preview"),env:{PIPELINE_RUNNER_URL:"https://pipeline.chicagoshining.com",PIPELINE_RUNNER_SHARED_SECRET:"test-secret-012345678901234567890"},assetId:id,authorizeProfile:async p=>assert.equal(p,ISSUE3030_PROFILE),readRows:async()=>[row],fetchImpl:async()=>new Response(bytes,{headers}),...overrides});
test("exact authorized original becomes a private verified thumbnail",async()=>{
  let reads=0;
  const response=await serveIssue3030Photo(opts({readRows:async()=>{reads++;return [row];},fetchImpl:async(url,o)=>{
    assert.equal(url,"https://pipeline.chicagoshining.com/jobs/assets/private-preview-source/"+id);
    assert.equal(o.redirect,"manual");assert.equal(o.headers["X-Pipeline-Secret"],opts().env.PIPELINE_RUNNER_SHARED_SECRET);
    return new Response(bytes,{headers});
  }}));
  assert.equal(response.status,200);assert.equal(reads,2);
  assert.equal(response.headers.get("X-Studio-Preview-Source"),"runner-photo-thumbnail");
  assert.match(response.headers.get("Cache-Control"),/^private/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
});
test("authorization denial, changed source, wrong profile and unknown IDs never fetch media",async()=>{
  const never=async()=>assert.fail("unexpected fetch");
  await assert.rejects(serveIssue3030Photo(opts({authorizeProfile:async()=>{throw Error("denied");},fetchImpl:never})),/denied/);
  await assert.rejects(serveIssue3030Photo(opts({readRows:async()=>[{...row,do_not_use:true}],fetchImpl:never})),/SOURCE_CHANGED/);
  assert.equal(eligibleIssue3030Photo([{...row,metadata:{...row.metadata,content_profile_airtable_id:"other"}}],id),false);
  assert.equal(await serveIssue3030Photo(opts({assetId:"unknown",fetchImpl:never})),null);
});
test("reject wrong receipt, truncated bytes, changed authority and hash mismatch",async()=>{
  for(const [h,data,reason] of [
    [{...headers,"X-Asset-Preview-Record":"other"},bytes,/RECEIPT_INVALID/],
    [headers,bytes.slice(0,-1),/IMAGE_INVALID/],
    [{...headers,"X-Asset-Preview-Sha256":"a".repeat(64)},bytes,/HASH_MISMATCH/],
  ])await assert.rejects(serveIssue3030Photo(opts({fetchImpl:async()=>new Response(data,{headers:h})})),reason);
  let n=0;
  await assert.rejects(serveIssue3030Photo(opts({readRows:async()=>[++n===1?row:{...row,active:false}]})),/SOURCE_CHANGED/);
});
test("route awaits error boundary and retains profile authorization",async()=>{
  const root=new URL("./",import.meta.url);
  const worker=await readFile(new URL("worker.js",root),"utf8");
  const functions=await readFile(new URL("worker-functions-03.mjs",root),"utf8");
  assert.match(worker,/return await mediaAssetImagePreview\(request, env, url, authorization\)/);
  assert.match(functions,/authorizeProfile: profileId => resolveWorkingContentProfile\(env, authorization, profileId\)/);
});
