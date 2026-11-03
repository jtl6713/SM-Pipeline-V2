/** #1495 Private native gallery V2 commit, Airtable SoR only.
 * Cannot approve/publish, replace V1, or release holds.
 * The untrusted Runner candidate is checked against a claimed one-shot job;
 * injected trusted verification must INDEPENDENTLY read staged Drive bytes.
 */
import {nativeGalleryLaunchIntentEnabled} from "./native-gallery-launch-ledger.mjs";
import {nativeGalleryHasScheduledOccupancy} from "./native-gallery-publisher-gate.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/,TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const FILE=/^[A-Za-z0-9_-]{20,}$/,SHA=/^[a-f0-9]{64}$/;
const MIME=new Set(["image/png","image/jpeg","image/webp"]);
const txt=x=>String(x??"").trim();
const status=x=>typeof x==="object"&&x!==null?txt(x.name):txt(x);
const deny=(code,http=409)=>{throw Object.assign(new Error(code),{code,status:http});};
const sha=async v=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",
 new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");
async function authorized(request,env){
 const expected=txt(env?.NATIVE_GALLERY_JOB_SHARED_SECRET);
 const actual=txt(request?.headers?.get("X-Native-Gallery-Job-Secret"));
 if(expected.length<24||expected.length!==actual.length)deny("GALLERY_COMMIT_AUTH_DENIED",403);
 const [a,b]=await Promise.all([sha(expected),sha(actual)]);
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 if(mismatch)deny("GALLERY_COMMIT_AUTH_DENIED",403);
}
export function nativeGalleryManifestCommitEnabled(env){
 return nativeGalleryLaunchIntentEnabled(env)&&
   env?.NATIVE_GALLERY_MANIFEST_COMMIT_ENABLED==="true";
}
export async function commitNativeGalleryManifest({request,env,operations:ops,
 now=()=>new Date().toISOString()}={}){
 if(!nativeGalleryManifestCommitEnabled(env))deny("GALLERY_COMMIT_DISABLED",405);
 if(request?.method!=="POST")deny("METHOD_NOT_ALLOWED",405);
 await authorized(request,env);
 if(!/^application\/json(?:\s*;|$)/i.test(txt(request.headers?.get("Content-Type"))))
   deny("GALLERY_COMMIT_JSON_REQUIRED",415);
 const raw=await request.text();
 if(raw.length>25000)deny("GALLERY_COMMIT_BODY_OVERSIZED",413);
 let body;
 try{body=JSON.parse(raw);}catch{deny("GALLERY_COMMIT_INVALID_JSON",400);}
 if(!body||Array.isArray(body)||typeof body!=="object"||
    Object.keys(body).length!==6||
    Object.keys(body).some(k=>!["output_id","job_id","lease_owner",
      "lease_fence","launch_intent_sha256","revision_artifacts"].includes(k))||
    !REC.test(txt(body.output_id))||!TOKEN.test(txt(body.job_id))||
    !TOKEN.test(txt(body.lease_owner))||!Number.isSafeInteger(body.lease_fence)||
    body.lease_fence<1||!SHA.test(txt(body.launch_intent_sha256))||
    !Array.isArray(body.revision_artifacts)||!body.revision_artifacts.length||
    body.revision_artifacts.length>20)
   deny("GALLERY_COMMIT_INPUT_INVALID",400);
 for(const key of ["withOutputLock","readOutput","readContent","readJob","patchJob",
   "verifyRevisedDriveArtifacts"]){
   if(typeof ops?.[key]!=="function")deny("GALLERY_COMMIT_ADAPTER_MISSING",503);
 }
 return ops.withOutputLock(body.output_id,async()=>{
   const [output,job]=await Promise.all([
     ops.readOutput(body.output_id),ops.readJob(body.job_id)]);
   const o=output?.fields||{},j=job?.fields||{};
   if(output?.id!==body.output_id||!REC.test(txt(job?.id))||
      j.Job_ID!==body.job_id||j.Output_Record_ID!==body.output_id||
      !REC.test(txt(j.Profile_Record_ID))||!REC.test(txt(j.Content_Item_Record_ID))||
      !SHA.test(txt(j.Plan_SHA256))||!SHA.test(txt(j.Original_Manifest_SHA256))||
      !SHA.test(txt(j.Request_Fingerprint))||
      j.Lease_Owner!==body.lease_owner||j.Lease_Fence!==body.lease_fence||
      j.Launch_Intent_SHA256!==body.launch_intent_sha256||
      !Array.isArray(o.Content_Item)||o.Content_Item.length!==1||
      o.Content_Item[0]!==j.Content_Item_Record_ID||
      o.Studio_Render_Review_Hold_Active!==true||o.Do_Not_Publish!==true||
      txt(o.Studio_Render_Review_Hold_ID)!==j.Hold_ID||
      txt(o.Studio_Render_Review_Hold_Owner)!==j.Hold_Owner||
      txt(o.Studio_Render_Review_Session_ID)!==j.Hold_Owner||
      !/(image|photo|carousel|gallery|picture)/i.test(status(o.Platform_Output_Type))||
      o.Published_At||o.Platform_Post_ID||o.Platform_Media_ID||
      o.Publish_Started_At||o.Publish_Locked_At||o.Publish_Locked_By||
      /^(published|publishing|dispatched)$/i.test(status(o.Publish_Status))||
      nativeGalleryHasScheduledOccupancy(o))
     deny("GALLERY_COMMIT_HOLD_OR_IDENTITY_CHANGED");
   const content=await ops.readContent(j.Content_Item_Record_ID);
   if(content?.id!==j.Content_Item_Record_ID||
      !Array.isArray(content?.fields?.Content_Profile)||
      content.fields.Content_Profile.length!==1||
      content.fields.Content_Profile[0]!==j.Profile_Record_ID)
     deny("GALLERY_COMMIT_FOREIGN_PROFILE",403);
   let original,plan,history;
   try{
     original=JSON.parse(j.Original_Manifest_JSON);
     plan=JSON.parse(j.Plan_JSON);
     history=JSON.parse(j.Event_History_JSON);
   }catch{deny("GALLERY_COMMIT_LEDGER_INVALID",503);}
   if(!Array.isArray(original)||original.length!==body.revision_artifacts.length||
      !original.length||original.length>20||
      !Array.isArray(plan?.selected)||!plan.selected.length||
      plan.output_id!==body.output_id||
      plan.profile_id!==j.Profile_Record_ID||
      plan.content_item_id!==j.Content_Item_Record_ID||
      plan.original_manifest_sha256!==j.Original_Manifest_SHA256||
      plan.allow_public_publish!==false||plan.auto_approve!==false||
      await sha(JSON.stringify(plan))!==j.Plan_SHA256||
      !Array.isArray(history)||history.length!==3||
      history[2]?.event!=="native_gallery_launch_intent_reserved"||
      history[2]?.payload_hash!==body.launch_intent_sha256||
      history[2]?.lease_owner!==body.lease_owner||
      history[2]?.lease_fence!==body.lease_fence||
      history.some(x=>x?.publication_authorized!==false))
     deny("GALLERY_COMMIT_PLAN_OR_INTENT_INVALID");
   const selected=new Set(plan.selected.map(x=>x.slide_id));
   const allOriginalFiles=new Set(original.map(row=>row.drive_file_id));
   if(selected.size!==plan.selected.length)deny("GALLERY_COMMIT_SELECTED_DUPLICATES");
   let changed=0;
   const ids=new Set(),files=new Set();
   for(let i=0;i<original.length;i++){
     const prev=original[i],next=body.revision_artifacts[i];
     if(!next||typeof next!=="object"||Array.isArray(next)||
        next.slot_id!==prev.slot_id||next.order!==i+1||
        next.output_id!==body.output_id||next.profile_id!==j.Profile_Record_ID||
        next.content_item_id!==j.Content_Item_Record_ID||
        ids.has(next.slot_id)||!FILE.test(txt(next.drive_file_id))||
        files.has(next.drive_file_id)||!SHA.test(txt(next.sha256))||
        !MIME.has(next.mime_type)||!Number.isSafeInteger(next.byte_count)||
        next.byte_count<1024||!Number.isSafeInteger(next.width)||
        !Number.isSafeInteger(next.height)||
        next.width<128||next.height<128||next.width>12000||next.height>12000||
        next.rights_verified!==true||next.watermark_verified!==true)
       deny("GALLERY_COMMIT_ARTIFACT_INVALID");
     ids.add(next.slot_id);files.add(next.drive_file_id);
     if(selected.has(prev.slot_id)){
       if(allOriginalFiles.has(next.drive_file_id)||next.sha256===prev.sha256)
         deny("GALLERY_COMMIT_SELECTED_NOT_REVISED");
       changed++;
     }else if(next.drive_file_id!==prev.drive_file_id||
              next.sha256!==prev.sha256||
              next.mime_type!==prev.mime_type||
              next.width!==prev.width||next.height!==prev.height||
              next.byte_count!==prev.byte_count)
       deny("GALLERY_COMMIT_UNSELECTED_CHANGED");
   }
   if(changed!==selected.size)deny("GALLERY_COMMIT_SELECTED_INCOMPLETE");
   const manifest_sha256=await sha(JSON.stringify(body.revision_artifacts));
   const existing=txt(j.Revised_Manifest_SHA256);
   if(existing||status(j.Job_State)==="ready_for_review"){
     if(existing!==manifest_sha256||
        j.Revised_Manifest_JSON!==JSON.stringify(body.revision_artifacts)||
        status(j.Job_State)!=="ready_for_review")
       deny("GALLERY_COMMIT_EXISTING_MANIFEST_CONFLICT");
     return {ok:true,replay:true,job_id:body.job_id,output_id:body.output_id,
       manifest_sha256,creative_approved:false,factory_approved:false,
       publication_authorized:false};
   }
   if(status(j.Job_State)!=="claimed"||j.Row_Version!==3||
      txt(j.Revised_Manifest_JSON))deny("GALLERY_COMMIT_STATE_NOT_READY");
   const verified=await ops.verifyRevisedDriveArtifacts({
     output_id:body.output_id,profile_id:j.Profile_Record_ID,
     content_item_id:j.Content_Item_Record_ID,
     job_id:body.job_id,manifest_sha256,
     original_artifacts:original,revision_artifacts:body.revision_artifacts,
     selected_slide_ids:[...selected],
   });
   if(verified!==true)deny("GALLERY_COMMIT_DRIVE_BYTES_UNVERIFIED");
   const timestamp=now();
   if(typeof timestamp!=="string"||!/^\d{4}-\d\d-\d\dT/.test(timestamp))
     deny("GALLERY_COMMIT_CLOCK_INVALID",503);
   await ops.patchJob(job.id,{
     Job_State:"ready_for_review",Row_Version:4,
     Revised_Manifest_SHA256:manifest_sha256,
     Revised_Manifest_JSON:JSON.stringify(body.revision_artifacts),
     Completed_Slides:original.length,Total_Slides:original.length,
     Progress_Stage:"ready_for_review",Updated_At_UTC:timestamp,
   });
   const after=await ops.readJob(body.job_id);
   if(after?.id!==job.id||
      status(after.fields?.Job_State)!=="ready_for_review"||
      after.fields.Row_Version!==4||
      after.fields.Revised_Manifest_SHA256!==manifest_sha256||
      after.fields.Revised_Manifest_JSON!==JSON.stringify(body.revision_artifacts)||
      after.fields.Completed_Slides!==original.length)
     deny("GALLERY_COMMIT_READBACK_FAILED",503);
   return {ok:true,replay:false,job_id:body.job_id,output_id:body.output_id,
     manifest_sha256,completed_slides:original.length,
     creative_approved:false,factory_approved:false,publication_authorized:false};
 });
}
