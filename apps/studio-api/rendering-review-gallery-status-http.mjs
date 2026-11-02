/** Authenticated Airtable-authoritative non-Vibe gallery revision status.
 * Never infer completion from a queued job or metadata-only slide inventory.
 * All selected artifacts must later pass independent Drive verification.
 */
import {RENDER_REVIEW_TABLES,RENDER_REVIEW_OUTPUT_FIELDS} from "./rendering-review-airtable.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const txt=v=>String(v??"").trim();
export async function readGalleryRevisionStatus({
 output_id,attempt_id,authorized_profile_ids,readOutput,readContent,listRecords,
}={}){
 if(!REC.test(txt(output_id))||!Array.isArray(authorized_profile_ids)||
    typeof readOutput!=="function"||typeof readContent!=="function"||
    typeof listRecords!=="function")fail("GALLERY_STATUS_SOURCE_UNAVAILABLE",503);
 if(attempt_id&&!token.test(attempt_id))fail("GALLERY_ATTEMPT_INVALID",400);
 const output=await readOutput(output_id);
 if(output?.id!==output_id||!output.fields)fail("GALLERY_OUTPUT_UNVERIFIED",503);
 const links=output.fields.Content_Item;
 if(!Array.isArray(links)||links.length!==1||!REC.test(links[0]))
   fail("GALLERY_CONTENT_LINK_INVALID");
 const content=await readContent(links[0]);
 const profiles=content?.fields?.Content_Profile;
 if(content?.id!==links[0]||!Array.isArray(profiles)||profiles.length!==1||
    !authorized_profile_ids.includes(profiles[0]))fail("GALLERY_PROFILE_FORBIDDEN",403);
 const held=output.fields[RENDER_REVIEW_OUTPUT_FIELDS.hold_active]===true &&
    txt(output.fields[RENDER_REVIEW_OUTPUT_FIELDS.hold_id])!=="" &&
    txt(output.fields[RENDER_REVIEW_OUTPUT_FIELDS.hold_owner])!=="";
 const rows=await listRecords(RENDER_REVIEW_TABLES.attempts,{
   limit:50,filterFormula:'{Output_Record_ID}="'+output_id+'"',
   fields:["Attempt_ID","Session_ID","Output_Record_ID","Attempt_Status",
     "Artifact_File_ID","Validation_Evidence_JSON","Created_At","Updated_At"],
 });
 if(!Array.isArray(rows)||rows.length>50)fail("GALLERY_ATTEMPT_READ_UNVERIFIED",503);
 const attempts=[];
 const seen=new Set();
 for(const row of rows){
   const f=row?.fields||{};
   const id=txt(f.Attempt_ID);
   if(!token.test(id)||seen.has(id)||txt(f.Output_Record_ID)!==output_id)
     fail("GALLERY_ATTEMPT_IDENTITY_CONFLICT",503);
   seen.add(id);
   if(attempt_id&&id!==attempt_id)continue;
   // Neither a saved file ID nor a status field alone proves actual bytes.
   attempts.push({attempt_id:id,status:txt(f.Attempt_Status)||"unknown",
     created_at:txt(f.Created_At)||null,updated_at:txt(f.Updated_At)||null,
     hold_active:held,source_bytes_verified:false,
     revised_drive_readback_verified:false,
     can_accept:false,can_publish:false});
 }
 return {ok:true,output_id,profile_id:profiles[0],
   content_item_id:links[0],hold_active:held,attempts,
   can_generate:false,can_publish:false,source:"airtable_authoritative_metadata"};
}
