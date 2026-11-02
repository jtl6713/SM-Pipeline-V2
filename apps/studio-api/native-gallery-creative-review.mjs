/** #1495 Native gallery exact revised-manifest creative decision, Airtable SoR.
 * Revalidates actual private Drive bytes under the canonical output lock.
 * Human creative acceptance is NOT Factory approval or publication authority.
 */
import {nativeGalleryManifestCommitEnabled} from "./native-gallery-manifest-commit.mjs";
import {nativeGalleryHasScheduledOccupancy} from "./native-gallery-publisher-gate.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[a-f0-9]{64}$/;
const str=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?str(x.name):str(x);
const deny=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
export function nativeGalleryCreativeEnabled(env){
 return nativeGalleryManifestCommitEnabled(env)&&
   env?.NATIVE_GALLERY_REVISED_VERIFY_ENABLED==="true"&&
   env?.NATIVE_GALLERY_CREATIVE_ACCEPT_ENABLED==="true";
}
export async function creativeReviewNativeGallery({
 request,env,output_id,authorization,assertWriteRequest,
 operations:ops,now=()=>new Date().toISOString()
}={}){
 if(request?.method!=="POST")deny("METHOD_NOT_ALLOWED",405);
 const actor=authorization?.user?.record_id;
 if(!authorization?.authenticated||!authorization?.authorized||
    authorization.permissions?.outputs_review!==true||
    !REC.test(str(actor))||!REC.test(str(output_id)))
   deny("NATIVE_GALLERY_CREATIVE_PERMISSION_DENIED",403);
 if(typeof assertWriteRequest!=="function"||
    ["withOutputLock","readOutput","readContent","readJob","patchJob",
     "verifyRevisedDrive","authorizeProfile"].some(
       fn=>typeof ops?.[fn]!=="function"))
   deny("NATIVE_GALLERY_CREATIVE_ADAPTER_MISSING",503);
 assertWriteRequest(request,env);
 if(!nativeGalleryCreativeEnabled(env))
   deny("NATIVE_GALLERY_CREATIVE_DISABLED",405);
 if(!/^application\/json(?:\s*;|$)/i.test(str(request.headers?.get("Content-Type"))))
   deny("NATIVE_GALLERY_CREATIVE_JSON_REQUIRED",415);
 const raw=await request.text();
 if(raw.length>1100)deny("NATIVE_GALLERY_CREATIVE_BODY_TOO_LARGE",413);
 let b;
 try{b=JSON.parse(raw)}catch{deny("NATIVE_GALLERY_CREATIVE_JSON_INVALID",400);}
 if(!b||typeof b!=="object"||Array.isArray(b)||
    Object.keys(b).length!==4||
    Object.keys(b).some(k=>!["job_id","manifest_sha256","decision",
      "client_request_id"].includes(k))||
    !TOKEN.test(str(b.job_id))||!SHA.test(str(b.manifest_sha256))||
    !TOKEN.test(str(b.client_request_id))||
    !["accept","reject"].includes(b.decision))
   deny("NATIVE_GALLERY_CREATIVE_REQUEST_INVALID",400);
 return ops.withOutputLock(output_id,async()=>{
   const [output,job]=await Promise.all([
     ops.readOutput(output_id),ops.readJob(b.job_id)]);
   const o=output?.fields||{},j=job?.fields||{};
   if(output?.id!==output_id||!REC.test(str(job?.id))||
      j.Job_ID!==b.job_id||j.Output_Record_ID!==output_id||
      !REC.test(str(j.Profile_Record_ID))||
      !REC.test(str(j.Content_Item_Record_ID))||
      !Array.isArray(o.Content_Item)||o.Content_Item.length!==1||
      o.Content_Item[0]!==j.Content_Item_Record_ID||
      j.Revised_Manifest_SHA256!==b.manifest_sha256||
      !SHA.test(str(j.Original_Manifest_SHA256))||
      !SHA.test(str(j.Plan_SHA256))||
      !SHA.test(str(j.Launch_Intent_SHA256))||
      o.Do_Not_Publish!==true||
      o.Studio_Render_Review_Hold_Active!==true||
      str(o.Studio_Render_Review_Hold_ID)!==j.Hold_ID||
      str(o.Studio_Render_Review_Hold_Owner)!==j.Hold_Owner||
      str(o.Studio_Render_Review_Session_ID)!==j.Hold_Owner||
      o.Published_At||o.Platform_Post_ID||o.Platform_Post_URL||
      o.Platform_Media_ID||o.Publish_Started_At||
      o.Publish_Locked_At||o.Publish_Locked_By||
      /^(published|publishing|dispatched)$/i.test(choice(o.Publish_Status))||
      nativeGalleryHasScheduledOccupancy(o))
     deny("NATIVE_GALLERY_CREATIVE_HOLD_OR_MANIFEST_CHANGED");
   const content=await ops.readContent(j.Content_Item_Record_ID);
   if(content?.id!==j.Content_Item_Record_ID||
      !Array.isArray(content?.fields?.Content_Profile)||
      content.fields.Content_Profile.length!==1||
      content.fields.Content_Profile[0]!==j.Profile_Record_ID||
      await ops.authorizeProfile(j.Profile_Record_ID)!==true)
     deny("NATIVE_GALLERY_CREATIVE_PROFILE_DENIED",403);
   let original,revision,plan;
   try{
     original=JSON.parse(j.Original_Manifest_JSON);
     revision=JSON.parse(j.Revised_Manifest_JSON);
     plan=JSON.parse(j.Plan_JSON);
   }catch{deny("NATIVE_GALLERY_CREATIVE_LEDGER_INVALID",503);}
   if(!Array.isArray(original)||!Array.isArray(revision)||
      !original.length||original.length!==revision.length||
      original.length>20||!Array.isArray(plan?.selected)||
      !plan.selected.length||plan.output_id!==output_id||
      plan.profile_id!==j.Profile_Record_ID||
      plan.content_item_id!==j.Content_Item_Record_ID||
      plan.original_manifest_sha256!==j.Original_Manifest_SHA256||
      plan.auto_approve!==false||plan.allow_public_publish!==false)
     deny("NATIVE_GALLERY_CREATIVE_SOURCE_CONFLICT");
   const prior=choice(j.Creative_Decision);
   const expected=b.decision==="accept"?"accepted":"rejected";
   const state=b.decision==="accept"?"creative_accepted":"rejected";
   if(prior){
     if(prior!==expected||str(j.Creative_Decision_Actor)!==actor||
        choice(j.Job_State)!==state||j.Row_Version!==5)
       deny("NATIVE_GALLERY_CREATIVE_CONFLICT");
   }else if(choice(j.Job_State)!=="ready_for_review"||j.Row_Version!==4){
     deny("NATIVE_GALLERY_CREATIVE_NOT_REVIEWABLE");
   }
   // Even for a replay, independently verify the exact revised private bytes
   // and selected-only changes before reporting an accepted artifact.
   const trusted=await ops.verifyRevisedDrive({
     output_id,profile_id:j.Profile_Record_ID,
     content_item_id:j.Content_Item_Record_ID,
     original_artifacts:original,revision_artifacts:revision,
     selected_slide_ids:plan.selected.map(x=>x.slide_id),
   });
   if(trusted!==true)deny("NATIVE_GALLERY_CREATIVE_DRIVE_READBACK_FAILED");
   if(prior)return {ok:true,replay:true,output_id,job_id:b.job_id,
     manifest_sha256:b.manifest_sha256,decision:b.decision,
     creative_approved:b.decision==="accept",
     factory_approved:false,publication_authorized:false};
   const stamp=now();
   if(typeof stamp!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(stamp))
     deny("NATIVE_GALLERY_CREATIVE_CLOCK_INVALID",503);
   await ops.patchJob(job.id,{
     Creative_Decision:expected,Creative_Decision_Actor:actor,
     Creative_Decision_At_UTC:stamp,
     Job_State:state,Row_Version:5,Updated_At_UTC:stamp,
   });
   const [after,holdAfter]=await Promise.all([
     ops.readJob(b.job_id),ops.readOutput(output_id)]);
   if(after?.id!==job.id||choice(after.fields?.Job_State)!==state||
      choice(after.fields.Creative_Decision)!==expected||
      after.fields.Creative_Decision_Actor!==actor||
      after.fields.Creative_Decision_At_UTC!==stamp||
      after.fields.Row_Version!==5||
      after.fields.Revised_Manifest_SHA256!==b.manifest_sha256||
      holdAfter?.fields?.Do_Not_Publish!==true||
      holdAfter.fields.Studio_Render_Review_Hold_Active!==true||
      str(holdAfter.fields.Studio_Render_Review_Hold_ID)!==j.Hold_ID)
     deny("NATIVE_GALLERY_CREATIVE_READBACK_FAILED",503);
   return {ok:true,replay:false,output_id,job_id:b.job_id,
     manifest_sha256:b.manifest_sha256,decision:b.decision,
     creative_approved:b.decision==="accept",
     factory_approved:false,publication_authorized:false};
 });
}
