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
