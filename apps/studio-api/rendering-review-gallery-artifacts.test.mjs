import test from "node:test";
import assert from "node:assert/strict";
import {REVIEW_GALLERY_SCHEMA,validateReviewGalleryAttempt as verify}
 from "./rendering-review-gallery-artifacts.mjs";
const rec=n=>"rec"+String(n).padStart(14,"0");
const output=rec(1),profile=rec(2),hash=c=>c.repeat(64);
const asset=(n,drive,ratio="4:5")=>({
  slot_id:"slide_"+n+"_12345",order:n,
  drive_file_id:drive,mime_type:"image/jpeg",byte_count:21001,
  width:1080,height:ratio==="1:1"?1080:ratio==="16:9"?608:ratio==="9:16"?1920:1350,
  sha256:hash(String(n)),canonical_media_authority:"google_drive",
  authority:"server",verified:true,google_drive_verified:true,
  rights_verified:true,watermark_verified:true,profile_id:profile,output_id:output,
});
const file=(n)=>"file_abcdefghijklmnopqrstuvwxyz"+n;
function fixture(count=3,ratio="4:5"){
  const originals=Array.from({length:count},(_,i)=>asset(i+1,file("o"+i),ratio));
  const newSlides=originals.map((x,i)=>({...x,
    drive_file_id:i===1?file("new1"):x.drive_file_id,
    sha256:i===1?hash("f"):x.sha256}));
  const common={schema:REVIEW_GALLERY_SCHEMA,output_id:output,profile_id:profile,
    aspect_ratio:ratio,media_kind:"image-set",authority:"server",verified:true};
  return {
    output_id:output,profile_id:profile,aspect_ratio:ratio,
    original:{...common,source_kind:"original",manifest_sha256:hash("a"),artifacts:originals},
    revision:{...common,source_kind:"revision",manifest_sha256:hash("b"),
      original_manifest_sha256:hash("a"),artifacts:newSlides},
  };
}
test("independently verified single image and ordered gallery preserve identity",()=>{
  for(const count of [1,3,10]){
    const f=fixture(count);
    if(count===1){
      f.revision.artifacts[0]={...f.original.artifacts[0],
        drive_file_id:file("replaced"),sha256:hash("f")};
    }
    const approved=verify(f);
    assert.equal(approved.slide_count,count);
    assert.equal(approved.changed_count,1);
    assert.equal(approved.approval_granted,false);
    assert.equal(approved.publishing_granted,false);
  }
});
test("four standard image aspects require the correct dimensions",()=>{
  for(const ratio of ["4:5","1:1","9:16","16:9"]){
    const f=fixture(3,ratio);assert.equal(verify(f).aspect_ratio,ratio);
  }
});
test("tampered source, profile, slide order, rights and watermark always fail",()=>{
  const mutate=[
    f=>f.revision.artifacts[0].profile_id=rec(9),
    f=>f.revision.artifacts[0].output_id=rec(9),
    f=>f.revision.artifacts[1].watermark_verified=false,
    f=>f.revision.artifacts[1].rights_verified=false,
    f=>f.revision.artifacts[1].google_drive_verified=false,
    f=>f.revision.artifacts[1].width=600,
    f=>f.revision.artifacts[1].sha256="not-a-hash",
    f=>f.revision.artifacts[1].drive_file_id=f.revision.artifacts[0].drive_file_id,
    f=>f.revision.artifacts[1].slot_id=f.original.artifacts[0].slot_id,
    f=>f.revision.artifacts.reverse(),
    f=>f.revision.original_manifest_sha256=hash("c"),
    f=>f.revision.artifacts.push({...f.revision.artifacts[0],order:4}),
    f=>f.original.artifacts.splice(0,1),
    f=>f.revision.artifacts[1].mime_type="video/mp4",
    f=>f.revision.artifacts[1].authority="model",
    f=>f.revision.artifacts[1].verified=false,
    f=>f.revision.artifacts[1].byte_count=0,
  ];
  for(const change of mutate){
    const f=fixture();change(f);
    assert.throws(()=>verify(f),{code:"REVIEW_GALLERY_EVIDENCE_REJECTED"});
  }
});
test("no-op revision and contradictory hash for unchanged Drive ID are rejected",()=>{
  const f=fixture();
  f.revision.artifacts=f.original.artifacts.map(x=>({...x}));
  assert.throws(()=>verify(f));
  f.revision.artifacts[0].sha256=hash("e");
  assert.throws(()=>verify(f));
});
