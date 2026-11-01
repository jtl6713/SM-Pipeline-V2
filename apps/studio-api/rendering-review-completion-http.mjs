/**
 * Runner -> Studio Rendering Review exact-attempt completion.
 * Requires the same server-owned lease/launch receipt and publication hold.
 * No publication, schedule or original-output mutation is permitted.
 */
import {mutateReviewSessionCommand} from "./rendering-review-coordinator.mjs";
import {reviewLaunchLedgerEnabled} from "./rendering-review-launch-ledger.mjs";
const exact=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const hex=/^[a-f0-9]{64}$/;
const str=x=>String(x??"").trim();
function deny(code,reason,status=409){const e=new Error(reason);e.code=code;e.status=status;throw e;}
async function hash(s){
  const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(data)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function reviewCompletionEnabled(env){
  return reviewLaunchLedgerEnabled(env)&&
    env?.RENDERING_REVIEW_COMPLETION_ENABLED==="true";
}
async function authorize(request,env){
  const expected=str(env.RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET);
  const supplied=str(request.headers?.get("X-Rendering-Review-Job-Secret"));
  if(expected.length<24||supplied.length!==expected.length)
    deny("RENDER_CALLBACK_UNAUTHORIZED","Protected Runner credential required",403);
  const [a,b]=await Promise.all([hash(expected),hash(supplied)]);
  let different=0;
  for(let k=0;k<a.length;k++)different|=a.charCodeAt(k)^b.charCodeAt(k);
  if(different)deny("RENDER_CALLBACK_UNAUTHORIZED","Protected Runner credential required",403);
}
function events(job){
  let parsed;
  try{parsed=JSON.parse(job?.event_history_json||"[]")}
  catch{deny("RENDER_LEDGER_INVALID","Launch receipt not readable",503);}
  if(!Array.isArray(parsed)||parsed.length>40)
    deny("RENDER_LEDGER_INVALID","Launch receipt not bounded",503);
  const launch=parsed.filter(x=>x?.kind==="review_remotion_launch_receipt");
  const reserved=parsed.filter(x=>x?.kind==="review_remotion_launch_intent");
  if(launch.length!==1||reserved.length!==1||
     launch[0].payload_hash!==reserved[0].payload_hash||
     launch[0].job_id!==reserved[0].job_id||
     launch[0].attempt_id!==reserved[0].attempt_id||
     launch[0].lease_fence!==reserved[0].lease_fence)return null;
  return launch[0];
}
function validateReadyEvidence(b,receipt){
  if(b.stage!=="ready")return;
  const v=b.validation;
  if(!v||typeof v!=="object"||
     !token.test(str(b.artifact_id))||!hex.test(str(v.sha256))||
     !Number.isSafeInteger(v.byte_count)||v.byte_count<100000||
     v.mime_type!=="video/mp4"||v.width!==1080||v.height!==1920||
     typeof v.duration_seconds!=="number"||v.duration_seconds<1||v.duration_seconds>180||
     v.audio_verified!==true||
     v.google_drive_verified!==true||v.render_job_id!==receipt.remotion_job_id||
     !v.google_drive_mime_type||v.google_drive_mime_type!=="video/mp4")
    deny("RENDER_NOT_VALIDATED","A real MP4, audio, dimensions and Drive readback are required for creative review");
}
export async function completeReviewAttempt({request,env,operations,now=()=>new Date()}){
  if(!reviewCompletionEnabled(env))
    deny("REVIEW_COMPLETION_DISABLED","Review completion is disabled",405);
  if(request.method!=="POST")deny("METHOD_NOT_ALLOWED","POST required",405);
  await authorize(request,env);
  if(!/^application\/json(?:\s*;|$)/i.test(str(request.headers.get("Content-Type"))))
    deny("JSON_REQUIRED","JSON request required",415);
  const raw=await request.text();
  if(raw.length>2400)deny("CALLBACK_TOO_LARGE","Render callback too large",413);
  let b;
  try{b=JSON.parse(raw)}catch{deny("INVALID_JSON","Invalid callback JSON",400);}
  const mandatory=["output_id","job_id","attempt_id","plan_hash",
    "lease_owner","lease_fence","stage"];
  const optional=b?.stage==="ready"?["artifact_id","validation"]:[];
  if(!b||typeof b!=="object"||Array.isArray(b)||
     !["started","validating","ready"].includes(b.stage)||
     Object.keys(b).length!==mandatory.length+optional.length||
     Object.keys(b).some(k=>![...mandatory,...optional].includes(k))||
     !exact.test(str(b.output_id))||!token.test(str(b.job_id))||
     !token.test(str(b.attempt_id))||!token.test(str(b.lease_owner))||
     !hex.test(str(b.plan_hash))||
     !Number.isSafeInteger(b.lease_fence)||b.lease_fence<1)
    deny("INVALID_RENDER_CALLBACK","Exact held job, stage and lease are required",400);
  for(const method of ["withOutputLock","readSession","readHold","readOutput",
    "readJob","readAttempt","patchJob","patchAttempt","applyEvent"])
    if(typeof operations?.[method]!=="function")
      deny("REVIEW_COMPLETION_ADAPTER_MISSING","Missing "+method,503);
  return operations.withOutputLock(b.output_id,async()=>{
    const [s,h,o,j,a]=await Promise.all([
      operations.readSession(b.output_id),operations.readHold(b.output_id),
      operations.readOutput(b.output_id),operations.readJob(b.job_id),
      operations.readAttempt(b.attempt_id),
    ]);
    if(!s||s.output_id!==b.output_id||s.profile_id!=="recT2rbKX3MF7cVFU"||
       s.output_type!=="Instagram Reel"||s.review_hold?.active!==true||
       h?.verified!==true||h.active!==true||h.owner!==s.id||
       h.id!==s.review_hold.id||h.output_id!==b.output_id||
       o?.id!==b.output_id||o.profile_id!==s.profile_id||
       o.platform!=="Instagram"||o.output_type!=="Instagram Reel"||
       o.do_not_publish!==true||o.review_hold_active!==true||
       o.publish_started_at||o.publish_locked_at||o.publish_locked_by||
       o.platform_post_id||o.platform_media_id||o.published_at||
       !j||j.output_id!==b.output_id||j.job_id!==b.job_id||
       j.session_id!==s.id||j.attempt_id!==b.attempt_id||
       j.plan_hash!==b.plan_hash||
       !(j.state==="claimed"||(b.stage==="ready"&&j.state==="succeeded"))||
       j.lease_owner!==b.lease_owner||j.lease_fence!==b.lease_fence||
       !a||a.attempt_id!==b.attempt_id||a.session_id!==s.id)
      deny("RENDER_AUTHORITY_CHANGED","Output, session, hold or exact lease is stale");
    const receipt=events(j);
    if(!receipt||receipt.job_id!==b.job_id||
       receipt.attempt_id!==b.attempt_id||
       receipt.plan_hash!==b.plan_hash||
       receipt.lease_owner!==b.lease_owner||
       receipt.lease_fence!==b.lease_fence||
       !token.test(str(receipt.remotion_job_id)))
      deny("RENDER_LAUNCH_UNVERIFIED","Exact reserved one-shot Remotion receipt required");
    validateReadyEvidence(b,receipt);
    const attempt=(s.attempts||[]).find(x=>x.id===b.attempt_id);
    if(!attempt)deny("RENDER_ATTEMPT_MISSING","Active Attempt 2 record is missing");
    // On ambiguous network acknowledgement, never launch or promote a new
    // artifact. Return an idempotent readback of the same completed attempt.
    if(s.state==="ready_for_review"&&attempt.status==="ready_for_review"&&
       b.stage==="ready"&&attempt.artifact_id===b.artifact_id)
      return {ok:true,replay:true,stage:"ready",
        output_id:b.output_id,attempt_id:b.attempt_id,
        artifact_id:b.artifact_id,public_post_created:false};
    if(s.current_attempt_id!==b.attempt_id||
       s.active_job?.id!==b.job_id||
       s.active_job?.plan_hash!==b.plan_hash)
      deny("RENDER_ACTIVE_JOB_STALE","Only the active, held job can report completion");
    const lifecycle={
      started:{from:"queued",event:"RENDER_STARTED",to:"rendering"},
      validating:{from:"rendering",event:"RENDER_VALIDATING",to:"validating"},
      ready:{from:"validating",event:"RENDER_READY",to:"ready_for_review"},
    }[b.stage];
    if(s.state!==lifecycle.from)
      deny("RENDER_STAGE_CONFLICT","Job must complete stages in order");
    const key="rrcomplete_"+(await hash([b.output_id,b.job_id,
      b.lease_fence,b.stage,b.artifact_id||""])) .slice(0,48);
    const event={type:lifecycle.event,job_id:b.job_id,attempt_id:b.attempt_id,
      plan_hash:b.plan_hash,idempotency_key:key,fingerprint:"rrfp_"+key,
      at:now().toISOString(),
      ...(b.stage==="ready"?{validation_passed:true,artifact_id:b.artifact_id}:{})};
    const saved=await operations.applyEvent(b.output_id,event);
    if(saved?.session?.state!==lifecycle.to)
      deny("RENDER_SESSION_NOT_SAVED","Review stage readback mismatch",503);
    const suffix=b.stage==="ready"?{
      Artifact_File_ID:b.artifact_id,
      Artifact_URL:"https://drive.google.com/file/d/"+b.artifact_id+"/view",
      Validation_Evidence_JSON:JSON.stringify(b.validation),
      Attempt_Status:"ready_for_review",
    }:{Attempt_Status:lifecycle.to};
    await operations.patchAttempt(a.record_id,suffix);
    await operations.patchJob(j.record_id,{
      Progress_Stage:b.stage,
      ...(b.stage==="ready"?{Job_State:"succeeded",Progress_Percent:100}:{}),
    });
    const [after,jobAfter,attemptAfter,holdAfter]=await Promise.all([
      operations.readSession(b.output_id),
      operations.readJob(b.job_id),operations.readAttempt(b.attempt_id),
      operations.readHold(b.output_id),
    ]);
    if(after?.state!==lifecycle.to||
       attemptAfter?.status!==lifecycle.to||
       (b.stage==="ready"&&(jobAfter?.state!=="succeeded"||
          attemptAfter.artifact_file_id!==b.artifact_id))||
       holdAfter?.active!==true||holdAfter.owner!==s.id||
       after.review_hold?.active!==true)
      deny("RENDER_COMPLETION_READBACK_FAILED","Render stage projections were not verified",503);
    return {ok:true,replay:false,stage:b.stage,
      output_id:b.output_id,attempt_id:b.attempt_id,
      ...(b.stage==="ready"?{artifact_id:b.artifact_id}:{}),
      public_post_created:false};
  });
}
