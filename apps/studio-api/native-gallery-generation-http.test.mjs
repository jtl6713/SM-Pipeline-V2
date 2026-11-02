import test from "node:test";
import assert from "node:assert/strict";
import {handleNativeGalleryGenerate} from "./native-gallery-generation-http.mjs";

const OUTPUT="rec00000000000001",PROFILE="rec00000000000002";
const CONTENT="rec00000000000003",SLIDE="rec00000000000004";
const actor="rec00000000000005";
const flags={
 NATIVE_GALLERY_JOB_WRITE_ENABLED:"true",
 NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",
 NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED:"true",
 NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
 NATIVE_GALLERY_MEDIA_RENDER_VERIFIED:"true",
 AIRTABLE_OUTPUT_TABLE_ID:"tblrlPeboBthkplH0",
};
function request(body={}){
 return new Request("https://studio.example/api/factory/outputs/"+OUTPUT+"/gallery-generate",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({client_request_id:"test-request-12345678",
   selected_slides:[{slide_id:SLIDE,instruction:
     "Brighten this photograph without changing its subjects"}],...body}),
 });
}
const inventory={ok:true,source_kind:"airtable_metadata_only",
 output_id:OUTPUT,content_item_id:CONTENT,profile_id:PROFILE,
 platform:"Instagram",output_type:"Instagram Carousel",aspect_ratio:"4:5",
 source_complete:true,slide_count:1,review_hold_created:false,
 can_generate:false,publication_authorized:false,blockers:[],
 slides:[{slide_id:SLIDE,order:1,blockers:[],status:"source_metadata_present"}],
};
const authorization={authenticated:true,authorized:true,
 user:{record_id:actor},permissions:{outputs_review:true}};
function adapters(){
 let inventoryReads=0,tableWrites=0,verified=0;
 const jobAdapter={
  withOutputLock:async(_id,fn)=>fn(),
  airtableFetch:async(_env,table,_id,opts)=>{
    if(opts?.method==="POST")tableWrites++;
    if(table===flags.AIRTABLE_OUTPUT_TABLE_ID)return {id:OUTPUT,fields:{
      Content_Item:[CONTENT],Do_Not_Publish:true,
      Platform_Output_Type:"Instagram Carousel",
      Studio_Render_Review_Hold_Active:true,
      Studio_Render_Review_Hold_ID:"hold_123456789",
      Studio_Render_Review_Hold_Owner:"owner_123456789",
      Studio_Render_Review_Session_ID:"owner_123456789",
    }};
    if(table==="tblwzN9AXWvmKVKPs")
      return {id:CONTENT,fields:{Content_Profile:[PROFILE]}};
    throw Error("unexpected Airtable table");
  },
  listRecords:async()=>[],
  verifySource:async data=>{verified++;return {...data,
    sources_byte_verified:true,source_rights_verified:true,
    shared_watermark_asset_verified:true,
    original_artifact_watermark_verified:false,
    publication_hold_verified:false,
    original_manifest_sha256:"a".repeat(64),original_artifacts:[]};
  },
 };
 const input={request:request(),env:flags,output_id:OUTPUT,
   authorization,assertWriteRequest:()=>{},
   loadInventory:async()=>{inventoryReads++;return inventory;},jobAdapter};
 return {input,stats:()=>({inventoryReads,tableWrites,verified})};
}
test("disabled generation does not even read inventory",async()=>{
 const f=adapters();
 await assert.rejects(handleNativeGalleryGenerate({...f.input,
  env:{...flags,NATIVE_GALLERY_JOB_WRITE_ENABLED:"false"}}),
  /NATIVE_GALLERY_JOB_WRITES_DISABLED/);
 assert.equal(f.stats().inventoryReads,0);
 assert.equal(f.stats().tableWrites,0);
});
test("authentication and reviewer permission required",async()=>{
 const f=adapters();
 await assert.rejects(handleNativeGalleryGenerate({...f.input,
  authorization:{authenticated:false}}),
  /NATIVE_GALLERY_REVIEW_PERMISSION_DENIED/);
 assert.equal(f.stats().inventoryReads,0);
});
test("real backend does not accept metadata-only watermark proof",async()=>{
 const f=adapters();
 await assert.rejects(handleNativeGalleryGenerate(f.input),
  /NATIVE_GALLERY_ORIGINAL_MEDIA_NOT_CERTIFIED/);
 assert.equal(f.stats().verified,1);
 assert.equal(f.stats().tableWrites,0);
});
test("client-supplied authority fields rejected before Airtable writing",async()=>{
 const f=adapters();
 await assert.rejects(handleNativeGalleryGenerate({...f.input,
  request:request({allow_public_publish:true})}),
  /NATIVE_GALLERY_INVALID_GENERATION_REQUEST/);
 assert.equal(f.stats().tableWrites,0);
});
