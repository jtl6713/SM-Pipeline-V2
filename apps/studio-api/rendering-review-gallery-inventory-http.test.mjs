import test from "node:test";
import assert from "node:assert/strict";
import {readAuthoritativeGalleryInventory} from "./rendering-review-gallery-inventory-http.mjs";
const rec=n=>"rec"+String(n).padStart(14,"0");
const outputId=rec(1),contentId=rec(2),profile=rec(3),slideId=rec(4);
function setup(){
 let slidesRead=0;
 const output={id:outputId,fields:{
  Content_Item:[contentId],"Carousel Slides":[slideId],
  Platform:"Instagram",Platform_Output_Type:"Instagram Carousel",Aspect_Ratio:"4:5",
 }};
 const content={id:contentId,fields:{Content_Profile:[profile]}};
 const slide={id:slideId,fields:{
  "Content Item":[contentId],"Platform Output":[outputId],
  "Slide Number":1,Platform:"Instagram","Aspect Ratio":"4:5",
  "Approved For Final":true,"Review Status":"Final Approved",
  Asset_4x5_File_ID:"very_long_private_google_drive_file_id_123456",
 }};
 return {output,content,slide,get slidesRead(){return slidesRead},
  args:{output_id:outputId,authorized_profile_ids:[profile],
   readOutput:async()=>output,readContent:async()=>content,
   readSlides:async()=>{slidesRead++;return [slide];},
  }};
}
test("reads exact output/content before original slides; no write or publish",async()=>{
 const x=setup();const out=await readAuthoritativeGalleryInventory(x.args);
 assert.equal(x.slidesRead,1);assert.equal(out.slide_count,1);
 assert.equal(out.can_generate,false);assert.equal(out.publication_authorized,false);
 assert.equal(out.google_drive_verified,false);
});
test("foreign profile stops before slide read",async()=>{
 const x=setup();x.args.authorized_profile_ids=[rec(20)];
 await assert.rejects(readAuthoritativeGalleryInventory(x.args),{status:403});
 assert.equal(x.slidesRead,0);
});
test("exact row inventory rejects partial, duplicated, forged and foreign slides",async()=>{
 for(const val of [[],[null],[{id:rec(6),fields:{}}],[
 {id:slideId,fields:{}},{id:slideId,fields:{}}
 ]] ){
  const x=setup();x.args.readSlides=async()=>val;
  await assert.rejects(readAuthoritativeGalleryInventory(x.args),{status:503});
 }
});
