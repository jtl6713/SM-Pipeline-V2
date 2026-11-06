import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readNativeGalleryPrivateManifest} from "./native-gallery-private-manifest.mjs";

const OUT="rec00000000000001",PRO="rec00000000000002";
const ITEM="rec00000000000003",SLIDE="rec00000000000004";
const FILE="private-gallery-drive-123456789",MEDIA="rec00000000000005";
const env={NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
 PIPELINE_RUNNER_URL:"https://runner.example",
 PIPELINE_RUNNER_SHARED_SECRET:"private-runner-token-123456789"};
function canonical(value){
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(
   k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
 return JSON.stringify(value);
}
const original_artifacts=[{slot_id:SLIDE,order:1,drive_file_id:FILE,
 source_media_asset_id:MEDIA,output_id:OUT,content_item_id:ITEM,
 profile_id:PRO,watermark_verified:true,rights_verified:true,
 airtable_identity_verified:true,mime_type:"image/png",
 width:400,height:500,byte_count:49152,sha256:"a".repeat(64)}];
const hash=createHash("sha256").update(canonical(original_artifacts)).digest("hex");
const trusted={ok:true,output_id:OUT,profile_id:PRO,
 content_item_id:ITEM,aspect_ratio:"4:5",slide_count:1,
 sources_byte_verified:true,source_rights_verified:true,
 shared_watermark_asset_verified:true,
 original_artifact_watermark_verified:true,
 original_manifest_sha256:hash,original_artifacts,
 can_generate:false,publication_authorized:false};
function remote(value=trusted){
 return async(url,options)=>{
  assert.equal(url,"https://runner.example/jobs/native-gallery/private-source-manifest");
  assert.equal(options.headers["X-Pipeline-Secret"],env.PIPELINE_RUNNER_SHARED_SECRET);
  assert.deepEqual(JSON.parse(options.body),{output_id:OUT,
    expected_profile_id:PRO});
  return {ok:true,status:200,text:async()=>JSON.stringify(value)};
 };
}
const input={env,output_id:OUT,profile_id:PRO,content_item_id:ITEM,
 aspect_ratio:"4:5"};
test("Worker can privately acquire exact byte-hashed original manifest",async()=>{
 const result=await readNativeGalleryPrivateManifest({...input,
   runnerFetch:remote()});
 assert.equal(result.original_artifacts[0].drive_file_id,FILE);
 assert.equal(result.original_manifest_sha256,hash);
 assert.equal(result.publication_authorized,false);
});
test("browser or disabled flag cannot access source manifest",async()=>{
 let called=false;
 await assert.rejects(readNativeGalleryPrivateManifest({
  ...input,env:{...env,NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"false"},
  runnerFetch:()=>{called=true;}}),/NATIVE_GALLERY_PRIVATE_MANIFEST_DISABLED/);
 assert.equal(called,false);
});
test("changed manifest and foreign identity fail closed",async()=>{
 for(const change of [
  {...trusted,original_manifest_sha256:"b".repeat(64)},
  {...trusted,profile_id:"rec99999999999999"},
  {...trusted,original_artifact_watermark_verified:false},
  {...trusted,original_artifacts:[{...original_artifacts[0],
    rights_verified:false}]},
 ]){
  await assert.rejects(readNativeGalleryPrivateManifest({
   ...input,runnerFetch:remote(change)}));
 }
});
