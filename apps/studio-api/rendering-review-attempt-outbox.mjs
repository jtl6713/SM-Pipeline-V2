/**
 * Exact-attempt commit + durable render intent. Does NOT execute a renderer.
 *
 * This is a staged, OFF-by-default transaction. The Airtable review session
 * is authoritative; related Plan/Attempt/Job rows are recoverable projections
 * of a single committed session event. A retry uses the same idempotency key
 * and repairs missing projections without allocating another attempt.
 *
 * All operations are trusted server adapters, NEVER JSON request attributes.
 */
import {applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";

const record=/^rec[A-Za-z0-9]{14}$/;
const req=/^[A-Za-z0-9_-]{8,120}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const str=x=>String(x??"").trim();
const deny=(code,message,status=409)=>{const e=new Error(message);e.code=code;e.status=status;throw e};
const hex=buffer=>Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,"0")).join("");
async function digest(data){
  return hex(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify(data))));
}
function holdMatches(s,hold,outputId){
  return s?.review_hold?.active===true&&hold?.verified===true&&
    hold?.active===true&&hold.id===s.review_hold.id&&hold.owner===s.id&&
    hold.output_id===outputId;
}
function requireOutput(o,session,manifest,outputId){
  if(o?.id!==outputId||o.profile_id!==session.profile_id||
     o.output_type!==session.output_type||
     o.platform!==(session.platform||(session.profile_id===CHICAGO_PROFILE_ID&&
       session.output_type==="Instagram Reel"?"Instagram":null))||
     o.do_not_publish!==true||o.review_hold_active!==true||
     o.publish_started_at||o.publish_locked_at||o.publish_locked_by||
     o.platform_media_id||o.platform_post_id||o.published_at||
     /^(published|publishing|dispatched)$/i.test(str(o.publish_status)))
    deny("OUTPUT_NOT_HELD","Exact review output must remain held and undispatched");
  const source=(session.attempts||[]).find(a=>a.id===manifest.source_attempt_id);
  const active=(session.attempts||[]).find(a=>a.id===session.current_attempt_id);
  // An exact idempotent retry sees the NEW queued attempt as current, so its
  // previous verified source is necessarily the queued attempt's parent.
  // Allow only that same queued job/plan to repair missing outbox projections.
  const replaySource=session.state==="queued"&&
    session.active_job?.attempt_id===session.current_attempt_id&&
    session.active_job?.plan_hash===session.plan?.hash&&
    active?.parent_id===manifest.source_attempt_id&&
    active?.status==="queued"&&!active?.artifact_id;
  if(!source||
     (manifest.source_attempt_id!==session.current_attempt_id&&!replaySource)||
     (source.number>1&&source.status!=="ready_for_review")||
     source.artifact_id!==manifest.source_artifact_id)
    deny("SOURCE_CHANGED","The current validated review attempt changed since plan freeze");
  // The original Platform Output remains permanently V1 during Rendering
  // Review. Later iterations read the independently validated Attempt MP4;
  // they must not overwrite V1 or assume the latest source is the V1 file.
  if(!str(o.final_file_id)||!str(manifest.source_drive_file_id)||
     (source.number===1&&str(o.final_file_id)!==manifest.source_artifact_id)||
     (source.number>1&&str(o.final_file_id)===manifest.source_artifact_id))
    deny("SOURCE_CHANGED","Original or revised Drive artifact identity changed");
}
export function renderAttemptCommitEnabled(env){
  return env?.RENDERING_REVIEW_ATTEMPT_COMMIT_ENABLED==="true"&&
    env?.RENDERING_REVIEW_RENDER_OUTBOX_VERIFIED==="true"&&
    env?.RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED==="true"&&
    env?.RENDERING_REVIEW_INTEGRATION_VERIFIED==="true"&&
    env?.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED==="true"&&
    env?.RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED==="true";
}

