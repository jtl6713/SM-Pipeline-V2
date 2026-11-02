/** Authenticated Airtable source-of-truth native-gallery job status.
 * NEVER use the Reel/Rendering Review Attempt table for native gallery jobs.
 * A stored state or Drive ID is never itself a verified revised image.
 */
import {NATIVE_GALLERY_JOBS_TABLE} from "./native-gallery-job-airtable.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const text=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?text(x.name):text(x);
const fail=(message,status=409)=>{
 throw Object.assign(new Error(message),{code:message,status});
};
export async function readGalleryRevisionStatus({
 output_id,job_id,authorized_profile_ids,readOutput,readContent,listRecords,
}={}){
 if(!REC.test(text(output_id))||!Array.isArray(authorized_profile_ids)||
    typeof readOutput!=="function"||typeof readContent!=="function"||
    typeof listRecords!=="function")fail("GALLERY_STATUS_SOURCE_UNAVAILABLE",503);
 if(job_id&&!TOKEN.test(job_id))fail("GALLERY_JOB_INVALID",400);
 const output=await readOutput(output_id);
 if(output?.id!==output_id||!output.fields)
   fail("GALLERY_OUTPUT_UNVERIFIED",503);
 const links=output.fields.Content_Item;
 if(!Array.isArray(links)||links.length!==1||!REC.test(links[0]))
   fail("GALLERY_CONTENT_LINK_INVALID");
 const content=await readContent(links[0]);
 const profiles=content?.fields?.Content_Profile;
 if(content?.id!==links[0]||!Array.isArray(profiles)||profiles.length!==1||
    !authorized_profile_ids.includes(profiles[0]))
   fail("GALLERY_PROFILE_FORBIDDEN",403);
 const f=output.fields;
 const activeHold=f.Studio_Render_Review_Hold_Active===true&&
   TOKEN.test(text(f.Studio_Render_Review_Hold_ID))&&
   TOKEN.test(text(f.Studio_Render_Review_Hold_Owner))&&
   f.Do_Not_Publish===true;
 const rows=await listRecords(NATIVE_GALLERY_JOBS_TABLE,{
   limit:31,filterFormula:'{Output_Record_ID}="'+output_id+'"',
   fields:["Job_ID","Output_Record_ID","Content_Item_Record_ID",
     "Profile_Record_ID","Actor_Record_ID","Job_State","Hold_ID",
     "Hold_Owner","Lease_Fence","Lease_Owner","Row_Version",
     "Completed_Slides","Total_Slides","Progress_Stage",
     "Revised_Manifest_SHA256","Creative_Decision",
     "Created_At_UTC","Updated_At_UTC"],
 });
 if(!Array.isArray(rows)||rows.length>=31)
   fail("GALLERY_JOB_LEDGER_READ_UNVERIFIED",503);
 const jobs=[],seen=new Set();
 for(const row of rows){
   const j=row?.fields||{},id=text(j.Job_ID);
   if(!REC.test(text(row?.id))||!TOKEN.test(id)||seen.has(id)||
      text(j.Output_Record_ID)!==output_id||
      text(j.Profile_Record_ID)!==profiles[0]||
      text(j.Content_Item_Record_ID)!==links[0]||
      !Number.isSafeInteger(j.Row_Version)||j.Row_Version<1)
     fail("GALLERY_JOB_IDENTITY_CONFLICT",503);
   seen.add(id);
   if(job_id&&id!==job_id)continue;
   const holdMatches=activeHold&&
     text(j.Hold_ID)===text(f.Studio_Render_Review_Hold_ID)&&
     text(j.Hold_Owner)===text(f.Studio_Render_Review_Hold_Owner);
   jobs.push({job_id:id,status:choice(j.Job_State)||"unknown",
     stage:text(j.Progress_Stage)||null,
     completed_slides:Number.isSafeInteger(j.Completed_Slides)?
       j.Completed_Slides:0,
     total_slides:Number.isSafeInteger(j.Total_Slides)?
       j.Total_Slides:0,
     lease_claimed:Boolean(text(j.Lease_Owner))&&
       Number.isSafeInteger(j.Lease_Fence)&&j.Lease_Fence>0,
     created_at:text(j.Created_At_UTC)||null,
     updated_at:text(j.Updated_At_UTC)||null,
     hold_active:holdMatches,
     revised_manifest_stored:!!text(j.Revised_Manifest_SHA256),
     creative_decision:choice(j.Creative_Decision)||null,
     revised_drive_readback_verified:false,
     can_accept:false,can_publish:false});
 }
 if(job_id&&!jobs.length)fail("GALLERY_JOB_NOT_FOUND",404);
 return {ok:true,output_id,profile_id:profiles[0],
   content_item_id:links[0],hold_active:activeHold,
   jobs,can_generate:false,can_publish:false,
   source:"airtable_native_gallery_job_ledger"};
}
