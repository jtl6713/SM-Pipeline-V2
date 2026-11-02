/**
 * #1495 One-shot native gallery generation launch ledger, Airtable SoR.
 *
 * The first reserve_intent under the canonical output lock is the ONLY
 * operation permitted to initiate a remote generator, and only after the
 * intent has been read back. Subsequent identical calls return MAY NOT LAUNCH
 * even when the first reply was lost; a human must reconcile remote results.
 * This component never executes an image model, changes V1 or publishes.
 */
import {galleryClaimEnabled} from "./native-gallery-job-claim.mjs";
import {nativeGalleryHasScheduledOccupancy} from "./native-gallery-publisher-gate.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[a-f0-9]{64}$/;
const text=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?text(x.name):text(x);
const deny=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
async function hash(value){
 const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function requireServiceAuth(request,env){
 const expected=text(env?.NATIVE_GALLERY_JOB_SHARED_SECRET);
 const supplied=text(request?.headers?.get("X-Native-Gallery-Job-Secret"));
 if(expected.length<24||supplied.length!==expected.length)
   deny("GALLERY_LAUNCH_AUTH_DENIED",403);
 const [a,b]=await Promise.all([hash(expected),hash(supplied)]);
 let diff=0;
 for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 if(diff)deny("GALLERY_LAUNCH_AUTH_DENIED",403);
}
export function nativeGalleryLaunchIntentEnabled(env){
 return galleryClaimEnabled(env)&&env?.NATIVE_GALLERY_LAUNCH_INTENT_ENABLED==="true";
}
async function getAuthority(ops,requestBody){
 const [o,j]=await Promise.all([
   ops.readOutput(requestBody.output_id),ops.readJob(requestBody.job_id)
 ]);
 const f=o?.fields||{},v=j?.fields||{};
 if(o?.id!==requestBody.output_id||!REC.test(text(j?.id))||
    v.Job_ID!==requestBody.job_id||
    v.Output_Record_ID!==requestBody.output_id||
    !REC.test(text(v.Profile_Record_ID))||
    !REC.test(text(v.Content_Item_Record_ID))||
    !REC.test(text(v.Actor_Record_ID))||
    !SHA.test(text(v.Original_Manifest_SHA256))||
    !SHA.test(text(v.Plan_SHA256))||
    !SHA.test(text(v.Request_Fingerprint))||
    v.Lease_Owner!==requestBody.lease_owner||
    v.Lease_Fence!==requestBody.lease_fence||
    choice(v.Job_State)!=="claimed"||
    !Number.isSafeInteger(v.Row_Version)||v.Row_Version<2||
    !Array.isArray(f.Content_Item)||f.Content_Item.length!==1||
    f.Content_Item[0]!==v.Content_Item_Record_ID||
    f.Do_Not_Publish!==true||
    f.Studio_Render_Review_Hold_Active!==true||
    text(f.Studio_Render_Review_Hold_ID)!==v.Hold_ID||
    text(f.Studio_Render_Review_Hold_Owner)!==v.Hold_Owner||
    text(f.Studio_Render_Review_Session_ID)!==v.Hold_Owner||
    f.Published_At||f.Platform_Post_ID||f.Platform_Post_URL||
    f.Platform_Media_ID||f.Publish_Started_At||
    f.Publish_Locked_At||f.Publish_Locked_By||
    /^(published|publishing|dispatched)$/i.test(choice(f.Publish_Status))||
    nativeGalleryHasScheduledOccupancy(f))
   deny("GALLERY_LAUNCH_AUTHORITY_CHANGED");
 const content=await ops.readContent(v.Content_Item_Record_ID);
 if(content?.id!==v.Content_Item_Record_ID||
    !Array.isArray(content?.fields?.Content_Profile)||
    content.fields.Content_Profile.length!==1||
    content.fields.Content_Profile[0]!==v.Profile_Record_ID)
   deny("GALLERY_LAUNCH_PROFILE_CHANGED",403);
 let history,plan,original;
 try{
   history=JSON.parse(v.Event_History_JSON);
   plan=JSON.parse(v.Plan_JSON);
   original=JSON.parse(v.Original_Manifest_JSON);
 }catch{deny("GALLERY_LAUNCH_LEDGER_UNREADABLE",503);}
 if(!Array.isArray(history)||history.length<2||history.length>3||
    history[0]?.event!=="native_gallery_job_created"||
    history[1]?.event!=="native_gallery_job_claimed"||
    history[1]?.lease_owner!==requestBody.lease_owner||
    history[1]?.lease_fence!==requestBody.lease_fence||
    history.some(ev=>ev?.publication_authorized!==false)||
    !plan||!Array.isArray(original)||original.length<1||
    original.length>20||
    await hash(JSON.stringify(plan))!==v.Plan_SHA256||
    plan.output_id!==requestBody.output_id||
    plan.content_item_id!==v.Content_Item_Record_ID||
    plan.profile_id!==v.Profile_Record_ID||
    plan.original_manifest_sha256!==v.Original_Manifest_SHA256||
    plan.human_intent!=="explicit_button"||
    plan.auto_approve!==false||
    plan.allow_public_publish!==false||
    plan.mutate_original_production_request!==false||
    plan.mutate_sibling_outputs!==false)
   deny("GALLERY_LAUNCH_PLAN_CONFLICT");
 return {o,j,v,plan,original,history};
}
/** A caller may provide the existing protected Worker lock and trusted reads.
 * Fresh source verification must reload actual private Drive bytes and assert
 * the SAME immutable full artifact manifest; never trust the request body.
 */
export async function reserveNativeGalleryLaunch({request,env,operations:ops,
  now=()=>new Date().toISOString()}={}){
 if(!nativeGalleryLaunchIntentEnabled(env))
   deny("GALLERY_LAUNCH_DISABLED",405);
 if(request?.method!=="POST")deny("METHOD_NOT_ALLOWED",405);
 await requireServiceAuth(request,env);
 if(!/^application\/json(?:\s*;|$)/i.test(text(request.headers?.get("Content-Type"))))
   deny("GALLERY_LAUNCH_JSON_REQUIRED",415);
 const raw=await request.text();
 if(raw.length>900)deny("GALLERY_LAUNCH_BODY_TOO_LARGE",413);
 let body;
 try{body=JSON.parse(raw)}catch{deny("GALLERY_LAUNCH_BAD_JSON",400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).length!==6||
    Object.keys(body).some(k=>!["action","output_id","job_id",
        "lease_owner","lease_fence","payload_hash"].includes(k))||
    !["read_intent","reserve_intent"].includes(body.action)||
    !REC.test(text(body.output_id))||!TOKEN.test(text(body.job_id))||
    !TOKEN.test(text(body.lease_owner))||
    !Number.isSafeInteger(body.lease_fence)||body.lease_fence<1||
    !SHA.test(text(body.payload_hash)))
   deny("GALLERY_LAUNCH_INVALID_REQUEST",400);
 for(const fn of ["withOutputLock","readOutput","readContent","readJob",
   "patchJob","verifyOriginalSources"]){
   if(typeof ops?.[fn]!=="function")deny("GALLERY_LAUNCH_ADAPTER_UNAVAILABLE",503);
 }
 return ops.withOutputLock(body.output_id,async()=>{
   const current=await getAuthority(ops,body);
   const {j,v,history,original}=current;
   const savedIntent=history[2];
   if(savedIntent){
     if(savedIntent.event!=="native_gallery_launch_intent_reserved"||
        savedIntent.lease_owner!==body.lease_owner||
        savedIntent.lease_fence!==body.lease_fence||
        savedIntent.payload_hash!==body.payload_hash||
        v.Launch_Intent_SHA256!==body.payload_hash)
       deny("GALLERY_LAUNCH_INTENT_CONFLICT");
     return {ok:true,replay:true,intent_verified:true,
       job_id:body.job_id,output_id:body.output_id,
       lease_fence:body.lease_fence,may_generate:false,
       publication_authorized:false};
   }
   if(v.Launch_Intent_SHA256||v.Launch_Receipt_JSON||
      body.action!=="reserve_intent")
     return {ok:true,replay:false,intent_verified:false,
       job_id:body.job_id,output_id:body.output_id,
       may_generate:false,publication_authorized:false};
   if(v.Row_Version!==2)deny("GALLERY_LAUNCH_VERSION_STALE");
   // Independently fetch fresh Airtable rights AND Google Drive source bytes
   // under the same lock. New or replaced files must never inherit proof.
   const fresh=await ops.verifyOriginalSources({
     output_id:body.output_id,profile_id:v.Profile_Record_ID,
     content_item_id:v.Content_Item_Record_ID,
     original_manifest_sha256:v.Original_Manifest_SHA256,
     original_artifacts:original,
   });
   if(fresh!==true)deny("GALLERY_LAUNCH_SOURCE_BYTES_STALE");
   const timestamp=now();
   if(typeof timestamp!=="string"||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(timestamp))
     deny("GALLERY_LAUNCH_CLOCK_INVALID",503);
   const event={event:"native_gallery_launch_intent_reserved",
     lease_owner:body.lease_owner,lease_fence:body.lease_fence,
     payload_hash:body.payload_hash,at:timestamp,
     publication_authorized:false};
   await ops.patchJob(j.id,{
     Job_State:"claimed",Row_Version:3,
     Launch_Intent_SHA256:body.payload_hash,
     Progress_Stage:"launch_intent_reserved",
     Updated_At_UTC:timestamp,
     Event_History_JSON:JSON.stringify([...history,event]),
   });
   const after=await getAuthority(ops,body);
   if(after.j.id!==j.id||after.v.Row_Version!==3||
      after.v.Launch_Intent_SHA256!==body.payload_hash||
      after.history.length!==3||
      JSON.stringify(after.history[2])!==JSON.stringify(event))
     deny("GALLERY_LAUNCH_DURABLE_READBACK_FAILED",503);
   return {ok:true,replay:false,intent_verified:true,
     job_id:body.job_id,output_id:body.output_id,
     lease_owner:body.lease_owner,lease_fence:body.lease_fence,
     // This is a one-time reservation, not proof that a render ran.
     may_generate:true,publication_authorized:false};
 });
}
