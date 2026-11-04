/** Stage 1 non-Vibe native gallery: PRIVATE Factory review preflight.
 *
 * This is a zero-write inspection of a creatively accepted, held V2 image
 * manifest. It re-verifies the immutable selected-only revision through the
 * Runner's independently checked Drive/Media Asset rights endpoint. It does
 * not perform a Factory handoff, release a hold, publish, schedule, or expose
 * private Drive identifiers. Real Factory mutation remains a separate gate.
 */
import {nativeGalleryHasScheduledOccupancy} from "./native-gallery-publisher-gate.mjs";

const REC=/^rec[A-Za-z0-9]{14}$/,ID=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[a-f0-9]{64}$/;
const choice=x=>typeof x==="object"&&x!==null?String(x.name||""):String(x||"");
const text=x=>String(x??"").trim();
const deny=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest(
  "SHA-256",new TextEncoder().encode(s))),
  b=>b.toString(16).padStart(2,"0")).join("");

export function nativeGalleryFactoryPreflightEnabled(env){
 return env?.NATIVE_GALLERY_FACTORY_PREFLIGHT_ENABLED==="true"&&
   env?.NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED==="true"&&
   env?.NATIVE_GALLERY_REVISED_VERIFY_ENABLED==="true";
}
function held(output,job,outputId){
 const f=output?.fields||{},j=job?.fields||{};
 return output?.id===outputId&&j.Output_Record_ID===outputId&&
   f.Do_Not_Publish===true&&f.Studio_Render_Review_Hold_Active===true&&
   ID.test(text(j.Hold_ID))&&ID.test(text(j.Hold_Owner))&&
   f.Studio_Render_Review_Hold_ID===j.Hold_ID&&
   f.Studio_Render_Review_Hold_Owner===j.Hold_Owner&&
   f.Studio_Render_Review_Session_ID===j.Hold_Owner&&
   Array.isArray(f.Content_Item)&&f.Content_Item.length===1&&
   f.Content_Item[0]===j.Content_Item_Record_ID&&
   /(?:image|photo|carousel|gallery|picture)/i.test(choice(f.Platform_Output_Type))&&
   !f.Auto_Publish_Enabled&&!f.Publish_Asset_URL&&
   !f.Published_At&&!f.Platform_Post_ID&&!f.Platform_Post_URL&&
   !f.Platform_Media_ID&&!f.Publish_Started_At&&!f.Publish_Locked_At&&
   !f.Publish_Locked_By&&
   !/^(?:published|publishing|dispatched)$/i.test(choice(f.Publish_Status))&&
   !nativeGalleryHasScheduledOccupancy(f);
}
function accepted(job,outputId,jobId){
 const j=job?.fields||{};
 return REC.test(text(job?.id))&&j.Job_ID===jobId&&
   j.Output_Record_ID===outputId&&
   REC.test(text(j.Profile_Record_ID))&&
   REC.test(text(j.Content_Item_Record_ID))&&
   REC.test(text(j.Creative_Decision_Actor))&&
   choice(j.Job_State)==="creative_accepted"&&
   choice(j.Creative_Decision)==="accepted"&&j.Row_Version===5&&
   SHA.test(text(j.Plan_SHA256))&&
   SHA.test(text(j.Original_Manifest_SHA256))&&
   SHA.test(text(j.Revised_Manifest_SHA256));
}

