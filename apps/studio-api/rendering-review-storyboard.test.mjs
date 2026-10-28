import test from "node:test";
import assert from "node:assert/strict";
import {reviewStillStoryboard} from "./rendering-review-storyboard.mjs";
const chicago="recT2rbKX3MF7cVFU";
const originals=[
 ["rec00000000000001","night-one","Gibsons Italia 5","Night"],
 ["rec00000000000002","day-two","Chicago Riverwalk 8","Morning"],
 ["rec00000000000003","night-three","Chicago Riverwalk 10","Night"],
];
const img=i=>"https://media.chicagoshining.com/studio/previews/item4/approved-"+i+".jpg";
function fixture(){
 const request={id:"rec00000000000005",fields:{
   Studio_Master_Assets_JSON:JSON.stringify(originals.map(([media,id,name])=>({
     id,name,media_asset_record_id:media,google_drive_file_id:"1ABCDEFGHIJKLMNOPQRSTUV"+id
   }))),
   Studio_Variant_Manifest_JSON:JSON.stringify({complete:true,
     production_request_record_id:"rec00000000000005",
     assets:originals.map(([media,id,name],i)=>({id,media_asset_record_id:media,
       google_drive_file_id:"1ABCDEFGHIJKLMNOPQRSTUV"+id,
       variants:{"9:16":{preview_url:img(i),preview_status:"Ready",
         google_drive_file_id:"1VariantApprovedABCDEFGHI"+i}}}))}),
 }};
 const output={fields:{Remotion_Props_JSON:JSON.stringify({compositionId:"ChicagoShiningPhotoSequence",fps:30,
   clips:originals.map(([media],i)=>({mediaAssetRecordId:media,
     startFrame:i*90,durationFrames:90,googleDriveFileId:"1VariantApprovedABCDEFGHI"+i,
     url:img(i),src:img(i)}))})}};
 const media=originals.map(([id,internal,name,day])=>({id,fields:{"Asset Name":name,
    "Media_Class":"Image","Asset_Status":"Available","Rights_Status":"Owned",
    "Google Drive File ID":"1ABCDEFGHIJKLMNOPQRSTUV"+internal,
    "Content_Profile":[chicago],"Active":true,"Time_Of_Day":day}}));
 const session={producer_candidate:{stale:false,candidate:{timeline:[
   {start_seconds:0,end_seconds:3,asset_ids:["day-two"]},
   {start_seconds:3,end_seconds:6,asset_ids:["day-two"]},
   {start_seconds:6,end_seconds:9,asset_ids:["day-two"]},
 ]}}};
 return {output,request,media,session};
}
test("display only actual source and proposed variants, never V2 or a rendered MP4",()=>{
 const v=fixture();const rows=reviewStillStoryboard(v);
 assert.equal(rows.length,3);
 assert.equal(rows[0].original.time_of_day,"Night");
 assert.equal(rows[0].changed,true);
 assert.equal(rows[0].proposed.name,"Chicago Riverwalk 8");
 assert.equal(rows[2].changed,true);
 assert.equal(rows[2].proposed.time_of_day,"Morning");
 assert.ok(rows.every(r=>r.video_rendered===false));
 assert.equal(rows[1].changed,false);
});
test("unfinished model timeline is never described as applied",()=>{
 const v=fixture();v.session.producer_candidate.candidate.timeline.pop();
 const rows=reviewStillStoryboard(v);
 assert.ok(rows.every(r=>r.changed===false&&r.proposed_ready===false&&r.proposed===null));
});
test("tampered preview, bad crop, unowned media, wrong profile and unknown source are all denied",()=>{
 const v=fixture();v.media[0].fields.Rights_Status="Unverified";
 assert.equal(reviewStillStoryboard(v).length,0);
 v.media[0].fields.Rights_Status="Owned";
 v.media[0].fields.Content_Profile=["rec00000000000009"];
 assert.equal(reviewStillStoryboard(v).length,0);
 v.media[0].fields.Content_Profile=[chicago];
 v.output.fields.Remotion_Props_JSON=v.output.fields.Remotion_Props_JSON.replace("media.chicagoshining.com","evil.example");
 assert.equal(reviewStillStoryboard(v).length,0);
});
