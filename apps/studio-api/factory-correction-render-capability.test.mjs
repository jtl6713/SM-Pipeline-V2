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