export async function commitReviewAttempt({
  env,output_id,expected_version,plan_version,plan_hash,
  client_request_id,authorization,operations,now=()=>new Date(),
}){
  if(!renderAttemptCommitEnabled(env))
    deny("REVISION_COMMIT_DISABLED","Immutable render-job commits are disabled",405);
  const actor=authorization?.user?.record_id;
  if(!authorization?.authenticated||!authorization?.authorized||
     authorization.permissions?.outputs_review!==true||!record.test(str(actor)))
    deny("REVIEW_PERMISSION_REQUIRED","Authenticated reviewer required",403);
  if(!record.test(str(output_id))||!Number.isSafeInteger(expected_version)||
     expected_version<1||!Number.isSafeInteger(plan_version)||plan_version<1||
     !hashPattern.test(str(plan_hash))||!req.test(str(client_request_id)))
    deny("INVALID_COMMIT","Exact version, frozen plan hash and request ID required",400);
  for(const name of ["authorizeReview","withOutputLock","loadSession","readSession",
    "readHold","readOutput","saveSessionIfVersion",
    "upsertPlanIfAbsent","upsertAttemptIfAbsent","upsertJobIfAbsent",
    "readPlan","readAttempt","readJob"]){
    if(typeof operations?.[name]!=="function")
      deny("INTEGRATION_MISSING","Trusted operation "+name+" unavailable",503);
  }
  if(await operations.authorizeReview(output_id)!==true)
    deny("REVIEW_SCOPE_DENIED","Not authorized for this output",403);
  const fingerprint=await digest(["review-commit-v1",actor,output_id,
    expected_version,plan_version,plan_hash,client_request_id]);
  const keyDigest=await digest(["review-commit-id-v1",actor,output_id,client_request_id]);
  const ids={
    plan_id:"rrplan_"+plan_hash.slice(0,48),
    attempt_id:"rrattempt_"+keyDigest.slice(0,48),
    job_id:"rrjob_"+keyDigest.slice(0,48),
    request_key:"rrcommit_"+keyDigest.slice(0,48),
  };
  const event={
    type:"COMMIT_PLAN",expected_version,
    idempotency_key:ids.request_key,
    fingerprint:"rrfp_"+fingerprint.slice(0,48),
    plan_version,plan_hash,intent:"explicit_button",
    attempt_id:ids.attempt_id,job_id:ids.job_id,at:now().toISOString(),
  };
  return operations.withOutputLock(output_id,async()=>{
    const previous=await operations.loadSession(output_id);
    const currentHold=await operations.readHold(output_id);
    if(!previous||!holdMatches(previous,currentHold,output_id))
      deny("REVIEW_HOLD_LOST","An active authoritative review hold is required");
    const plan=previous.plan;
    const manifest=plan?.immutable_manifest;
    if(!plan||!manifest||plan.hash!==plan_hash||
       plan.version!==plan_version||plan.frozen!==true||
       plan.missing_assets?.length!==0||manifest.output_id!==output_id||
       manifest.profile_id!==previous.profile_id||
       // Historical Chicago V1 plans predate the explicit platform/type
       // bindings. Only that original pilot may use the audited legacy type;
       // all new profile/format plans must carry the exact immutable type.
       (manifest.output_type||(manifest.profile_id===CHICAGO_PROFILE_ID&&
         previous.output_type==="Instagram Reel"?"Instagram Reel":null))!==
         previous.output_type||
       (manifest.platform||(manifest.profile_id===CHICAGO_PROFILE_ID&&
         manifest.output_type==="Instagram Reel"?"Instagram":null))!==
         (previous.platform||(previous.profile_id===CHICAGO_PROFILE_ID&&
           previous.output_type==="Instagram Reel"?"Instagram":null))||
       manifest.source_attempt_id!==plan.source_attempt_id||
       manifest.candidate_hash!==previous.producer_candidate?.hash||
       previous.producer_candidate?.stale===true||
       manifest.allow_platform_upload!==false||
       manifest.allow_public_publish!==false||
       manifest.auto_approve!==false||
       manifest.mutate_original_production_request!==false||
       manifest.mutate_sibling_outputs!==false||
       manifest.media_authority!=="google_drive"||
       !str(manifest.source_drive_file_id))
      deny("PLAN_NOT_VERIFIED","The latest immutable plan and asset/fact gates are required");
    const output=await operations.readOutput(output_id);
    requireOutput(output,previous,manifest,output_id);
    const planned=applyReviewEvent(previous,event);
    if(!planned.replay&&previous.state!=="plan_ready")
      deny("PLAN_NOT_READY","A ready frozen plan and explicit user action are required");
    if(planned.replay&&
       (planned.session.current_attempt_id!==ids.attempt_id||
        planned.session.active_job?.id!==ids.job_id))
      deny("REPLAY_IDENTITY_MISMATCH","Request key is already owned by a different job");

    // Plan projection comes first. If it fails, no state or job was committed.
    await operations.upsertPlanIfAbsent({
      plan_id:ids.plan_id,session_id:previous.id,output_id,
      plan_version,plan_hash,source_attempt_id:manifest.source_attempt_id,
      immutable_manifest:manifest,state:"committed",
    });

    if(!planned.replay){
      const saved=await operations.saveSessionIfVersion({
        output_id,expected_version:previous.version,next:planned.session});
      if(saved!==true)deny("STALE_SESSION","Session changed during commit");
    }
    // Once the authoritative session is queued, an outbox worker/reconciler
    // MAY create the missing projections on retry, but only the exact IDs.
    const actual=await operations.readSession(output_id);
    if(!actual || actual.id!==previous.id ||
       actual.current_attempt_id!==ids.attempt_id ||
       actual.active_job?.id!==ids.job_id||
       actual.active_job?.plan_hash!==plan_hash ||
       actual.state!=="queued" ||!actual.review_hold?.active)
      deny("SESSION_COMMIT_UNVERIFIED","Queued attempt was not independently persisted",503);
    const attempt=(actual.attempts||[]).find(a=>a.id===ids.attempt_id);
    if(!attempt||attempt.number!==actual.latest_attempt_number||
       attempt.job_id!==ids.job_id||attempt.plan_version!==plan_version||
       attempt.status!=="queued"||attempt.artifact_id)
      deny("ATTEMPT_IDENTITY_CONFLICT","Committed attempt identity mismatch",503);
    await operations.upsertAttemptIfAbsent({
      attempt_id:ids.attempt_id,session_id:actual.id,output_id,
      attempt_number:attempt.number,parent_attempt_id:attempt.parent_id,
      plan_id:ids.plan_id,plan_version,job_id:ids.job_id,status:"queued",
    });
    await operations.upsertJobIfAbsent({
      job_id:ids.job_id,session_id:actual.id,output_id,
      attempt_id:ids.attempt_id,plan_id:ids.plan_id,
      plan_hash,idempotency_key:ids.request_key,
      state:"queued",progress_stage:"awaiting_isolated_renderer",
    });
    const [planReceipt,attemptReceipt,jobReceipt,finalHold]=await Promise.all([
      operations.readPlan(ids.plan_id),
      operations.readAttempt(ids.attempt_id),
      operations.readJob(ids.job_id),
      operations.readHold(output_id),
    ]);
    if(planReceipt?.plan_hash!==plan_hash||
       planReceipt?.session_id!==actual.id||
       attemptReceipt?.job_id!==ids.job_id||
       attemptReceipt?.attempt_number!==attempt.number||
       jobReceipt?.attempt_id!==ids.attempt_id||
       jobReceipt?.plan_hash!==plan_hash||
       jobReceipt?.state!=="queued"||
       !holdMatches(actual,finalHold,output_id))
      deny("OUTBOX_READBACK_FAILED","One or more immutable render intent records were not verified",503);
    return {ok:true,replay:planned.replay,
      output_id,session_id:actual.id,session_version:actual.version,
      attempt_id:ids.attempt_id,attempt_number:attempt.number,
      job_id:ids.job_id,job_state:"queued",
      hold_active:true,render_started:false,
      publish_approved:false,public_post_created:false};
  });
}
