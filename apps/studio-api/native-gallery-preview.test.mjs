import test from "node:test";
import assert from "node:assert/strict";
import {serveNativeGalleryPreview} from "./native-gallery-preview.mjs";
const O="rec00000000000001",J="ngjob_12345678901234567890";
const C="rec00000000000003",P="rec00000000000002",S="rec00000000000004";
const env={NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED:"true",
 PIPELINE_RUNNER_URL:"https://pipeline.chicagoshining.com",
 PIPELINE_RUNNER_SHARED_SECRET:"private-native-gallery-preview-123456789"};
const auth={authenticated:true,authorized:true,
 permissions:{outputs_review:true},authorized_profile_ids:[P]};
const output={id:O,fields:{Content_Item:[C],
 Do_Not_Publish:true,Studio_Render_Review_Hold_Active:true,
 Studio_Render_Review_Hold_ID:"hold_12345678",
 Studio_Render_Review_Hold_Owner:"owner_12345678",
 Studio_Render_Review_Session_ID:"owner_12345678"}};
const job={id:"rec00000000000005",fields:{
 Job_ID:J,Output_Record_ID:O,Profile_Record_ID:P,Content_Item_Record_ID:C,
 Job_State:"ready_for_review",Revised_Manifest_SHA256:"a".repeat(64),
 Hold_ID:"hold_12345678",Hold_Owner:"owner_12345678"}};
const content={id:C,fields:{Content_Profile:[P]}};
const fake=new Uint8Array(1500).fill(11);
const base=()=>({request:new Request("https://studio.test/path"),env,
 authorization:auth,output_id:O,job_id:J,slide_id:S,
 variant:"revised",readOutput:async()=>output,
 readContent:async()=>content,readJob:async()=>job,
 transport:async(url,options)=>{
  assert.match(url,/\/revision-media\/rec00000000000001\//);
  assert.equal(options.headers["X-Pipeline-Secret"],
    env.PIPELINE_RUNNER_SHARED_SECRET);
  return new Response(fake,{status:200,headers:{"Content-Type":"image/png"}});
 }});
test("authorized private preview streams only branded image media",async()=>{
 const response=await serveNativeGalleryPreview(base());
 assert.equal(response.status,200);
 assert.equal(response.headers.get("Cache-Control"),"private, no-store");
 assert.equal(response.headers.get("Content-Type"),"image/png");
 assert.equal((await response.arrayBuffer()).byteLength,1500);
});
test("foreign profile, lost hold, unready job and disabled flag reject",async()=>{
 for(const alteration of [
   {authorization:{...auth,authorized_profile_ids:[]}},
   {readOutput:async()=>({id:O,fields:{...output.fields,Do_Not_Publish:false}})},
   {readJob:async()=>({id:job.id,fields:{...job.fields,Job_State:"claimed"}})},
   {env:{...env,NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED:"false"}},
 ]){
  await assert.rejects(serveNativeGalleryPreview({...base(),...alteration}));
 }
});
test("unsafe Runner origin and HTML never reach browser",async()=>{
 await assert.rejects(serveNativeGalleryPreview({...base(),
   env:{...env,PIPELINE_RUNNER_URL:"https://attacker.example"}}),
   /GALLERY_PREVIEW_RUNNER_UNAVAILABLE/);
 await assert.rejects(serveNativeGalleryPreview({...base(),
   transport:async()=>new Response("<html>bad</html>",{
     status:200,headers:{"Content-Type":"text/html"}})}),
   /GALLERY_PREVIEW_UNVERIFIED/);
});
