import test from "node:test";
import assert from "node:assert/strict";
import {projectGallerySourceInventory as inventory} from "./rendering-review-gallery-inventory.mjs";
const rec=n=>"rec"+String(n).padStart(14,"0");
const output=rec(1),content=rec(2),profile=rec(3);
function fixture(count=3,ratio="4:5"){
 const ids=Array.from({length:count},(_,i)=>rec(10+i));
 const field=({"1:1":"Asset_1x1_File_ID","4:5":"Asset_4x5_File_ID",
 "9:16":"Asset_9x16_File_ID","16:9":"Final Google Drive File ID"})[ratio];
 return {output_id:output,authorized_profile_ids:[profile],
  output:{id:output,fields:{"Content_Item":[content],"Carousel Slides":ids,
   "Platform_Output_Type":"Instagram Carousel",Platform:"Instagram",Aspect_Ratio:ratio}},
  content:{id:content,fields:{Content_Profile:[profile]}},
  slides:ids.map((id,i)=>({id,fields:{
   "Platform Output":[output],"Content Item":[content],
   Platform:"Instagram","Slide Number":i+1,"Aspect Ratio":ratio,
   "Review Status":"Final Approved","Approved For Final":true,
   [field]:"drive_confirmed_original_file_id_"+i,
  }}))};
}
test("metadata inventory preserves ordered exact owned slides without claiming verified generation",()=>{
 for(const ratio of ["4:5","1:1","9:16","16:9"]){
  const out=inventory(fixture(3,ratio));
  assert.equal(out.ok,true);
  assert.equal(out.slide_count,3);
  assert.equal(out.slides[0].order,1);
  assert.equal(out.source_complete,true);
  assert.equal(out.can_generate,false);
  assert.equal(out.watermark_verified,false);
  assert.equal(out.publication_authorized,false);
  assert.ok(out.blockers.includes("GALLERY_DRIVE_BYTE_AND_BRANDING_VERIFICATION_REQUIRED"));
  assert.equal(JSON.stringify(out).includes("drive_confirmed_original_file_id_"),false);
 }
});
test("missing, deleted, or unapproved slides are visible as blockers, never readiness",()=>{
 const f=fixture();f.slides[0].fields["Approved For Final"]=false;
 f.slides[1].fields["Deleted From Carousel"]=true;
 delete f.slides[2].fields.Asset_4x5_File_ID;
 const result=inventory(f);
 assert.equal(result.source_complete,false);
 assert.equal(result.can_generate,false);
 assert.ok(result.slides.every(s=>s.blockers.length));
});
test("cross-profile and foreign Content Item/output scope denied",()=>{
 const cases=[
  f=>f.authorized_profile_ids=[rec(4)],
  f=>f.content.fields.Content_Profile=[rec(4)],
  f=>f.slides[0].fields["Content Item"]=[rec(4)],
  f=>f.slides[0].fields["Platform Output"]=[rec(4)],
  f=>f.slides[0].fields.Platform="YouTube",
 ];
 for(const change of cases){const f=fixture();change(f);assert.throws(()=>inventory(f),{status:403});}
});
test("duplicates, missing source rows, order gaps and non-gallery types fail closed",()=>{
 const changes=[
  f=>f.output.fields["Carousel Slides"].push(f.output.fields["Carousel Slides"][0]),
  f=>f.slides.pop(),
  f=>f.slides[1].fields["Slide Number"]=5,
  f=>f.output.fields.Platform_Output_Type="Instagram Reel",
 ];
 for(const change of changes){const f=fixture();change(f);assert.throws(()=>inventory(f));}
});
test("empty linked source returns explicit missing link blocker, not ready",()=>{
 const f=fixture(0);const out=inventory(f);
 assert.equal(out.source_complete,false);
 assert.ok(out.blockers.includes("GALLERY_SOURCE_LINKS_MISSING"));
 assert.equal(out.can_generate,false);
});
