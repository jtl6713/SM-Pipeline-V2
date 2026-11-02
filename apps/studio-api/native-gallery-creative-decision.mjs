/** Exact V2 native-gallery human creative decision, Airtable authoritative.
 * No Factory approval, original output writes, hold release or publication.
 * The decision must be explicit and scoped to the current revised manifest,
 * after an independent private Drive rights/pixel readback under the lock.
 */
import {nativeGalleryManifestCommitEnabled} from "./native-gallery-manifest-commit.mjs";
import {nativeGalleryHasScheduledOccupancy} from "./native-gallery-publisher-gate.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/,ID=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[0-9a-f]{64}$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const choice=x=>typeof x==="object"&&x!==null?String(x.name||""):String(x||"");
async function hash(text){
 const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return [...new Uint8Array(raw)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function nativeGalleryCreativeReviewEnabled(env){
 return nativeGalleryManifestCommitEnabled(env)&&
   env?.NATIVE_GALLERY_CREATIVE_DECISION_ENABLED==="true";
}
export async function decideNativeGalleryCreative({
 request,env,authorization,output_id,job_id,
 assertWriteRequest,operations:ops,now=()=>new Date().toISOString(),
}={}){
 if(!nativeGalleryCreativeReviewEnabled(env))
   fail("GALLERY_CREATIVE_DECISION_DISABLED",405);
 if(request?.method!=="POST")fail("METHOD_NOT_ALLOWED",405);
 const actor=authorization?.user?.record_id;
 if(!authorization?.authenticated||!authorization?.authorized||
    authorization.permissions?.outputs_review!==true||
    !REC.test(String(actor||""))||
    !Array.isArray(authorization.authorized_profile_ids))
   fail("GALLERY_CREATIVE_REVIEW_UNAUTHORIZED",403);
 if(!REC.test(String(output_id||""))||!ID.test(String(job_id||"")))
   fail("GALLERY_CREATIVE_REVIEW_IDENTITY_INVALID",400);
 if(typeof assertWriteRequest!=="function")
   fail("GALLERY_CREATIVE_WRITE_AUTH_UNAVAILABLE",503);
 assertWriteRequest(request,env);
 if(!/^application\/json(?:\s*;|$)/i.test(
   String(request.headers?.get("Content-Type")||"")))
   fail("GALLERY_CREATIVE_JSON_REQUIRED",415);
 const raw=await request.text();
 if(raw.length>900)fail("GALLERY_CREATIVE_BODY_OVERSIZED",413);
 let body;try{body=JSON.parse(raw)}catch{fail("GALLERY_CREATIVE_BAD_JSON",400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).length!==3||
    Object.keys(body).some(k=>!["decision","manifest_sha256","confirm_reviewed"].includes(k))||
    !["accept","reject"].includes(body.decision)||
    !SHA.test(String(body.manifest_sha256||""))||
    body.confirm_reviewed!==true)
   fail("GALLERY_CREATIVE_EXPLICIT_CONFIRMATION_REQUIRED",400);
 for(const key of ["withOutputLock","readOutput","readContent","readJob","patchJob",
   "verifyRevisedDriveArtifacts"]){
   if(typeof ops?.[key]!=="function")fail("GALLERY_CREATIVE_ADAPTER_MISSING",503);
 }
 return ops.withOutputLock(output_id,async()=>{
   const [output,job]=await Promise.all([ops.readOutput(output_id),ops.readJob(job_id)]);
   const f=output?.fields||{},j=job?.fields||{};
   if(output?.id!==output_id||!REC.test(String(job?.id||""))||
      j.Job_ID!==job_id||j.Output_Record_ID!==output_id||
      !REC.test(String(j.Profile_Record_ID||""))||
      !authorization.authorized_profile_ids.includes(j.Profile_Record_ID)||
      !REC.test(String(j.Content_Item_Record_ID||""))||
      j.Revised_Manifest_SHA256!==body.manifest_sha256||
      !SHA.test(String(j.Original_Manifest_SHA256||""))||
      !Array.isArray(f.Content_Item)||f.Content_Item.length!==1||
      f.Content_Item[0]!==j.Content_Item_Record_ID||
      f.Do_Not_Publish!==true||f.Studio_Render_Review_Hold_Active!==true||
      f.Studio_Render_Review_Hold_ID!==j.Hold_ID||
      f.Studio_Render_Review_Hold_Owner!==j.Hold_Owner||
      f.Studio_Render_Review_Session_ID!==j.Hold_Owner||
      f.Published_At||f.Platform_Post_ID||f.Platform_Media_ID||
      f.Publish_Started_At||f.Publish_Locked_By||f.Publish_Locked_At||
      nativeGalleryHasScheduledOccupancy(f))
     fail("GALLERY_CREATIVE_SOURCE_OR_HOLD_CHANGED");
   const content=await ops.readContent(j.Content_Item_Record_ID);
   if(content?.id!==j.Content_Item_Record_ID||
      !Array.isArray(content?.fields?.Content_Profile)||
      content.fields.Content_Profile.length!==1||
      content.fields.Content_Profile[0]!==j.Profile_Record_ID)
     fail("GALLERY_CREATIVE_FOREIGN_PROFILE",403);
   const resolved=body.decision==="accept"?"accepted":"rejected";
   const finalState=body.decision==="accept"?"creative_accepted":"rejected";
   if(choice(j.Creative_Decision)||["creative_accepted","rejected"].includes(choice(j.Job_State))){
     if(choice(j.Creative_Decision)===resolved&&
        j.Creative_Decision_Actor===actor&&
        choice(j.Job_State)===finalState&&
        j.Revised_Manifest_SHA256===body.manifest_sha256)
       return {ok:true,replay:true,decision:body.decision,job_id,output_id,
         creative_approved:body.decision==="accept",
         factory_approved:false,publication_authorized:false};
     fail("GALLERY_CREATIVE_DECISION_CONFLICT");
   }
   if(choice(j.Job_State)!=="ready_for_review"||j.Row_Version!==4)
     fail("GALLERY_CREATIVE_NOT_READY_FOR_REVIEW");
   let original,revised,plan;
   try{
     original=JSON.parse(j.Original_Manifest_JSON);
     revised=JSON.parse(j.Revised_Manifest_JSON);
     plan=JSON.parse(j.Plan_JSON);
   }catch{fail("GALLERY_CREATIVE_MANIFEST_UNREADABLE",503);}
   if(!Array.isArray(original)||!Array.isArray(revised)||
      original.length!==revised.length||!original.length||
      !Array.isArray(plan?.selected)||!plan.selected.length||
      plan.profile_id!==j.Profile_Record_ID||plan.output_id!==output_id||
      await hash(JSON.stringify(revised))!==body.manifest_sha256)
     fail("GALLERY_CREATIVE_REVISED_MANIFEST_CHANGED");
   const cleared=await ops.verifyRevisedDriveArtifacts({
     output_id,job_id,profile_id:j.Profile_Record_ID,
     content_item_id:j.Content_Item_Record_ID,
     original_artifacts:original,revision_artifacts:revised,
     selected_slide_ids:plan.selected.map(x=>x.slide_id),
   });
   if(cleared!==true)fail("GALLERY_CREATIVE_DRIVE_REVERIFICATION_FAILED");
   const timestamp=now();
   if(typeof timestamp!=="string"||!/^\d{4}-\d\d-\d\dT/.test(timestamp))
     fail("GALLERY_CREATIVE_CLOCK_INVALID",503);
   await ops.patchJob(job.id,{
     Job_State:finalState,Row_Version:5,Creative_Decision:resolved,
     Creative_Decision_Actor:actor,Creative_Decision_At_UTC:timestamp,
     Progress_Stage:finalState,Updated_At_UTC:timestamp,
   });
   const saved=await ops.readJob(job_id);
   if(saved?.id!==job.id||choice(saved.fields?.Job_State)!==finalState||
      choice(saved.fields.Creative_Decision)!==resolved||
      saved.fields.Creative_Decision_Actor!==actor||
      saved.fields.Revised_Manifest_SHA256!==body.manifest_sha256||
      saved.fields.Row_Version!==5)
     fail("GALLERY_CREATIVE_READBACK_FAILED",503);
   return {ok:true,replay:false,decision:body.decision,job_id,output_id,
     creative_approved:body.decision==="accept",
     factory_approved:false,publication_authorized:false};
 });
}
