import test from "node:test";
import assert from "node:assert/strict";
import {appendVerifiedLibraryAssets as append} from "./factory-producer-library-append.mjs";
const profile="recProfile000001";
const base=[{id:"old00001",order:1,media_asset_record_id:"recOldMedia00001",google_drive_file_id:"oldDrive"}];
const still={media_asset_record_id:"recNewImage00001",google_drive_file_id:"imageDrive",profile_id:profile,name:"Chicago River Still",mime_type:"image/jpeg",media_kind:"photo"};
const movie={media_asset_record_id:"recNewVideo00001",google_drive_file_id:"videoDrive",profile_id:profile,name:"Boat clip",mime_type:"video/mp4",media_kind:"video",duration_seconds:12};
test("appends exact classified Drive masters without changing existing identifiers",()=>{
 let i=0; const r=append(base,[still,movie],profile,()=>["newasset01","newasset02"][i++]);
 assert.deepEqual(r.assets.map(x=>x.id),["old00001","newasset01","newasset02"]);
 assert.deepEqual(r.assets.map(x=>x.order),[1,2,3]);
 assert.equal(r.assets[2].out_seconds,12);
 assert.equal(r.assets[2].media_asset_record_id,movie.media_asset_record_id);
 assert.equal(base.length,1);
});
test("rejects cross-profile, missing Drive, unresolved duration, and duplicates",()=>{
 let seq=0;const make=()=>`newasset0${++seq}`;
 for(const bad of [{...still,profile_id:"recOtherProfile"},{...still,google_drive_file_id:""},{...movie,duration_seconds:null}])
   assert.throws(()=>append(base,[bad],profile,make),/profile|Drive|duration/);
 assert.throws(()=>append(base,[still,still],profile,make),/Duplicate/);
 assert.throws(()=>append(base,[{...still,media_asset_record_id:base[0].media_asset_record_id}],profile,make),/Duplicate/);
});
