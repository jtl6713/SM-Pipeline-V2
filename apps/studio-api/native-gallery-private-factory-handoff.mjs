/**
 * Stage 1 native image/gallery: explicit PRIVATE Factory-review handoff.
 *
 * This only appends a durable, idempotent Airtable JOB review receipt.
 * Job_State stays creative_accepted; the native V2 Media Assets stay
 * quarantined (Active=false, Do_Not_Use=true). The output keeps its exact
 * Do_Not_Publish review hold. NO Factory approval, normal Factory queue
 * promotion, schedule, release, public URL or provider mutation occurs here.
 * The eventual native output package and independent Factory approval require
 * another gated implementation.
 */
import {inspectNativeGalleryFactoryPreflight,
  nativeGalleryFactoryPreflightEnabled} from "./native-gallery-factory-preflight.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/,ID=/^[A-Za-z0-9_-]{8,120}$/,SHA=/^[a-f0-9]{64}$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const stage="factory_review_pending";
const eventName="native_gallery_private_factory_handoff";
const state=x=>typeof x==="object"&&x!==null?String(x.name||""):String(x||"");

export function nativeGalleryPrivateFactoryHandoffEnabled(env){
 return nativeGalleryFactoryPreflightEnabled(env)&&
   env?.NATIVE_GALLERY_FACTORY_HANDOFF_ENABLED==="true";
}
function ledger(job){
 let history;
 try{history=JSON.parse(job?.fields?.Event_History_JSON);}catch{
   fail("GALLERY_FACTORY_HANDOFF_LEDGER_UNAVAILABLE",503);
 }
 if(!Array.isArray(history)||history.length<1||history.length>80||
    history.some(x=>!x||typeof x!=="object"||Array.isArray(x)))
   fail("GALLERY_FACTORY_HANDOFF_LEDGER_INVALID",503);
 return history;
}
function held(output,job){
 const f=output?.fields||{},j=job?.fields||{};
 return output?.id===j.Output_Record_ID&&
   f.Do_Not_Publish===true&&f.Studio_Render_Review_Hold_Active===true&&
   ID.test(String(j.Hold_ID||""))&&ID.test(String(j.Hold_Owner||""))&&
   f.Studio_Render_Review_Hold_ID===j.Hold_ID&&
   f.Studio_Render_Review_Hold_Owner===j.Hold_Owner&&
   f.Studio_Render_Review_Session_ID===j.Hold_Owner&&
   Array.isArray(f.Content_Item)&&f.Content_Item.length===1&&
   f.Content_Item[0]===j.Content_Item_Record_ID&&
   f.Auto_Publish_Enabled!==true&&!f.Publish_Started_At&&!f.Published_At&&
   !f.Publish_Locked_At&&!f.Publish_Locked_By&&
   !f.Platform_Post_ID&&!f.Platform_Media_ID&&
   !f.Studio_Scheduled_At&&!f.Scheduled_Post_Date;
}
function receipt(job,outputId,jobId,actor,hash){
 const f=job?.fields||{};
 return job?.id&&REC.test(job.id)&&
   f.Job_ID===jobId&&f.Output_Record_ID===outputId&&
   REC.test(String(f.Profile_Record_ID||""))&&
   REC.test(String(f.Content_Item_Record_ID||""))&&
   state(f.Job_State)==="creative_accepted"&&
   state(f.Creative_Decision)==="accepted"&&
   f.Creative_Decision_Actor===actor&&
   f.Revised_Manifest_SHA256===hash;
}
function matchingHistory(rows,{output_id,job_id,actor,hash,profile_id,hold_id}){
 const matches=rows.filter(e=>e.event===eventName);
 if(matches.length!==1)return false;
 const r=matches[0];
 return r.output_id===output_id&&r.job_id===job_id&&
   r.actor_id===actor&&r.manifest_sha256===hash&&
   r.profile_id===profile_id&&r.hold_id===hold_id&&
   r.to_stage===stage&&r.factory_approved===false&&
   r.publication_authorized===false&&r.hold_released===false&&
   /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(String(r.at_utc||""));
}
function safeReply({output_id,job_id,hash,at_utc,replay}){
 return {ok:true,output_id,job_id,revised_manifest_sha256:hash,
   private_factory_review_handoff:true,stage,at_utc,replay,
   hold_active:true,creative_approved:true,
   factory_approved:false,publication_authorized:false,
   hold_released:false,can_publish:false,media_quarantined:true,
   requires_separate_factory_approval:true};
}

