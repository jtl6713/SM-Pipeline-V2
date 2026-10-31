import test from "node:test";
import assert from "node:assert/strict";
import {correctionRenderCapability as check} from "./factory-correction-render-capability.mjs";
const fmt={key:"video|vertical short video|9:16",aspect_ratio:"9:16"};
const valid=()=>JSON.stringify({compositionId:"ChicagoShiningPhotoSequence",width:1080,
  height:1920,fps:30,clips:[{src:"https://example.test/asset.jpg"}]});
test("all authorized platforms can use the same certified 9:16 original composition",()=>{
  assert.equal(check(fmt,valid()).supported,true);
  assert.equal(check(fmt,valid()).contract,"photo-sequence-9x16-mp4-v1");
});
test("image, carousel, alternate Vibe Cut and nonvertical renders must not be held for MP4 review",()=>{
  assert.equal(check({...fmt,aspect_ratio:"4:5"},valid()).supported,false);
  assert.equal(check(fmt,JSON.stringify({compositionId:"ImageCarousel",clips:[{}]})).supported,false);
  assert.equal(check(fmt,JSON.stringify({compositionId:"VibeCut",clips:[{}]})).supported,false);
  assert.equal(check(fmt,JSON.stringify({compositionId:"ChicagoShiningPhotoSequence",width:1280,height:720,clips:[{}]})).supported,false);
  assert.equal(check(fmt,"{ malformed ").supported,false);
  assert.equal(check(fmt,"").supported,false);
  assert.equal(check(fmt,JSON.stringify({compositionId:"ChicagoShiningPhotoSequence",clips:[]})).supported,false);
});

test("native image and carousel formats use a separate gallery contract, never MP4",()=>{
 for(const format of ["Carousel","Photo Set","Single Image","Static Image"]){
  const result=check({...fmt,format},"");
  assert.equal(result.supported,false);
  assert.equal(result.media_kind,"image-set");
  assert.equal(result.reason,"IMAGE_GALLERY_RENDERER_NOT_VERIFIED");
  assert.equal(result.required_contract,"studio.render-review.gallery.1");
 }
});
test("alternate Vibe Cut compositions report missing music-only renderer instead of accepting MP4 sequence",()=>{
 const result=check(fmt,JSON.stringify({
  compositionId:"VibeCutTimeline",width:1080,height:1920,clips:[{}]}));
 assert.equal(result.supported,false);
 assert.equal(result.reason,"VIBE_CUT_RENDERER_NOT_VERIFIED");
});
