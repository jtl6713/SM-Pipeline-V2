/**
 * Chicago Rendering Review: reviewer's creative acceptance of a verified
 * render. Leaves the publication hold, output schedule, Instagram assets,
 * and posting authority untouched. This is intentionally NOT publish approval.
 */
import {mutateReviewSessionCommand} from "./rendering-review-coordinator.mjs";
import {reviewEnrollmentWriteEnabled} from "./rendering-review-enrollment-http.mjs";
const id=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const fail=(status,code,message)=>{const e=new Error(message);e.status=status;e.code=code;throw e;};
const str=x=>String(x??"").trim();
async function sha(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function reviewCreativeApprovalEnabled(env){
  return env?.RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED==="true"&&
    reviewEnrollmentWriteEnabled(env);
}
export async function acceptReviewCreativeOnly({
  request,env,authorization,output_id,assertWriteRequest,operations
}){
  if(!reviewCreativeApprovalEnabled(env))
    fail(405,"CREATIVE_APPROVAL_DISABLED","Rendering Review creative approval is disabled");
  if(request?.method!=="POST")fail(405,"METHOD_NOT_ALLOWED","POST required");
  const actor=authorization?.user?.record_id;
  if(!id.test(str(actor))||!authorization.authenticated||
     !authorization.authorized||authorization.permissions?.outputs_review!==true)
    fail(403,"REVIEW_PERMISSION_REQUIRED","Authenticated reviewer required");
  if(!id.test(str(output_id)))
    fail(403,"PILOT_SCOPE","Exact Platform Output ID required");
  // Only an authorized, exactly held output and current verified artifact may be accepted.
  if(typeof assertWriteRequest!=="function")fail(503,"WRITE_GUARD_MISSING","Studio write guard required");
  assertWriteRequest(request,env);
  if(!/^application\/json(?:\s*;|$)/i.test(str(request.headers.get("Content-Type"))))
    fail(415,"JSON_REQUIRED","JSON required");
  const raw=await request.text();
  if(raw.length>500)fail(413,"BODY_TOO_LARGE","Review acceptance too large");
  let body;
  try{body=JSON.parse(raw)}catch{fail(400,"INVALID_JSON","Invalid JSON")}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).length!==3||
     Object.keys(body).some(k=>!["expected_version","attempt_id","client_request_id"].includes(k))||
     !Number.isSafeInteger(body.expected_version)||body.expected_version<1||
     !token.test(body.attempt_id||"")||!token.test(body.client_request_id||""))
    fail(400,"INVALID_ACCEPTANCE","Exact attempt, session version and request key required");
  if(typeof operations?.authorizeReview!=="function" ||
     await operations.authorizeReview(output_id)!==true)
    fail(403,"REVIEW_SCOPE_DENIED","Output is not in this reviewer’s authorized profile");
  const session=await operations.readSession(output_id);
  const validSession=Boolean(session&&id.test(str(session.profile_id))&&
    str(session.output_type)&&
    (str(session.platform)||
      (session.profile_id==="recT2rbKX3MF7cVFU"&&session.output_type==="Instagram Reel")));
  // The creative approval may have committed before a Factory handoff
  // timed out. A repeated approval of the SAME current accepted attempt is
  // a read-only replay, not a second approval or another rendering request.
  if(validSession&&
     session.state==="approved"&&
     session.current_attempt_id===body.attempt_id&&
     session.approved_attempt_id===body.attempt_id&&
     body.expected_version<=session.version&&
     (session.review_hold?.active===true||
      session.factory_handoff?.attempt_id===body.attempt_id)){
    return {ok:true,accepted:true,replay:true,attempt_id:body.attempt_id,
      session_version:session.version,
      review_hold_active:session.review_hold.active,
      publication_changed:false,instagram_upload_created:false};
  }
  if(!validSession||session.version!==body.expected_version||
     session.state!=="ready_for_review"||
     session.current_attempt_id!==body.attempt_id||
     session.review_hold?.active!==true)
    fail(409,"STALE_REVIEW","Only the current held render can be accepted");
  const attempt=session.attempts?.find(a=>a.id===body.attempt_id);
  if(!attempt||attempt.status!=="ready_for_review"||
     !str(attempt.artifact_id))
    fail(409,"INVALID_ATTEMPT","Completed, playable attempt required");
  const key=await sha(["review-creative-accept-v1",actor,output_id,body.client_request_id]);
  const result=await mutateReviewSessionCommand({
    output_id,operations,
    event:{
      type:"APPROVE_ATTEMPT",pilot_creative_only:true,
      expected_version:body.expected_version,
      attempt_id:body.attempt_id,artifact_id:attempt.artifact_id,
      unrelated_hold_active:false,
      idempotency_key:"rraccept_"+key.slice(0,64),
      fingerprint:"rrfp_"+(await sha([actor,output_id,body.expected_version,
        body.attempt_id,attempt.artifact_id])),
      at:new Date().toISOString()
    }
  });
  if(result.session?.state!=="approved"||
     result.session?.review_hold?.active!==true||
     result.session?.approved_attempt_id!==body.attempt_id)
    fail(503,"ACCEPTANCE_UNVERIFIED","Creative approval not durably verified");
  return {ok:true,accepted:true,attempt_id:body.attempt_id,
    session_version:result.session.version,review_hold_active:true,
    publication_changed:false,instagram_upload_created:false};
}
