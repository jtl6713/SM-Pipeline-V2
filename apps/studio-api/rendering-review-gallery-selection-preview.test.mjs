import test from "node:test";
import assert from "node:assert/strict";
import {previewNativeGalleryCorrection as preview} from "./rendering-review-gallery-selection-preview.mjs";
const rec=n=>"rec"+String(n).padStart(14,"0");
const O=rec(1),C=rec(2),P=rec(3);
const ids=[rec(11),rec(12),rec(13)];
const request=()=>({
  output_id:O,client_request_id:"manual_selection_123",
  selected_slides:[{slide_id:ids[1],instruction:"Change only the second photograph to a daytime scene."}],
  inventory:{
    ok:true,output_id:O,content_item_id:C,profile_id:P,
    source_kind:"airtable_metadata_only",can_generate:false,
    publication_authorized:false,review_hold_created:false,
    platform:"Instagram",output_type:"Instagram Carousel",aspect_ratio:"4:5",
    slide_count:3,blockers:["GALLERY_DRIVE_BYTE_AND_BRANDING_VERIFICATION_REQUIRED"],
    slides:ids.map((slide_id,i)=>({
      slide_id,order:i+1,status:"source_metadata_present",blockers:[],
    })),
  },
});
test("selected slide order and unchanged identity survive with generation denied",async()=>{
  const source=request();
  const before=JSON.stringify(source);
  const result=await preview(source);
  assert.equal(result.ok,true);
  assert.deepEqual(result.selected.map(x=>x.order),[2]);
  assert.deepEqual(result.unchanged.map(x=>x.order),[1,3]);
  assert.equal(result.selected[0].slide_id,ids[1]);
  assert.equal(result.profile_id,P);
  assert.equal(result.can_generate,false);
  assert.equal(result.publication_authorized,false);
  assert.equal(result.media_generation_authorized,false);
  assert.equal(result.creative_approved,false);
  assert.equal(result.factory_approved,false);
  assert.match(result.proposal_sha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(source),before);
  assert.equal(JSON.stringify(result).includes("drive_original_file"),false);
});
test("multi-selection is canonical and SHA binds exact choices and text",async()=>{
  const s=request();
  s.selected_slides=[
    {slide_id:ids[2],instruction:"Replace photo three with an approved sunrise photograph."},
    {slide_id:ids[0],instruction:"Replace photo one with an approved river scene."},
  ];
  const a=await preview(s);
  assert.deepEqual(a.selected.map(x=>x.order),[1,3]);
  assert.deepEqual(a.unchanged.map(x=>x.order),[2]);
  const b=await preview({...s,selected_slides:[...s.selected_slides].reverse()});
  assert.equal(a.proposal_sha256,b.proposal_sha256);
  s.selected_slides[0].instruction+=" Add another building.";
  const c=await preview(s);
  assert.notEqual(a.proposal_sha256,c.proposal_sha256);
});
test("foreign, duplicate and unselected slide IDs cannot be smuggled into correction",async()=>{
  const variants=[
    [ {slide_id:rec(999),instruction:"Change an unrelated photo at another profile."} ],
    [ {slide_id:ids[1],instruction:"Change this photograph in the output."},
      {slide_id:ids[1],instruction:"Change it again incorrectly."} ],
    [ {slide_id:ids[1],instruction:"short"} ],
    [ {slide_id:ids[1],instruction:"Valid photo change description.",drive_file_id:"forged"} ],
    [ {slide_id:ids[1],instruction:"Valid photo change description.",order:1} ],
  ];
  for(const selected_slides of variants){
    await assert.rejects(preview({...request(),selected_slides}));
  }
});
test("stale, forged, incomplete or publish-enabled inventory is rejected",async()=>{
  const mutations=[
    r=>r.inventory.output_id=rec(99),
    r=>r.inventory.profile_id="foreign",
    r=>r.inventory.can_generate=true,
    r=>r.inventory.publication_authorized=true,
    r=>r.inventory.review_hold_created=true,
    r=>r.inventory.source_kind="model_generated",
    r=>r.inventory.slides[2].order=2,
    r=>r.inventory.slides[2].slide_id=ids[1],
    r=>r.inventory.slides.pop(),
    r=>r.inventory.slides.push(null),
  ];
  for(const modify of mutations){
    const x=request();modify(x);
    await assert.rejects(preview(x));
  }
});
test("source blocker propagates without granting any generated or publishing authority",async()=>{
  const x=request();
  x.inventory.slides[1].blockers=["SLIDE_DRIVE_FILE_MISSING"];
  x.inventory.slides[1].status="source_blocked";
  x.inventory.blockers=["GALLERY_SOURCE_SLIDES_NOT_READY"];
  const got=await preview(x);
  assert.ok(got.blockers.includes("SLIDE_DRIVE_FILE_MISSING"));
  assert.ok(got.blockers.includes("GALLERY_SOURCE_SLIDES_NOT_READY"));
  assert.equal(got.can_generate,false);
});
test("empty source, invalid request identity and unbounded input fail closed",async()=>{
  const variants=[
    r=>r.client_request_id="x",
    r=>r.selected_slides=[],
    r=>r.selected_slides=[...r.selected_slides,...Array(81).fill(r.selected_slides[0])],
    r=>{r.inventory.slide_count=0;r.inventory.slides=[];},
    r=>r.output_id=rec(555),
  ];
  for(const modify of variants){
    const x=request();modify(x);
    await assert.rejects(preview(x));
  }
});
