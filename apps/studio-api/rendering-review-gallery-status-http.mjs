/** Authenticated, Airtable-authoritative native gallery job history.
 * Read the dedicated non-Vibe table, NOT the Chicago Reel review attempts.
 * Neither queued state nor an Airtable manifest hash proves Drive bytes.
 */
import {NATIVE_GALLERY_JOBS_TABLE} from "./native-gallery-job-airtable.mjs";
import {RENDER_REVIEW_OUTPUT_FIELDS} from "./rendering-review-airtable.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[a-f0-9]{64}$/;
const deny=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const str=v=>String(v??"").trim();
const state=v=>typeof v==="object"&&v!==null?str(v.name):str(v);
export async function readGalleryRevisionStatus({
 output_id,attempt_id,authorized_profile_ids,readOutput,readContent,listRecords
}={}){
 if(!REC.test(str(output_id))||!Array.isArray(authorized_profile_ids)||
    typeof readOutput!=="function"||typeof readContent!=="function"||
    typeof listRecords!=="function")
   deny("GALLERY_STATUS_SOURCE_UNAVAILABLE",503);
 if(attempt_id&&!TOKEN.test(attempt_id))deny("GALLERY_ATTEMPT_INVALID",400);
 const output=await readOutput(output_id);
 if(output?.id!==output_id||!output.fields)
   deny("GALLERY_OUTPUT_UNVERIFIED",503);
 const links=output.fields.Content_Item;
 if(!Array.isArray(links)||links.length!==1||!REC.test(links[0]))
   deny("GALLERY_CONTENT_LINK_INVALID");
 const content=await readContent(links[0]);
 const profiles=content?.fields?.Content_Profile;
 if(content?.id!==links[0]||!Array.isArray(profiles)||
    profiles.length!==1||!authorized_profile_ids.includes(profiles[0]))
   deny("GALLERY_PROFILE_FORBIDDEN",403);
 const held=output.fields[RENDER_REVIEW_OUTPUT_FIELDS.hold_active]===true&&
   Boolean(str(output.fields[RENDER_REVIEW_OUTPUT_FIELDS.hold_id]))&&
   Boolean(str(output.fields[RENDER_REVIEW_OUTPUT_FIELDS.hold_owner]))&&
   output.fields.Do_Not_Publish===true;
 const rows=await listRecords(NATIVE_GALLERY_JOBS_TABLE,{
   limit:31,filterFormula:'{Output_Record_ID}="'+output_id+'"',
   fields:["Job_ID","Output_Record_ID","Profile_Record_ID",
     "Content_Item_Record_ID","Job_State","Row_Version",
     "Progress_Stage","Completed_Slides","Total_Slides",
     "Revised_Manifest_SHA256","Creative_Decision",
     "Created_At_UTC","Updated_At_UTC"],
 });
 if(!Array.isArray(rows)||rows.length>=31)
   deny("GALLERY_JOB_HISTORY_UNVERIFIED",503);
 const seen=new Set(),attempts=[];
 for(const row of rows){
   const f=row?.fields||{};
   const jobId=str(f.Job_ID);
   if(!REC.test(str(row?.id))||!TOKEN.test(jobId)||seen.has(jobId)||
      str(f.Output_Record_ID)!==output_id||
      str(f.Profile_Record_ID)!==profiles[0]||
      str(f.Content_Item_Record_ID)!==links[0]||
      !Number.isSafeInteger(f.Row_Version)||f.Row_Version<1||
      !Number.isSafeInteger(f.Total_Slides)||f.Total_Slides<1||
      f.Total_Slides>80||
      !Number.isSafeInteger(f.Completed_Slides)||f.Completed_Slides<0||
      f.Completed_Slides>f.Total_Slides||
      (str(f.Revised_Manifest_SHA256)&&
        !SHA.test(str(f.Revised_Manifest_SHA256))))
     deny("GALLERY_JOB_HISTORY_IDENTITY_CONFLICT",503);
   seen.add(jobId);
   if(attempt_id&&attempt_id!==jobId)continue;
   attempts.push({
     attempt_id:jobId,job_id:jobId,
     status:state(f.Job_State)||"unknown",
     stage:str(f.Progress_Stage)||null,
     completed_slides:f.Completed_Slides,total_slides:f.Total_Slides,
     created_at:str(f.Created_At_UTC)||null,
     updated_at:str(f.Updated_At_UTC)||null,
     hold_active:held,source_bytes_verified:false,
     revised_drive_readback_verified:false,
     can_accept:false,can_publish:false,
   });
 }
 return {ok:true,output_id,profile_id:profiles[0],
   content_item_id:links[0],hold_active:held,attempts,
   can_generate:false,can_publish:false,
   source:"airtable_authoritative_native_gallery_jobs"};
}
