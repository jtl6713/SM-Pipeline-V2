/** #1495 Private gallery original/revised image proxy for authenticated Studio.
 * The user never sees a Google Drive ID, OAuth token, or a public URL.
 * Runner independently reloads held Airtable job and re-verifies bytes.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const ID=/^[A-Za-z0-9_-]{8,120}$/;
const SHA=/^[a-f0-9]{64}$/;
const deny=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
export async function serveNativeGalleryPreview({
 request,env,authorization,output_id,job_id,slide_id,variant,
 readOutput,readContent,readJob,transport=fetch,
}={}){
 if(env?.NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED!=="true")
   deny("GALLERY_PREVIEW_DISABLED",405);
 if(request?.method!=="GET")deny("GALLERY_PREVIEW_READ_ONLY",405);
 if(!authorization?.authenticated||!authorization?.authorized||
    authorization?.permissions?.outputs_review!==true)
   deny("GALLERY_PREVIEW_PERMISSION_DENIED",403);
 if(!REC.test(String(output_id||""))||!ID.test(String(job_id||""))||
    !REC.test(String(slide_id||""))||
    !["original","revised"].includes(variant))
   deny("GALLERY_PREVIEW_IDENTITY_INVALID",400);
 if([readOutput,readContent,readJob].some(fn=>typeof fn!=="function"))
   deny("GALLERY_PREVIEW_AUTHORITY_UNAVAILABLE",503);
 const [output,job]=await Promise.all([readOutput(output_id),readJob(job_id)]);
 const f=output?.fields||{},j=job?.fields||{};
 if(output?.id!==output_id||!REC.test(String(job?.id||""))||
    j.Job_ID!==job_id||j.Output_Record_ID!==output_id||
    !REC.test(String(j.Content_Item_Record_ID||""))||
    !REC.test(String(j.Profile_Record_ID||""))||
    !SHA.test(String(j.Revised_Manifest_SHA256||""))||
    !["ready_for_review","creative_accepted","rejected"].includes(
      typeof j.Job_State==="object"?j.Job_State.name:j.Job_State
    )||
    !Array.isArray(f.Content_Item)||f.Content_Item.length!==1||
    f.Content_Item[0]!==j.Content_Item_Record_ID||
    f.Do_Not_Publish!==true||
    f.Studio_Render_Review_Hold_Active!==true||
    f.Studio_Render_Review_Hold_ID!==j.Hold_ID||
    f.Studio_Render_Review_Hold_Owner!==j.Hold_Owner||
    f.Studio_Render_Review_Session_ID!==j.Hold_Owner||
    f.Published_At||f.Platform_Post_ID||f.Platform_Media_ID||
    f.Publish_Started_At||f.Publish_Locked_At||f.Publish_Locked_By)
   deny("GALLERY_PREVIEW_HELD_JOB_CHANGED");
 const content=await readContent(j.Content_Item_Record_ID);
 if(content?.id!==j.Content_Item_Record_ID||
    !Array.isArray(content?.fields?.Content_Profile)||
    content.fields.Content_Profile.length!==1||
    content.fields.Content_Profile[0]!==j.Profile_Record_ID||
    !Array.isArray(authorization.authorized_profile_ids)||
    !authorization.authorized_profile_ids.includes(j.Profile_Record_ID))
   deny("GALLERY_PREVIEW_FOREIGN_PROFILE",403);
 const base=String(env?.PIPELINE_RUNNER_URL||"").trim();
 const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"").trim();
 let parsed;try{parsed=new URL(base);}catch{deny("GALLERY_PREVIEW_RUNNER_UNAVAILABLE",503);}
 if(parsed.origin!=="https://pipeline.chicagoshining.com"||
    (parsed.pathname!=="/"&&parsed.pathname!=="")||
    parsed.username||parsed.password||parsed.search||parsed.hash||
    secret.length<24)
   deny("GALLERY_PREVIEW_RUNNER_UNAVAILABLE",503);
 const route="/jobs/native-gallery/revision-media/"+
   encodeURIComponent(output_id)+"/"+encodeURIComponent(job_id)+"/"+
   encodeURIComponent(slide_id)+"/"+variant;
 let upstream;
 try{
   upstream=await transport(parsed.origin+route,{
     method:"GET",headers:{"X-Pipeline-Secret":secret,"Accept":"image/png,image/jpeg,image/webp"},
     redirect:"manual",
   });
 }catch{deny("GALLERY_PREVIEW_RUNNER_READ_FAILED",502);}
 const mime=String(upstream?.headers?.get("Content-Type")||"").split(";")[0].toLowerCase();
 if(upstream?.status!==200||
    !["image/png","image/jpeg","image/webp"].includes(mime)){
   try{await upstream?.body?.cancel();}catch{}
   deny("GALLERY_PREVIEW_UNVERIFIED",502);
 }
 const size=Number(upstream.headers.get("Content-Length")||0);
 if((size&&(!Number.isSafeInteger(size)||size>30_000_000))){
   try{await upstream.body?.cancel();}catch{}
   deny("GALLERY_PREVIEW_TOO_LARGE",502);
 }
 return new Response(upstream.body,{status:200,headers:{
   "Content-Type":mime,"Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff",
   "Content-Security-Policy":"default-src 'none'; sandbox",
   "X-Studio-Preview-Source":"held-native-gallery-drive",
 }});
}
