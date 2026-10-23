import test from "node:test";
import assert from "node:assert/strict";
import { parseGroundedMediaDirective as parse, applyGroundedMediaEdits as apply } from "./factory-producer-media-edits.mjs";
const img = id => ({id,order:1,media_kind:"photo",google_drive_file_id:"drive-"+id,media_asset_record_id:"rec"+id});
const vid = { ...img("vid00001"), order:2,media_kind:"video",mime_type:"video/mp4",duration_seconds:9,in_seconds:0,out_seconds:9 };
const inventory=[img("photo001"),vid,{...img("photo002"),order:3}];

test("parses unambiguous natural language asset order and clip trims",()=>{
 assert.deepEqual(parse("Move existing asset photo002 to position 1."),{operation:"reorder",asset_id:"photo002",position:1});
 assert.deepEqual(parse("Trim clip vid00001 from 1.5 to 5 seconds"),{operation:"trim_clip",asset_id:"vid00001",in_seconds:1.5,out_seconds:5});
 assert.equal(parse("Add three more Chicago photos"),null);
});

test("reordering preserves Google Drive and Media Asset authority and identities",()=>{
 const result=apply(inventory,[parse("Move asset photo002 to position 1")]);
 assert.deepEqual(result.assets.map(a=>a.id),["photo002","photo001","vid00001"]);
 assert.equal(result.assets[0].google_drive_file_id,inventory[2].google_drive_file_id);
 assert.equal(result.assets[0].media_asset_record_id,inventory[2].media_asset_record_id);
 assert.deepEqual(inventory.map(a=>a.id),["photo001","vid00001","photo002"]);
});
test("clip trim uses pipeline-native in_seconds/out_seconds",()=>{
 const result=apply(inventory,[parse("Trim existing clip vid00001 from 2 to 6 seconds")]);
 assert.equal(result.assets[1].in_seconds,2);
 assert.equal(result.assets[1].out_seconds,6);
});
test("rejects unresolved assets, unknown authority, invalid bounds, and photo trims",()=>{
 assert.throws(()=>apply(inventory,[parse("Move asset unknown01 to position 1")]),/not attached/);
 assert.throws(()=>apply(inventory,[parse("Move asset photo001 to position 9")]),/out of range/);
 assert.throws(()=>apply(inventory,[parse("Trim clip vid00001 from 3 to 10 seconds")]),/outside/);
 assert.throws(()=>apply(inventory,[{operation:"trim_clip",asset_id:"photo001",in_seconds:1,out_seconds:3}]),/video clips/);
 assert.throws(()=>apply([{id:"bad00001",order:1}], [{operation:"reorder",asset_id:"bad00001",position:1}]),/authoritative/);
});
test("rejects duplicate conflicting asset operations",()=>{
 assert.throws(()=>apply(inventory,[parse("Move asset photo001 to position 3"),parse("Move asset photo001 to position 2")]),/Multiple edits/);
});

test("natural scene descriptions resolve only uniquely attached Drive originals", () => {
 const named = [
   {...img("asset0001"),name:"Chicago River Skyline Sunset.JPG",order:1},
   {...img("asset0002"),name:"Ohio Street Beach.png",order:2},
   {...vid,name:"Navy Pier Boat Approach.mp4",order:3},
 ];
 const directive = parse("Put the Chicago River Skyline Sunset photo first");
 assert.deepEqual(directive,{operation:"reorder",asset_name:"Chicago River Skyline Sunset",asset_kind:"photo",position:"first"});
 const reordered = apply(named,[parse("Move the Ohio Street Beach photo to position 1")]);
 assert.deepEqual(reordered.assets.map(x=>x.id),["asset0002","asset0001","vid00001"]);
 assert.deepEqual(reordered.changed_asset_ids,["asset0002"]);
 const trim = apply(named,[parse("Trim the Navy Pier Boat Approach clip from 1.25 to 5 seconds")]);
 assert.equal(trim.assets[2].out_seconds,5);
 assert.equal(trim.assets[2].in_seconds,1.25);
 assert.equal(trim.assets[2].google_drive_file_id,vid.google_drive_file_id);
});
test("no name-based silent substitution or global/cross-profile library search", () => {
 const named = [
   {...img("asset0001"),name:"Chicago River Skyline Sunset.jpg",order:1},
   {...img("asset0002"),name:"Chicago River Skyline Sunset.png",order:2},
   {...vid,name:"Navy Pier Boat Approach.mp4",order:3},
 ];
 assert.throws(()=>apply(named,[parse("Put the Chicago River Skyline Sunset photo first")]),/ambiguous/);
 assert.throws(()=>apply(named,[parse("Put the Navy Pier photo first")]),/not uniquely resolved/);
 assert.throws(()=>apply(named,[parse("Put the Skyline photo first")]),/not uniquely resolved/);
 assert.equal(parse("Add a new boat clip"),null);
});
