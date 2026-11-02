/**
 * Promote an existing Asset Manager master and independently completed 9:16
 * transfer-queue crop into a *review-only* rights/renderer receipt.
 * No write, upload, state transition or output mutation is performed here.
 * Only a trusted Worker adapter supplies Airtable source + transfer rows.
 */
import {CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";

const rec=v=>/^rec[A-Za-z0-9]{14}$/.test(String(v??""));
const drive=v=>/^[A-Za-z0-9_-]{16,}$/.test(String(v??""));
const str=v=>String(v??"").trim();
const one=v=>Array.isArray(v)&&v.length===1?
  (typeof v[0]==="string"?v[0]:v[0]?.id):null;
const select=v=>typeof v==="string"?v:str(v?.name);
export const catalogToken=recordId=>rec(recordId)?"library_"+recordId:null;
export const catalogRecordId=token=>/^library_rec[A-Za-z0-9]{14}$/.test(str(token))?
  token.slice("library_".length):null;

function authority(row,readField,expectedId,expectedDrive=null) {
  if(row?.id!==expectedId||!row?.fields)return false;
  const f=k=>readField(row,k);
  const file=str(f("Google Drive File ID"));
  return select(f("Media_Class"))==="Image"&&select(f("Asset_Status"))==="Available"&&
    select(f("Rights_Status"))==="Owned"&&f("Active")===true&&
    f("Do_Not_Use")!==true&&
    one(f("Content_Profile"))===CHICAGO_PROFILE_ID&&drive(file)&&
    (expectedDrive===null||file===expectedDrive);
}
function variantProof(queue,readField,recordId,sourceFile,sourceSize) {
  const f=k=>readField(queue,k);
  if(!rec(queue?.id)||one(f("Source_Media_Asset"))!==recordId||
     str(f("Source_Drive_File_ID"))!==sourceFile||
     select(f("Asset_Kind"))!=="Platform Variant"||
     select(f("Aspect_Ratio"))!=="9:16"||
     select(f("Variant_Style"))!=="center"||
     select(f("Transfer_Status"))!=="Ready"||
     select(f("Preview_Status"))!=="Ready"||
     (sourceSize>0&&Number(f("Source_Size_Bytes"))!==sourceSize))
    return null;
  const generated=one(f("Generated_Media_Asset"));
  const variantFile=str(f("Drive_File_ID"));
  const preview=str(f("Preview_URL"));
  const recipe=str(f("Target_File_Name"));
  const srcAsset=str(f("Source_Asset_ID"));
  const request=str(f("Production_Request_Record_ID"));
  if(!rec(generated)||!rec(request)||!drive(variantFile)||
     !/fill-crop-v2\.jpg$/i.test(recipe)||!recipe.includes("9x16")||
     !/^[A-Za-z0-9_-]{8,120}$/.test(srcAsset)||
     !preview.startsWith("https://media.chicagoshining.com/studio/previews/item4/"+
                          request+"/ITEM4-VARIANT-fill-crop-v2-")||
     !preview.includes("-"+srcAsset+"-9x16-"+variantFile+".jpg"))
    return null;
  return {queue_id:queue.id,variant_file_id:variantFile,preview_url:preview,
    generated_media_id:generated,source_asset_id:srcAsset,
    source_request_id:request,completed_at:str(f("Completed_At"))};
}

/**
 * Returns only independently verified crop receipts. A null/partial result is
 * a blocker, not permission to use an unprepared master or create a render.
 */
export async function resolveReviewCatalogAssets({tokens,readRecord,readField,
  readVariants,mediaTable}={}) {
  if(!Array.isArray(tokens)||tokens.length>80||typeof readRecord!=="function"||
     typeof readField!=="function"||typeof readVariants!=="function"||
     !str(mediaTable))throw new Error("REVIEW_CATALOG_ADAPTER_REQUIRED");
  const ids=[...new Set(tokens.map(catalogRecordId).filter(Boolean))];
  if(ids.length>16)throw new Error("REVIEW_CATALOG_LIMIT");
  const masters=new Map(),missing=[];
  for(const id of ids){
    const row=await readRecord(mediaTable,id);
    if(!authority(row,readField,id)){missing.push(id);continue;}
    const fileId=str(readField(row,"Google Drive File ID"));
    const sourceBytes=Number(readField(row,"File_Size_Bytes")||0);
    if(!Number.isSafeInteger(sourceBytes)||sourceBytes<1024){
      missing.push(id);continue;
    }
    masters.set(id,{row,fileId,sourceBytes});
  }
  const result=[];
  if(!masters.size)return {receipts:result,unresolved:missing};
  // The Worker uses source Drive IDs to retrieve a bounded set of immutable
  // transfer-queue records. Never construct Airtable formula from text labels.
  const transferRows=await readVariants([...masters.values()].map(x=>x.fileId));
  if(!Array.isArray(transferRows)||transferRows.length>400)
    throw new Error("REVIEW_CATALOG_VARIANT_READ_INVALID");
  for(const [id,master] of masters){
    const options=transferRows.map(row=>variantProof(row,readField,id,
      master.fileId,master.sourceBytes)).filter(Boolean);
    const verified=[];
    for(const option of options){
      const rendered=await readRecord(mediaTable,option.generated_media_id);
      if(!authority(rendered,readField,option.generated_media_id,
        option.variant_file_id)||
        select(readField(rendered,"MIME_Type"))!=="image/jpeg")continue;
      verified.push(option);
    }
    // Same source, dimensions, recipe and exact profile are required for any
    // possible choice. Choose deterministic latest *completed* matching crop;
    // never use an arbitrary title/filename match as a provenance receipt.
    verified.sort((a,b)=>b.completed_at.localeCompare(a.completed_at)||
      a.queue_id.localeCompare(b.queue_id));
    const selected=verified[0];
    if(!selected){missing.push(id);continue;}
    result.push({
      id:catalogToken(id),verified:true,rights_clear:true,authority:"server",
      rights_receipt_id:"rrcatalogrights_"+id,
      profile_id:CHICAGO_PROFILE_ID,
      canonical_media_authority:"google_drive",media_type:"image",
      drive_file_id:master.fileId,
      render_variant_drive_file_id:selected.variant_file_id,
      render_url:selected.preview_url,
      origin:"review_library",
      source_media_record_id:id,
      variant_transfer_record_id:selected.queue_id,
      variant_media_record_id:selected.generated_media_id,
      source_size_bytes:master.sourceBytes,
      crop_recipe:"fill-crop-v2",
    });
  }
  return {receipts:result,unresolved:missing};
}
