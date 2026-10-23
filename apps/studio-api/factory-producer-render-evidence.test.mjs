import test from "node:test";
import assert from "node:assert/strict";
import { verifyFactoryRenderedMedia as verify } from "./factory-producer-render-evidence.mjs";
const assets = [
  {id:"p1",order:1,media_asset_record_id:"recPhoto1"},
  {id:"v2",order:2,media_asset_record_id:"recVideo2",in_seconds:2,out_seconds:7},
  {id:"p3",order:3,media_asset_record_id:"recPhoto3"},
];
const clip = (source, more = {}) => ({
  source_asset_id:source.id,media_asset_record_id:source.media_asset_record_id,...more,
});
const output=(clips,request="recReq123")=>({
  id:"recOut123",selected_assets_json:JSON.stringify({production_request_record_id:request,selected_clips:clips}),
});
const args = {expectedAssets:assets,requestId:"recReq123",changes:["reorder_media","trim_clip"],changedAssetIds:["v2"]};
test("accepts independently persisted full render evidence with correct scene order and clip trim",()=>{
 assert.deepEqual(verify({...args,outputs:[output([clip(assets[0]),clip(assets[1],{sourceInSeconds:2,sourceOutSeconds:7}),clip(assets[2])])]}),[]);
});
test("rejects stale old order, unauthorized assets, wrong request, missing proof",()=>{
 assert.match(verify({...args,outputs:[output([clip(assets[2]),clip(assets[1],{sourceInSeconds:2,sourceOutSeconds:7}),clip(assets[0])])]}).join(" "),/order|sequence/);
 assert.match(verify({...args,outputs:[output([clip({...assets[0],id:"foreign"}),clip(assets[1]),clip(assets[2])])]}).join(" "),/unrequested/);
 assert.match(verify({...args,outputs:[output([clip(assets[0])],"recDifferent")]}).join(" "),/different Production Request/);
 assert.match(verify({...args,outputs:[{id:"recOut123",selected_assets_json:"invalid"}]}).join(" "),/no authoritative/);
});
test("rejects renderer that ignored clip trims",()=>{
 const failures=verify({...args,outputs:[output([clip(assets[0]),clip(assets[1],{sourceInSeconds:0,sourceOutSeconds:12}),clip(assets[2])])]});
 assert.match(failures.join(" "),/clip trim/);
});
test("accepts a shorter Story sequence only alongside an authoritative complete render",()=>{
 const outputs=[
  output([clip(assets[0]),clip(assets[1],{sourceInSeconds:2,sourceOutSeconds:7}),clip(assets[2])]),
  {...output([clip(assets[0]),clip(assets[2])]),id:"recStory"},
 ];
 assert.deepEqual(verify({...args,outputs}),[]);
});
test("refuses to release if only a short teaser exists",()=>{
 assert.match(verify({...args,outputs:[output([clip(assets[0]),clip(assets[2])])]}).join(" "),/No completed output/);
});
