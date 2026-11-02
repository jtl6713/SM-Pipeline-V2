/** #1495 Exact, opt-in native gallery hold enrollment.
 * Does not publish, vacate a date, modify originals, or create a render Job.
 * Uses the existing canonical Worker per-output lock and publisher hold fields.
 * Only eligible UNSCHEDULED, UNDISPATCHED images can acquire a new hold.
 */
import {renderingReviewHoldPresent} from "./rendering-review-publication-hold.mjs";
import {nativeGalleryHasScheduledOccupancy} from "./native-gallery-publisher-gate.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const str=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?str(x.name):str(x);
const deny=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const digest=async x=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(JSON.stringify(x))))].map(b=>b.toString(16).padStart(2,"0")).join("");
export function nativeGalleryEnrollmentEnabled(env){
 return env?.NATIVE_GALLERY_HOLD_ENROLLMENT_ENABLED==="true"&&
        env?.NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED==="true"&&
        env?.NATIVE_GALLERY_PUBLISHER_HOLD_VERIFIED==="true";
}
function validateOutput(o,output_id,content_id){
 const f=o?.fields||{};
 if(o?.id!==output_id||!Array.isArray(f.Content_Item)||
    f.Content_Item.length!==1||f.Content_Item[0]!==content_id)
   deny("GALLERY_HOLD_OUTPUT_CHANGED");
 if(!/(?:image|photo|carousel|gallery|picture)/i.test(choice(f.Platform_Output_Type)))
   deny("GALLERY_HOLD_NOT_NATIVE_IMAGE");
 if(f.Published_At||f.Platform_Post_ID||f.Platform_Post_URL||
    f.Platform_Media_ID||f.Publish_Started_At||
    f.Publish_Locked_At||f.Publish_Locked_By||
    /^(published|publishing|dispatched)$/i.test(choice(f.Publish_Status))||
    /^(published|publishing|dispatched)$/i.test(choice(f.Output_Status)))
   deny("GALLERY_HOLD_DISPATCH_ALREADY_STARTED");
 if(nativeGalleryHasScheduledOccupancy(f))
   deny("GALLERY_HOLD_SCHEDULE_PRESENT");
 return f;
}
export async function enrollNativeGalleryHold({
 request,env,output_id,authorization,
 assertWriteRequest,operations:ops
}={}){
 if(request?.method!=="POST")deny("METHOD_NOT_ALLOWED",405);
 if(!authorization?.authenticated||!authorization?.authorized||
    authorization.permissions?.outputs_review!==true||
    !REC.test(str(authorization.user?.record_id))||
    !REC.test(str(output_id)))
   deny("GALLERY_HOLD_REVIEW_PERMISSION_DENIED",403);
 if(typeof assertWriteRequest!=="function"||
    ["withOutputLock","readOutput","readContent","patchOutput","listJobs"].some(
      name=>typeof ops?.[name]!=="function"))
   deny("GALLERY_HOLD_ADAPTER_UNAVAILABLE",503);
 assertWriteRequest(request,env);
 if(!nativeGalleryEnrollmentEnabled(env))
   deny("GALLERY_HOLD_ENROLLMENT_DISABLED",405);
 if(!/^application\/json(?:\s*;|$)/i.test(str(request.headers?.get("Content-Type"))))
   deny("GALLERY_HOLD_JSON_REQUIRED",415);
 const raw=await request.text();
 if(raw.length>500)deny("GALLERY_HOLD_BODY_TOO_LARGE",413);
 let b;try{b=JSON.parse(raw)}catch{deny("GALLERY_HOLD_JSON_INVALID",400);}
 if(!b||typeof b!=="object"||Array.isArray(b)||
    Object.keys(b).length!==1||!TOKEN.test(str(b.client_request_id)))
   deny("GALLERY_HOLD_REQUEST_INVALID",400);
 const actor=authorization.user.record_id;
 const scope=await digest(["native-gallery-enrollment-v1",output_id,actor,b.client_request_id]);
 const hold_id="nghold_"+scope.slice(0,48);
 const owner="ngsession_"+scope.slice(0,48);
 return ops.withOutputLock(output_id,async()=>{
   const o=await ops.readOutput(output_id);
   const f=o?.fields||{};
   if(o?.id!==output_id||!Array.isArray(f.Content_Item)||
      f.Content_Item.length!==1||!REC.test(str(f.Content_Item[0])))
     deny("GALLERY_HOLD_CONTENT_INVALID");
   const content_id=f.Content_Item[0];
   const content=await ops.readContent(content_id);
   if(content?.id!==content_id||
      !Array.isArray(content?.fields?.Content_Profile)||
      content.fields.Content_Profile.length!==1||
      !REC.test(str(content.fields.Content_Profile[0])))
     deny("GALLERY_HOLD_PROFILE_UNVERIFIED");
   const profile_id=content.fields.Content_Profile[0];
   // The authenticated Worker caller must verify this exact profile scope.
   if(typeof ops.authorizeProfile!=="function"||
      await ops.authorizeProfile(profile_id)!==true)
     deny("GALLERY_HOLD_PROFILE_FORBIDDEN",403);
   validateOutput(o,output_id,content_id);
   const active=renderingReviewHoldPresent(field=>f[field]);
   if(active){
     if(f.Studio_Render_Review_Hold_Active===true&&
        str(f.Studio_Render_Review_Hold_ID)===hold_id&&
        str(f.Studio_Render_Review_Hold_Owner)===owner&&
        str(f.Studio_Render_Review_Session_ID)===owner&&
        f.Do_Not_Publish===true)
       return {ok:true,replay:true,output_id,content_item_id:content_id,
         profile_id,hold_id,hold_owner:owner,hold_verified:true,
         generation_queued:false,publication_authorized:false};
     deny("GALLERY_HOLD_ALREADY_OWNED");
   }
   if(f.Do_Not_Publish===true)
     deny("GALLERY_HOLD_OTHER_PUBLICATION_BLOCK_PRESENT");
   const jobs=await ops.listJobs(output_id);
   if(!Array.isArray(jobs)||jobs.length!==0)
     deny("GALLERY_HOLD_EXISTING_JOB_OR_UNVERIFIED",503);
   await ops.patchOutput(output_id,{
     Do_Not_Publish:true,
     Studio_Render_Review_Hold_Active:true,
     Studio_Render_Review_Hold_ID:hold_id,
     Studio_Render_Review_Hold_Owner:owner,
     Studio_Render_Review_Session_ID:owner,
   });
   const after=await ops.readOutput(output_id);
   const state=validateOutput(after,output_id,content_id);
   if(state.Studio_Render_Review_Hold_Active!==true||
      state.Do_Not_Publish!==true||
      str(state.Studio_Render_Review_Hold_ID)!==hold_id||
      str(state.Studio_Render_Review_Hold_Owner)!==owner||
      str(state.Studio_Render_Review_Session_ID)!==owner)
     deny("GALLERY_HOLD_READBACK_FAILED",503);
   return {ok:true,replay:false,output_id,content_item_id:content_id,
     profile_id,hold_id,hold_owner:owner,hold_verified:true,
     generation_queued:false,publication_authorized:false};
 });
}
