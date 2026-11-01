import test from "node:test";
import assert from "node:assert/strict";
import {buildOriginalGalleryManifest as build} from "./rendering-review-gallery-source.mjs";
const rec=n=>"rec"+String(n).padStart(14,"0");
const OUTPUT=rec(1),CONTENT=rec(2),PROFILE=rec(3);
const drive=n=>"drive_original_slide_abcdefghijk"+n;
function setup(ratio="4:5",count=3){
 const field={"4:5":"Asset_4x5_File_ID","9:16":"Asset_9x16_File_ID",
  "1:1":"Asset_1x1_File_ID","16:9":"Final Google Drive File ID"}[ratio];
 const originals=Array.from({length:count},(_,i)=>({id:rec(10+i),fields:{
   "Content Item":[CONTENT],"Platform Output":[OUTPUT],Platform:"Instagram",
   "Aspect Ratio":ratio,"Slide Number":i+1,"Deleted From Carousel":false,
   "Approved For Final":true,"Review Status":"Final Approved",
   [field]:drive(i),
 }}));
 let read=0;
 const verifyDriveImage=async arg=>{
   read++;
   const dims={"4:5":[1080,1350],"9:16":[1080,1920],"1:1":[1080,1080],
      "16:9":[1920,1080]}[ratio];
   return {verified:true,authority:"server",canonical_media_authority:"google_drive",
     google_drive_verified:true,watermark_verified:true,rights_verified:true,
     file_id:arg.file_id,output_id:arg.output_id,profile_id:arg.profile_id,
     slide_record_id:arg.slide_record_id,mime_type:"image/png",
     byte_count:245000,width:dims[0],height:dims[1],sha256:"a".repeat(64)};
 };
 return {args:{output_id:OUTPUT,content_item_id:CONTENT,profile_id:PROFILE,
    platform:"Instagram",aspect_ratio:ratio,slides:originals,verifyDriveImage},
   get read(){return read}};
}
test("constructs immutable original from exact linked ordered Drive slides, any profile",async()=>{
 for(const ratio of ["4:5","1:1","9:16","16:9"]){
  const f=setup(ratio);const m=await build(f.args);
  assert.equal(m.artifacts.length,3);
  assert.equal(m.artifacts[0].slot_id,rec(10));
  assert.equal(m.artifacts[1].order,2);
  assert.equal(m.profile_id,PROFILE);
  assert.equal(m.source_kind,"original");
  assert.equal(m.manifest_sha256.length,64);
  assert.equal(f.read,3);
 }
});
test("never accepts a foreign content item, output link, platform or slide order",async()=>{
 const changes=[
  x=>x.fields["Content Item"]=[rec(7)],
  x=>x.fields["Platform Output"]=[rec(7)],
  x=>x.fields.Platform="TikTok",
  x=>x.fields["Aspect Ratio"]="1:1",
  x=>x.fields["Slide Number"]=8,
  x=>x.fields["Approved For Final"]=false,
  x=>x.fields["Review Status"]="Rejected",
 ];
 for(const change of changes){
  const f=setup();change(f.args.slides[0]);
  await assert.rejects(()=>build(f.args));
 }
});
test("cross-profile Drive evidence, missing watermark or wrong aspect all deny",async()=>{
 const changes=[
  r=>r.profile_id=rec(8),
  r=>r.rights_verified=false,
  r=>r.watermark_verified=false,
  r=>r.google_drive_verified=false,
  r=>r.width=1080,
  r=>r.mime_type="text/html",
  r=>r.file_id="forged",
 ];
 for(const change of changes){
  const f=setup();
  f.args.verifyDriveImage=async arg=>{
   const r={verified:true,authority:"server",canonical_media_authority:"google_drive",
    google_drive_verified:true,rights_verified:true,watermark_verified:true,
    file_id:arg.file_id,output_id:arg.output_id,profile_id:PROFILE,
    slide_record_id:arg.slide_record_id,mime_type:"image/png",
    byte_count:245000,width:900,height:1125,sha256:"a".repeat(64)};
   change(r);return r;
  };
  await assert.rejects(()=>build(f.args),{code:"GALLERY_SOURCE_DRIVE_EVIDENCE_INVALID"});
 }
});
test("same Drive image reused in different slots never silently accepted",async()=>{
 const f=setup();f.args.slides[1].fields.Asset_4x5_File_ID=drive(0);
 await assert.rejects(()=>build(f.args),{code:"GALLERY_SOURCE_DRIVE_ID_INVALID"});
});
