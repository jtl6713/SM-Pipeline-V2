import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogToken,catalogRecordId,resolveReviewCatalogAssets
} from "./rendering-review-catalog-assets.mjs";

const C="recT2rbKX3MF7cVFU";
const id="rec12345678901234",variantId="rec99999999999999";
const queueId="rec77777777777777",requestId="rec88888888888888";
const source="1abcdefghijklmnopqRSTUVWxy1234Z";
const crop="1_abcdefghijklmnopqrstuvwxyz123";
const sourceAsset="800c0da312e24b19aa";
const url="https://media.chicagoshining.com/studio/previews/item4/"+
  requestId+"/ITEM4-VARIANT-fill-crop-v2-"+requestId+"-"+sourceAsset+"-9x16-"+crop+".jpg";
const F={
  [id]:{"Media_Class":"Image","Asset_Status":"Available","Rights_Status":"Owned",
    "Content_Profile":[C],"Active":true,"Do_Not_Use":false,
    "Google Drive File ID":source,"File_Size_Bytes":86462},
  [variantId]:{"Media_Class":"Image","Asset_Status":"Available","Rights_Status":"Owned",
    "Content_Profile":[C],"Active":true,"Do_Not_Use":false,
    "Google Drive File ID":crop,"MIME_Type":"image/jpeg"},
};
const q={
  "Asset_Kind":"Platform Variant","Aspect_Ratio":"9:16","Variant_Style":"center",
  "Transfer_Status":"Ready","Preview_Status":"Ready",
  "Source_Media_Asset":[id],"Source_Drive_File_ID":source,
  "Source_Size_Bytes":86462,"Source_Asset_ID":sourceAsset,
  "Generated_Media_Asset":[variantId],"Drive_File_ID":crop,
  "Production_Request_Record_ID":requestId,
  "Target_File_Name":"Adler-Planetarium-12__9x16__fill-crop-v2.jpg",
  "Preview_URL":url,"Completed_At":"2026-10-12T19:00:00.000Z",
};
function run(masterPatch={},queuePatch={},derivedPatch={},opts={}){
  const rows={
    [id]:{id,fields:{...F[id],...masterPatch}},
    [variantId]:{id:variantId,fields:{...F[variantId],...derivedPatch}},
  };
  const queue={id:queueId,fields:{...q,...queuePatch}};
  const mediaIds=[];
  return resolveReviewCatalogAssets({
    tokens:[catalogToken(id)],
    mediaTable:"tblSITCujCsJTNcDe",
    readRecord:async(_table,which)=>{mediaIds.push(which);return rows[which]||null;},
    readField:(row,k)=>row.fields[k],
    readVariants:async(ids)=>{
      assert.equal(ids.length,1);
      assert.equal(typeof ids[0],"string");
      return opts.queueRows===undefined?[queue]:opts.queueRows;
    },
  }).then(receipt=>({...receipt,mediaIds}));
}
test("Asset Manager source may bind exact completed 9:16 crop, no V2 writes",async()=>{
  assert.equal(catalogToken(id),"library_"+id);
  assert.equal(catalogRecordId("library_"+id),id);
  const result=await run();
  assert.deepEqual(result.unresolved,[]);
  assert.deepEqual(result.mediaIds,[id,variantId]);
  assert.equal(result.receipts.length,1);
  const proof=result.receipts[0];
  assert.equal(proof.origin,"review_library");
  assert.equal(proof.source_media_record_id,id);
  assert.equal(proof.variant_transfer_record_id,queueId);
  assert.equal(proof.variant_media_record_id,variantId);
  assert.equal(proof.source_request_id,requestId);
  assert.equal(proof.render_variant_drive_file_id,crop);
  assert.equal(proof.render_url,url);
  assert.equal(proof.profile_id,C);
});
test("wrong profile, rights, or ineligible Graphic is blocked not auto-corrected",async()=>{
  for(const change of [{"Media_Class":"Graphic"},{"Rights_Status":"Unknown"},
    {"Content_Profile":["rec44444444444444"]},{"Do_Not_Use":true},
    {"Google Drive File ID":"anotherfileabcdefghijklmn"}]){
    const result=await run(change);
    assert.equal(result.receipts.length,0);
    assert.deepEqual(result.unresolved,[id]);
  }
});
test("crop linkage must match source record, Drive file, queue state and preview",async()=>{
  for(const changed of [{"Source_Media_Asset":["rec44444444444444"]},
    {"Source_Drive_File_ID":"1_OTHER_DRIVE_FILE_ID_____"},
    {"Aspect_Ratio":"4:5"},{"Transfer_Status":"Pending"},
    {"Preview_Status":"Failed"},{"Variant_Style":"top"},
    {"Preview_URL":url+"?other=1"},{"Generated_Media_Asset":["rec44444444444444"]},
    {"Source_Size_Bytes":400},{"Source_Asset_ID":"otherid_12345"}]){
    const result=await run({},changed);
    assert.equal(result.receipts.length,0);
    assert.deepEqual(result.unresolved,[id]);
  }
});
test("derived image eligibility is separately verified",async()=>{
  for(const changed of [{"Media_Class":"Graphic"},{"Rights_Status":"Unknown"},
    {"Google Drive File ID":"stale_crop_file1234567890"},
    {"MIME_Type":"video/mp4"}]){
    const result=await run({},{},changed);
    assert.equal(result.receipts.length,0);
    assert.deepEqual(result.unresolved,[id]);
  }
});
test("unknown catalog token does not fetch unrelated assets",async()=>{
  const result=await resolveReviewCatalogAssets({
    tokens:["library_injected","asset-1"],mediaTable:"tblSITCujCsJTNcDe",
    readRecord:async()=>{throw Error("should not read");},
    readField:()=>null,
    readVariants:async()=>{throw Error("should not query");}
  });
  assert.deepEqual(result,{receipts:[],unresolved:[]});
});