export async function inspectNativeGalleryFactoryPreflight({
 request,env,authorization,output_id,job_id,operations:ops,
}={}){
 if(!nativeGalleryFactoryPreflightEnabled(env))
   deny("GALLERY_FACTORY_PREFLIGHT_DISABLED",405);
 if(request?.method!=="GET")deny("METHOD_NOT_ALLOWED",405);
 if(!authorization?.authenticated||!authorization?.authorized||
    authorization.permissions?.outputs_review!==true||
    !Array.isArray(authorization.authorized_profile_ids))
   deny("GALLERY_FACTORY_REVIEW_PERMISSION_DENIED",403);
 if(!REC.test(text(output_id))||!ID.test(text(job_id)))
   deny("GALLERY_FACTORY_REVIEW_ID_INVALID",400);
 for(const method of ["readOutput","readContent","readJob","verifyDrive"]){
   if(typeof ops?.[method]!=="function")
     deny("GALLERY_FACTORY_REVIEW_ADAPTER_MISSING",503);
 }
 const [output,job]=await Promise.all([ops.readOutput(output_id),ops.readJob(job_id)]);
 if(!accepted(job,output_id,job_id)||!held(output,job,output_id))
   deny("GALLERY_FACTORY_SOURCE_NOT_HELD_OR_ACCEPTED");
 const j=job.fields;
 if(!authorization.authorized_profile_ids.includes(j.Profile_Record_ID))
   deny("GALLERY_FACTORY_FOREIGN_PROFILE",403);
 const content=await ops.readContent(j.Content_Item_Record_ID);
 if(content?.id!==j.Content_Item_Record_ID||
    !Array.isArray(content.fields?.Content_Profile)||
    content.fields.Content_Profile.length!==1||
    content.fields.Content_Profile[0]!==j.Profile_Record_ID)
   deny("GALLERY_FACTORY_PROFILE_CHANGED",403);
 let original,revised,plan;
 try{
   original=JSON.parse(j.Original_Manifest_JSON);
   revised=JSON.parse(j.Revised_Manifest_JSON);
   plan=JSON.parse(j.Plan_JSON);
 }catch{deny("GALLERY_FACTORY_MANIFEST_UNREADABLE",503);}
 if(!Array.isArray(original)||!Array.isArray(revised)||
    original.length<1||original.length>20||
    revised.length!==original.length||
    !plan||typeof plan!=="object"||Array.isArray(plan)||
    plan.output_id!==output_id||plan.profile_id!==j.Profile_Record_ID||
    plan.content_item_id!==j.Content_Item_Record_ID||
    plan.original_manifest_sha256!==j.Original_Manifest_SHA256||
    plan.allow_public_publish!==false||plan.auto_approve!==false||
    plan.mutate_original_production_request!==false||
    plan.mutate_sibling_outputs!==false||
    !Array.isArray(plan.selected)||!plan.selected.length||
    plan.selected.length>original.length||
    await sha(JSON.stringify(plan))!==j.Plan_SHA256||
    await sha(JSON.stringify(revised))!==j.Revised_Manifest_SHA256)
   deny("GALLERY_FACTORY_MANIFEST_NOT_IMMUTABLE",503);
 const selected=new Set(plan.selected.map(x=>x?.slide_id));
 if(selected.size!==plan.selected.length||
    plan.selected.some(x=>!REC.test(text(x?.slide_id))||
      !Number.isSafeInteger(x?.order)||x.order<1||
      typeof x.instruction!=="string"||x.instruction.trim().length<8))
   deny("GALLERY_FACTORY_SELECTION_INVALID",503);
 const seen=new Set(),staged=new Set();let changed=0;
 for(let i=0;i<original.length;i++){
   const prev=original[i],next=revised[i];
   if(!prev||!next||!REC.test(text(prev.slot_id))||seen.has(prev.slot_id)||
      next.slot_id!==prev.slot_id||prev.order!==i+1||next.order!==i+1||
      [prev,next].some(x=>x.output_id!==output_id||
        x.content_item_id!==j.Content_Item_Record_ID||
        x.profile_id!==j.Profile_Record_ID||
        !SHA.test(text(x.sha256))||
        !ID.test(text(x.drive_file_id))||
        x.rights_verified!==true||x.watermark_verified!==true))
     deny("GALLERY_FACTORY_SLIDE_IDENTITY_CHANGED",503);
   seen.add(prev.slot_id);
   if(selected.has(prev.slot_id)){
     if(!REC.test(text(next.revision_media_asset_id))||
        prev.drive_file_id===next.drive_file_id||
        prev.sha256===next.sha256||staged.has(next.drive_file_id))
       deny("GALLERY_FACTORY_SELECTED_REVISION_INVALID",503);
     staged.add(next.drive_file_id);changed++;
   }else if(JSON.stringify(prev)!==JSON.stringify(next)){
     deny("GALLERY_FACTORY_UNSELECTED_SLIDE_CHANGED",503);
   }
 }
 if(changed!==selected.size||
    plan.selected.some(x=>original[x.order-1]?.slot_id!==x.slide_id))
   deny("GALLERY_FACTORY_SELECTION_INCOMPLETE",503);
 const verified=await ops.verifyDrive({
   output_id,job_id,profile_id:j.Profile_Record_ID,
   content_item_id:j.Content_Item_Record_ID,
   original_artifacts:original,revision_artifacts:revised,
   selected_slide_ids:[...selected],
 });
 if(verified!==true)deny("GALLERY_FACTORY_DRIVE_REVERIFICATION_FAILED",503);
 // Re-read canonical state after remote byte/rights verification. If a review,
 // hold, schedule or artifact changes during the remote check, fail closed.
 const [latestOutput,latestJob,latestContent]=await Promise.all([
   ops.readOutput(output_id),ops.readJob(job_id),
   ops.readContent(j.Content_Item_Record_ID),
 ]);
 if(!accepted(latestJob,output_id,job_id)||
    !held(latestOutput,latestJob,output_id)||
    latestJob.id!==job.id||
    latestJob.fields.Revised_Manifest_SHA256!==j.Revised_Manifest_SHA256||
    latestJob.fields.Revised_Manifest_JSON!==j.Revised_Manifest_JSON||
    latestJob.fields.Original_Manifest_JSON!==j.Original_Manifest_JSON||
    latestJob.fields.Plan_JSON!==j.Plan_JSON||
    latestJob.fields.Creative_Decision_Actor!==j.Creative_Decision_Actor||
    latestContent?.id!==content.id||
    latestContent.fields?.Content_Profile?.length!==1||
    latestContent.fields.Content_Profile[0]!==j.Profile_Record_ID)
   deny("GALLERY_FACTORY_REVIEW_CHANGED_DURING_VERIFICATION",409);
 const base="/api/factory/outputs/"+encodeURIComponent(output_id)+
   "/gallery/jobs/"+encodeURIComponent(job_id)+"/slides/";
 return {ok:true,output_id,job_id,profile_id:j.Profile_Record_ID,
   revised_manifest_sha256:j.Revised_Manifest_SHA256,
   selected_slide_count:changed,total_slide_count:original.length,
   slides:original.map((x,i)=>({
     slide_id:x.slot_id,order:x.order,changed:selected.has(x.slot_id),
     original_preview:base+encodeURIComponent(x.slot_id)+"/original",
     revised_preview:base+encodeURIComponent(x.slot_id)+"/revised",
   })),
   preview_source:"private_authenticated_runner_drive",
   drive_rights_and_pixels_verified:true,
   ready_for_factory_review:true,hold_active:true,
   creative_approved:true,factory_approved:false,
   handoff_performed:false,publication_authorized:false,can_publish:false,
   requires_separate_factory_approval:true};
}
