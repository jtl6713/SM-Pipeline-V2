/**
 * Internal Chicago Renderer job claim. Default OFF, no Remotion call.
 * A claim binds an existing queued Job to a positive lease fence and one
 * Runner-owned request under the canonical per-output R2 approval lock.
 * Session and Platform Output remain authoritative; no automatic takeover.
 */
const rec=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const txt=x=>String(x??"").trim();
const deny=(code,message,status=409)=>{const e=new Error(message);e.code=code;e.status=status;throw e};
export function reviewRendererJobClaimEnabled(env){
  return env?.RENDERING_REVIEW_JOB_CLAIM_ENABLED==="true" &&
    env?.RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_INTEGRATION_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED==="true";
}
async function hexDigest(data){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(data));
  return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
}
async function authenticate(request,env){
  const secret=txt(env?.RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET);
  const supplied=txt(request?.headers?.get("X-Rendering-Review-Job-Secret"));
  if(secret.length<24||supplied.length!==secret.length)
    deny("RENDER_AUTH_DENIED","Internal render consumer token required",403);
  // Hash both strings and compare all digest bytes, never short-circuit.
  const [a,b]=await Promise.all([hexDigest(secret),hexDigest(supplied)]);
  let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  if(mismatch!==0)deny("RENDER_AUTH_DENIED","Internal render consumer token required",403);
}
function assertHeld(session,hold,output,job,outputId,jobId){
  if(session?.output_id!==outputId||!rec.test(txt(session.profile_id))||
     !txt(session.output_type)||
     session.state!=="queued"||session.review_hold?.active!==true||
     session.current_attempt_id!==job?.attempt_id||
     session.active_job?.id!==jobId||
     session.active_job?.plan_hash!==job?.plan_hash||
     hold?.verified!==true||hold?.active!==true||
     hold.owner!==session.id||hold.id!==session.review_hold.id||
     hold.output_id!==outputId||
     output?.id!==outputId||output.profile_id!==session.profile_id||
     output.platform!==(session.platform||
       (session.profile_id==="recT2rbKX3MF7cVFU"&&
        session.output_type==="Instagram Reel"?"Instagram":null))||
     output.output_type!==session.output_type||
     output.review_hold_active!==true||output.publish_locked_by||
     output.publish_started_at||output.publish_locked_at||output.platform_media_id||
     output.platform_post_id||output.published_at||
     /^(published|publishing|dispatched)$/i.test(txt(output.publish_status)))
    deny("RENDER_JOB_AUTHORITY_STALE","Render job no longer owns the exact held profile/output attempt");
}
export async function claimReviewRenderJob({
  request,env,operations,
}){
  if(!reviewRendererJobClaimEnabled(env))
    deny("RENDER_JOB_CLAIM_DISABLED","Review Runner job claim disabled",405);
  if(request?.method!=="POST")deny("METHOD_NOT_ALLOWED","POST required",405);
  await authenticate(request,env);
  if(!/^application\/json(?:\s*;|$)/i.test(txt(request.headers?.get("Content-Type"))))
    deny("JSON_REQUIRED","JSON request required",415);
  const raw=await request.text();
  if(raw.length>500)deny("CLAIM_TOO_LARGE","Job claim body too large",413);
  let body;
  try{body=JSON.parse(raw)}catch{deny("BAD_JSON","Invalid render claim",400)}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).length!==3||
     Object.keys(body).some(x=>!["output_id","job_id","client_request_id"].includes(x))||
     !rec.test(txt(body.output_id))||!token.test(txt(body.job_id))||
     !token.test(txt(body.client_request_id)))
    deny("INVALID_CLAIM","Exact queued job and stable request ID required",400);
  for(const name of ["withOutputLock","readSession","readHold",
    "readOutput","readJob","patchJob"]){
    if(typeof operations?.[name]!=="function")
      deny("CLAIM_ADAPTER_MISSING","Trusted "+name+" adapter unavailable",503);
  }
  const owner="rrrunner_"+(await hexDigest(JSON.stringify([
    "render-job-claim-v1",body.output_id,body.job_id,body.client_request_id,
  ]))).slice(0,48);
  return operations.withOutputLock(body.output_id,async()=>{
    const [s,h,o,j]=await Promise.all([
      operations.readSession(body.output_id),
      operations.readHold(body.output_id),
      operations.readOutput(body.output_id),
      operations.readJob(body.job_id),
    ]);
    if(!j||j.output_id!==body.output_id||j.job_id!==body.job_id||
       j.session_id!==s?.id||j.plan_hash!==s?.active_job?.plan_hash)
      deny("RENDER_JOB_IDENTITY_UNVERIFIED","Exact durable job and plan required");
    assertHeld(s,h,o,j,body.output_id,body.job_id);
    if(j.state==="claimed"){
      if(j.lease_owner!==owner||!Number.isSafeInteger(j.lease_fence)||j.lease_fence<1)
        deny("RENDER_JOB_ALREADY_CLAIMED","A different Runner owns this job");
      return {ok:true,replay:true,output_id:body.output_id,
        job_id:body.job_id,attempt_id:j.attempt_id,
        plan_hash:j.plan_hash,session_id:s.id,
        lease_owner:owner,lease_fence:j.lease_fence,
        lease_verified:true,render_started:false,public_post_created:false};
    }
    if(j.state!=="queued"||txt(j.lease_owner))
      deny("RENDER_JOB_NOT_QUEUED","Only unclaimed queued jobs may be claimed");
    const fence=Number(j.lease_fence||0)+1;
    if(!Number.isSafeInteger(fence)||fence<1||fence>2147483647)
      deny("RENDER_FENCE_INVALID","Lease fence cannot be reserved");
    await operations.patchJob(j.record_id,{
      Job_State:"claimed",Lease_Owner:owner,Lease_Fence:fence,
      Progress_Stage:"claimed",
    });
    const [after,savedHold]=await Promise.all([
      operations.readJob(body.job_id),operations.readHold(body.output_id),
    ]);
    if(after?.record_id!==j.record_id||after.state!=="claimed"||
       after.lease_owner!==owner||after.lease_fence!==fence||
       after.plan_hash!==j.plan_hash||
       savedHold?.verified!==true||savedHold.active!==true||
       savedHold.id!==h.id||savedHold.owner!==s.id)
      deny("RENDER_CLAIM_READBACK_FAILED","Durable Runner claim not verified",503);
    return {ok:true,replay:false,output_id:body.output_id,
      job_id:body.job_id,attempt_id:j.attempt_id,
      plan_hash:j.plan_hash,session_id:s.id,
      lease_owner:owner,lease_fence:fence,
      lease_verified:true,render_started:false,public_post_created:false};
  });
}