export async function handoffNativeGalleryToPrivateFactory({
 request,env,authorization,output_id,job_id,assertWriteRequest,
 operations:ops,now=()=>new Date().toISOString(),
 preflight=inspectNativeGalleryFactoryPreflight,
}={}){
 if(!nativeGalleryPrivateFactoryHandoffEnabled(env))
   fail("GALLERY_FACTORY_HANDOFF_DISABLED",405);
 if(request?.method!=="POST")fail("METHOD_NOT_ALLOWED",405);
 const actor=authorization?.user?.record_id;
 if(!authorization?.authenticated||!authorization?.authorized||
    authorization.permissions?.outputs_review!==true||
    !Array.isArray(authorization.authorized_profile_ids)||
    !REC.test(String(actor||"")))
   fail("GALLERY_FACTORY_HANDOFF_PERMISSION_DENIED",403);
 if(!REC.test(String(output_id||""))||!ID.test(String(job_id||"")))
   fail("GALLERY_FACTORY_HANDOFF_IDENTITY_INVALID",400);
 if(typeof assertWriteRequest!=="function")
   fail("GALLERY_FACTORY_HANDOFF_WRITE_GUARD_MISSING",503);
 assertWriteRequest(request,env);
 if(!/^application\/json(?:\s*;|$)/i.test(String(request.headers?.get("Content-Type")||"")))
   fail("GALLERY_FACTORY_HANDOFF_JSON_REQUIRED",415);
 const raw=await request.text();
 if(raw.length>512)fail("GALLERY_FACTORY_HANDOFF_BODY_TOO_LARGE",413);
 let body;try{body=JSON.parse(raw)}catch{fail("GALLERY_FACTORY_HANDOFF_JSON_INVALID",400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).length!==2||
    Object.keys(body).some(k=>!["manifest_sha256","confirm_private_factory_handoff"].includes(k))||
    !SHA.test(String(body.manifest_sha256||""))||
    body.confirm_private_factory_handoff!==true)
   fail("GALLERY_FACTORY_HANDOFF_EXPLICIT_CONFIRMATION_REQUIRED",400);
 for(const name of ["withOutputLock","readOutput","readContent","readJob","patchJob","verifyDrive"]){
   if(typeof ops?.[name]!=="function")
     fail("GALLERY_FACTORY_HANDOFF_ADAPTER_MISSING",503);
 }
 if(typeof preflight!=="function")fail("GALLERY_FACTORY_HANDOFF_PREFLIGHT_MISSING",503);
 return ops.withOutputLock(output_id,async()=>{
   const [job,output]=await Promise.all([ops.readJob(job_id),ops.readOutput(output_id)]);
   const j=job?.fields||{};
   if(!receipt(job,output_id,job_id,actor,body.manifest_sha256)||
      !authorization.authorized_profile_ids.includes(j.Profile_Record_ID)||
      !held(output,job))
     fail("GALLERY_FACTORY_HANDOFF_AUTHORITY_CHANGED");
   const content=await ops.readContent(j.Content_Item_Record_ID);
   if(content?.id!==j.Content_Item_Record_ID||
      content.fields?.Content_Profile?.length!==1||
      content.fields.Content_Profile[0]!==j.Profile_Record_ID)
     fail("GALLERY_FACTORY_HANDOFF_PROFILE_CHANGED");
   const history=ledger(job),existing=history.filter(e=>e.event===eventName);
   if(j.Row_Version===6&&j.Progress_Stage===stage){
     if(!matchingHistory(history,{output_id,job_id,actor,
       hash:body.manifest_sha256,profile_id:j.Profile_Record_ID,hold_id:j.Hold_ID}))
       fail("GALLERY_FACTORY_HANDOFF_REPLAY_CONFLICT");
     return safeReply({output_id,job_id,hash:body.manifest_sha256,
       at_utc:existing[0].at_utc,replay:true});
   }
   if(j.Row_Version!==5||j.Progress_Stage!== "creative_accepted"||existing.length)
     fail("GALLERY_FACTORY_HANDOFF_VERSION_CONFLICT");
   // Snapshot the primitive identity, not an object reference that might
   // change while remote verification is in progress.
   const pinned={record_id:job.id,profile_id:j.Profile_Record_ID,
     content_id:j.Content_Item_Record_ID,hold_id:j.Hold_ID,
     hold_owner:j.Hold_Owner,hash:j.Revised_Manifest_SHA256,
     history_json:j.Event_History_JSON};
   // Values pinned BEFORE the remote Drive check, not after it.
   // Mandatory independent source/rights/watermark/selected-only Drive proof
   // and Airtable readback while the shared Output approval lock is held.
   const verified=await preflight({
     request:new Request("https://studio.invalid/native-gallery/factory-preflight",{method:"GET"}),
     env,authorization,output_id,job_id,operations:ops,
   });
   if(verified?.ok!==true||
      verified.output_id!==output_id||verified.job_id!==job_id||
      verified.profile_id!==j.Profile_Record_ID||
      verified.revised_manifest_sha256!==body.manifest_sha256||
      verified.ready_for_factory_review!==true||
      verified.drive_rights_and_pixels_verified!==true||
      verified.hold_active!==true||
      verified.creative_approved!==true||
      verified.factory_approved!==false||
      verified.handoff_performed!==false||
      verified.can_publish!==false||
      verified.publication_authorized!==false||
      verified.requires_separate_factory_approval!==true)
     fail("GALLERY_FACTORY_HANDOFF_PREFLIGHT_NOT_VERIFIED",503);
   const fresh=await ops.readJob(job_id);
   if(fresh?.id!==pinned.record_id||fresh.fields?.Row_Version!==5||
      fresh.fields?.Progress_Stage!=="creative_accepted"||
      fresh.fields?.Revised_Manifest_SHA256!==pinned.hash||
      fresh.fields?.Event_History_JSON!==pinned.history_json||
      fresh.fields?.Hold_ID!==pinned.hold_id||
      fresh.fields?.Hold_Owner!==pinned.hold_owner)
     fail("GALLERY_FACTORY_HANDOFF_CHANGED_DURING_PREFLIGHT",409);
   if(history.length>=80)fail("GALLERY_FACTORY_HANDOFF_LEDGER_FULL",409);
   const time=now();
   if(typeof time!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(time))
     fail("GALLERY_FACTORY_HANDOFF_CLOCK_INVALID",503);
   const event={event:eventName,at_utc:time,
     output_id,job_id,profile_id:pinned.profile_id,
     actor_id:actor,hold_id:pinned.hold_id,
     manifest_sha256:pinned.hash,to_stage:stage,
     factory_approved:false,publication_authorized:false,hold_released:false};
   const updatedHistory=JSON.stringify([...history,event]);
   if(updatedHistory.length>80000)
     fail("GALLERY_FACTORY_HANDOFF_LEDGER_TOO_LARGE",409);
   await ops.patchJob(pinned.record_id,{
     Row_Version:6,Progress_Stage:stage,
     Event_History_JSON:updatedHistory,Updated_At_UTC:time,
   });
   const [saved,savedOutput]=await Promise.all([
     ops.readJob(job_id),ops.readOutput(output_id)]);
   if(saved?.id!==pinned.record_id||
      !receipt(saved,output_id,job_id,actor,pinned.hash)||
      saved.fields.Row_Version!==6||
      saved.fields.Progress_Stage!==stage||
      saved.fields.Event_History_JSON!==updatedHistory||
      !matchingHistory(ledger(saved),{output_id,job_id,actor,
        hash:pinned.hash,profile_id:pinned.profile_id,hold_id:pinned.hold_id})||
      !held(savedOutput,saved))
     fail("GALLERY_FACTORY_HANDOFF_READBACK_UNVERIFIED",503);
   return safeReply({output_id,job_id,hash:pinned.hash,at_utc:time,replay:false});
 });
}
