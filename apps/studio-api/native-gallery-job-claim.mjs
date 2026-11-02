/** Exact one-owner, one-fence Runner claim for native gallery Airtable jobs.
 * Only the protected Worker updates Airtable. Never runs AI, uploads media,
 * approves creative work, changes a source file, releases a hold or publishes.
 */
import {nativeGalleryJobsEnabled,NATIVE_GALLERY_JOBS_TABLE}
  from "./native-gallery-job-airtable.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[0-9a-f]{64}$/;
const str=v=>String(v??"").trim();
const state=v=>typeof v==="object"&&v!==null?str(v.name):str(v);
function fail(code,status=409){throw Object.assign(new Error(code),{code,status});}
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest(
  "SHA-256",new TextEncoder().encode(s)
))].map(x=>x.toString(16).padStart(2,"0")).join("");
export function galleryClaimEnabled(env){
 return nativeGalleryJobsEnabled(env)&&env?.NATIVE_GALLERY_CLAIM_ENABLED==="true";
}
async function authorize(request,env){
 const expected=str(env?.NATIVE_GALLERY_JOB_SHARED_SECRET);
 const actual=str(request?.headers?.get("X-Native-Gallery-Job-Secret"));
 if(expected.length<24||actual.length!==expected.length)
   fail("GALLERY_CLAIM_AUTH_REQUIRED",403);
 const [a,b]=await Promise.all([digest(expected),digest(actual)]);
 let mismatch=0;
 for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 if(mismatch)fail("GALLERY_CLAIM_AUTH_REQUIRED",403);
}
export async function claimNativeGalleryJob({
 request,env,operations,now=()=>new Date().toISOString(),
}={}){
 if(!galleryClaimEnabled(env))fail("GALLERY_CLAIM_DISABLED",405);
 if(request?.method!=="POST")fail("METHOD_NOT_ALLOWED",405);
 await authorize(request,env);
 if(!/^application\/json(?:\s*;|$)/i.test(
   str(request.headers?.get("Content-Type"))))
   fail("GALLERY_CLAIM_JSON_REQUIRED",415);
 const raw=await request.text();
 if(raw.length>600)fail("GALLERY_CLAIM_BODY_TOO_LARGE",413);
 let body;
 try{body=JSON.parse(raw)}catch{fail("GALLERY_CLAIM_JSON_INVALID",400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).length!==3||
    Object.keys(body).some(k=>!["output_id","job_id","client_request_id"].includes(k))||
    !REC.test(str(body.output_id))||
    !TOKEN.test(str(body.job_id))||
    !TOKEN.test(str(body.client_request_id)))
   fail("GALLERY_CLAIM_REQUEST_INVALID",400);
 for(const name of ["withOutputLock","readOutput","readContent","readJob","patchJob"]){
   if(typeof operations?.[name]!=="function")
     fail("GALLERY_CLAIM_ADAPTER_MISSING",503);
 }
 const owner="ngrunner_"+(await digest(JSON.stringify([
   "native-gallery-claim-v1",body.output_id,body.job_id,
   body.client_request_id,
 ]))).slice(0,48);
 return operations.withOutputLock(body.output_id,async()=>{
   const [output,job]=await Promise.all([
     operations.readOutput(body.output_id),operations.readJob(body.job_id),
   ]);
   const f=output?.fields||{},j=job?.fields||{};
   if(output?.id!==body.output_id||!f||!REC.test(str(job?.id))||
      j.Job_ID!==body.job_id||
      j.Output_Record_ID!==body.output_id||
      !REC.test(str(j.Profile_Record_ID))||
      !REC.test(str(j.Content_Item_Record_ID))||
      !REC.test(str(j.Actor_Record_ID))||
      !SHA.test(str(j.Original_Manifest_SHA256))||
      !SHA.test(str(j.Plan_SHA256))||
      !SHA.test(str(j.Request_Fingerprint))||
      !TOKEN.test(str(j.Client_Request_ID))||
      !TOKEN.test(str(j.Hold_ID))||!TOKEN.test(str(j.Hold_Owner))||
      !Number.isSafeInteger(j.Row_Version)||j.Row_Version<1||
      !Number.isSafeInteger(j.Lease_Fence)||j.Lease_Fence<0)
     fail("GALLERY_CLAIM_JOB_IDENTITY_UNVERIFIED");
   if(!Array.isArray(f.Content_Item)||f.Content_Item.length!==1||
      f.Content_Item[0]!==j.Content_Item_Record_ID||
      f.Studio_Render_Review_Hold_Active!==true||
      f.Do_Not_Publish!==true||
      str(f.Studio_Render_Review_Hold_ID)!==j.Hold_ID||
      str(f.Studio_Render_Review_Hold_Owner)!==j.Hold_Owner||
      str(f.Studio_Render_Review_Session_ID)!==j.Hold_Owner||
      f.Published_At||f.Publish_Started_At||f.Publish_Locked_At||
      f.Publish_Locked_By||f.Platform_Media_ID||f.Platform_Post_ID||
      f.Scheduled_Post_Date||f.Studio_Scheduled_At||
      f.YouTube_Scheduled_Publish_At||
      !/(image|photo|carousel|gallery|picture)/i.test(state(f.Platform_Output_Type))||
      /^(published|publishing|dispatched)$/i.test(state(f.Publish_Status)))
     fail("GALLERY_CLAIM_PUBLICATION_HOLD_CHANGED");
   const content=await operations.readContent(j.Content_Item_Record_ID);
   if(content?.id!==j.Content_Item_Record_ID||
      !Array.isArray(content?.fields?.Content_Profile)||
      content.fields.Content_Profile.length!==1||
      content.fields.Content_Profile[0]!==j.Profile_Record_ID)
     fail("GALLERY_CLAIM_PROFILE_CHANGED",403);
   let plan,history;
   try{
     plan=JSON.parse(j.Plan_JSON);
     history=JSON.parse(j.Event_History_JSON);
   }catch{fail("GALLERY_CLAIM_LEDGER_INVALID",503);}
   if(!plan||await digest(JSON.stringify(plan))!==j.Plan_SHA256||
      plan.output_id!==body.output_id||
      plan.content_item_id!==j.Content_Item_Record_ID||
      plan.profile_id!==j.Profile_Record_ID||
      plan.original_manifest_sha256!==j.Original_Manifest_SHA256||
      plan.allow_public_publish!==false||plan.auto_approve!==false||
      plan.mutate_original_production_request!==false||
      plan.mutate_sibling_outputs!==false||
      plan.human_intent!=="explicit_button"||
      !Array.isArray(history)||history.length<1||history.length>2||
      history[0]?.event!=="native_gallery_job_created"||
      history[0]?.fingerprint!==j.Request_Fingerprint||
      history[0]?.publication_authorized!==false)
     fail("GALLERY_CLAIM_PLAN_NOT_VERIFIED");
   if(state(j.Job_State)==="claimed"){
     if(history.length!==2||
        history[1]?.event!=="native_gallery_job_claimed"||
        history[1]?.lease_owner!==owner||
        history[1]?.lease_fence!==j.Lease_Fence||
        history[1]?.publication_authorized!==false||
        j.Lease_Owner!==owner||j.Lease_Fence<1)
       fail("GALLERY_JOB_ALREADY_CLAIMED");
     return {ok:true,replay:true,output_id:body.output_id,
       job_id:body.job_id,lease_owner:owner,lease_fence:j.Lease_Fence,
       lease_verified:true,render_started:false,publication_authorized:false};
   }
   if(history.length!==1||state(j.Job_State)!=="held_queued"||str(j.Lease_Owner)||
      j.Lease_Fence!==0||j.Row_Version!==1)
     fail("GALLERY_JOB_NOT_CLAIMABLE");
   const stamp=now();
   if(typeof stamp!=="string"||!/^\d{4}-\d\d-\d\dT/.test(stamp))
     fail("GALLERY_CLOCK_UNAVAILABLE",503);
   await operations.patchJob(job.id,{
     Job_State:"claimed",Lease_Owner:owner,Lease_Fence:1,
     Row_Version:2,Progress_Stage:"claimed",
     Updated_At_UTC:stamp,
     Event_History_JSON:JSON.stringify([...history,{
       event:"native_gallery_job_claimed",lease_owner:owner,
       lease_fence:1,at:stamp,publication_authorized:false}]),
   });
   const [after,outputAfter]=await Promise.all([
     operations.readJob(body.job_id),operations.readOutput(body.output_id),
   ]);
   if(after?.id!==job.id||
      after.fields?.Job_ID!==body.job_id||
      state(after.fields.Job_State)!=="claimed"||
      after.fields.Lease_Owner!==owner||
      after.fields.Lease_Fence!==1||
      after.fields.Row_Version!==2||
      outputAfter?.fields?.Studio_Render_Review_Hold_Active!==true||
      str(outputAfter.fields.Studio_Render_Review_Hold_ID)!==j.Hold_ID||
      str(outputAfter.fields.Studio_Render_Review_Hold_Owner)!==j.Hold_Owner)
     fail("GALLERY_CLAIM_READBACK_UNVERIFIED",503);
   return {ok:true,replay:false,output_id:body.output_id,
     job_id:body.job_id,lease_owner:owner,lease_fence:1,
     lease_verified:true,render_started:false,publication_authorized:false};
 });
}
