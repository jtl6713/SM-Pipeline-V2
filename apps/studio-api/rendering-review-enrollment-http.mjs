/**
 * Server-only/manual Chicago Rendering Review enrollment HTTP boundary.
 *
 * NOT imported by a public Worker route. This deliberately does not enable
 * admission. Safe to connect only after shared publisher dispatch fencing,
 * atomic schedule-vacate ownership, and protected deployment verification.
 *
 * Client supplies only a stable request ID. Session, attempt, role, policy,
 * hold and output authorization are controlled by the trusted server.
 */
import {enrollManualReviewCommand} from "./rendering-review-coordinator.mjs";
import {REVIEW_PILOT, CHICAGO_PROFILE_ID, authorizedManualReviewPolicy} from "./rendering-review-policy.mjs";

const idPattern=/^rec[A-Za-z0-9]{14}$/;
const requestPattern=/^[A-Za-z0-9_-]{8,120}$/;
const keys=new Set(["client_request_id","note"]);
const hashText=bytes=>Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,"0")).join("");
const fail=(status,code,message)=>{const e=new Error(message);e.status=status;e.code=code;throw e;};
const validIdentity=v=>typeof v==="string" && idPattern.test(v);

async function digest(parts) {
  return hashText(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify(parts))));
}

/** Protected flags must ALL be literally "true"; no client-controlled settings. */
export function reviewEnrollmentWriteEnabled(env) {
  return env?.RENDERING_REVIEW_ENROLL_WRITES_ENABLED==="true" &&
    env?.RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED==="true" &&
    env?.RENDERING_REVIEW_INTEGRATION_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED==="true";
}

/**
 * Global rollout is separate from existing Chicago pilot gates. The runner,
 * profile branding, creative-plan compiler and scheduler must be certified
 * before this can ever admit an arbitrary format.
 */
export function globalReviewEnrollmentEnabled(env) {
  return reviewEnrollmentWriteEnabled(env) &&
    env?.RENDERING_REVIEW_GLOBAL_MANUAL_ENABLED==="true" &&
    env?.RENDERING_REVIEW_GLOBAL_RUNNER_VERIFIED==="true";
}

/**
 * Expects the Worker to provide authenticated authorization from Access and
 * Studio membership middleware, output-profile verification against the
 * authoritative linked Content Item, and fully server-owned operations
 * composed from the existing Airtable and atomic scheduling adapters.
 *
 * No client-controlled flag, plan, hold, session or attempt identity is read.
 */
export async function handleRenderingReviewEnrollRequest({
  request,env,authorization,output_id,
  assertWriteRequest,authorizeChicagoMembership,operations,
  trustedAuthorizedProfileIds=null,
}) {
  if(!reviewEnrollmentWriteEnabled(env))
    fail(405,"REVIEW_ENROLL_DISABLED","Manual Rendering Review enrollment is not enabled");
  if(request?.method!=="POST")
    fail(405,"METHOD_NOT_ALLOWED","POST required");
  if(!validIdentity(output_id))
    fail(400,"INVALID_OUTPUT_ID","Exact Platform Output ID required");
  // Exact target comes from Factory; membership, output identity, schedule
  // ownership and hold authority are checked by trusted adapters below.
  const actor=authorization?.user?.record_id;
  if(!authorization?.authenticated||!authorization?.authorized||
     authorization?.permissions?.outputs_review!==true||!validIdentity(actor))
    fail(403,"REVIEW_PERMISSION_REQUIRED","Authenticated Studio reviewer required");
  const globalScope=trustedAuthorizedProfileIds!==null;
  if(typeof assertWriteRequest!=="function"||
     (!globalScope&&typeof authorizeChicagoMembership!=="function"))
    fail(503,"REVIEW_SECURITY_UNAVAILABLE","Trusted Studio write and membership gates required");
  assertWriteRequest(request,env);
  if(typeof operations?.authorizeReview!=="function"||
     typeof operations?.readOutput!=="function")
    fail(503,"REVIEW_OPERATIONS_UNAVAILABLE","Trusted enrollment operations required");
  let policy={...REVIEW_PILOT,enabled:true},scopeIdentity=CHICAGO_PROFILE_ID;
  if(globalScope){
    if(!globalReviewEnrollmentEnabled(env))
      fail(405,"GLOBAL_REVIEW_DISABLED","Global manual Rendering Review is not verified for writes");
    if(!Array.isArray(trustedAuthorizedProfileIds)||
       trustedAuthorizedProfileIds.some(id=>!validIdentity(id)))
      fail(503,"INVALID_AUTHORIZED_SCOPE","Trusted profile list is malformed");
    const output=await operations.readOutput(output_id);
    if(output?.id!==output_id||
       !trustedAuthorizedProfileIds.includes(output.profile_id))
      fail(403,"PROFILE_MEMBERSHIP_REQUIRED","Review output is outside authorized profiles");
    policy=authorizedManualReviewPolicy(trustedAuthorizedProfileIds,{enabled:true});
    scopeIdentity=output.profile_id;
  } else if(await authorizeChicagoMembership(authorization,CHICAGO_PROFILE_ID)!==true)
    fail(403,"CHICAGO_MEMBERSHIP_REQUIRED","Chicago Rendering Review membership required");

  const contentType=String(request.headers?.get("Content-Type")||"").toLowerCase();
  if(!/^application\/json(?:\s*;|$)/.test(contentType))
    fail(415,"JSON_REQUIRED","Only JSON enrollment requests are supported");
  const raw=await request.text();
  if(raw.length>3600)
    fail(413,"BODY_TOO_LARGE","Enrollment request is too large");
  let body;
  try{body=JSON.parse(raw);}catch{fail(400,"INVALID_JSON","Invalid JSON enrollment request");}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).some(key=>!keys.has(key))||
     !requestPattern.test(body.client_request_id||"")||
     typeof body.note!=="string"||!body.note.trim()||body.note.trim().length>3000)
    fail(400,"UNTRUSTED_BODY","Only a stable client request ID is accepted");

  const id=await digest([globalScope?"profile-review-enrollment-v1":"chicago-review-enrollment-v1",
    actor,scopeIdentity,output_id,body.client_request_id]);
  const result=await enrollManualReviewCommand({
    output_id,
    session_id:"rrsession_"+id.slice(0,48),
    original_attempt_id:"rroriginal_"+id.slice(0,40),
    idempotency_key:"rrenroll_"+id.slice(0,64),
    // The source policy remains OFF; only a protected, authenticated request
    // after all five gates may temporarily allow manual coordinator admission.
    policy,
    initial_note:body.note.trim(),actor_id:actor,
    operations,
  });
  return {
    ok:true,replay:result.replay,review_notes_saved:true,
    message:"Request received. Continue the conversation with your Producer in Rendering Review.",
    session_id:result.session.id,
    session_version:result.session.version,
    review_state:result.session.state,
    current_attempt_id:result.session.current_attempt_id,
    review_hold_active:result.session.review_hold.active,
  };
}
