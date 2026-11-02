/**
 * Inactive HTTP boundary for manual Chicago Reel Rendering Review feedback.
 * Publishing, enrollment, scheduling, render jobs and Producer impersonation
 * are expressly outside this endpoint's capability.
 *
 * All three independent protected deployment flags must be explicitly "true"
 * before even parsing a body. Do NOT set them until shared dispatch ownership,
 * manual enrollment, session persistence and the end-to-end pilot are verified.
 */
import { submitManualReviewFeedback } from "./rendering-review-feedback.mjs";
import { producerConversationWritesEnabled } from "./rendering-review-producer-persist.mjs";

const bodyKeys = new Set(["content","expected_version","client_request_id","timestamp_seconds"]);
function reject(status, code, message) {
  const error = new Error(message);error.status=status;error.code=code;throw error;
}
export function reviewFeedbackWriteEnabled(env) {
  return env?.RENDERING_REVIEW_FEEDBACK_WRITES_ENABLED === "true" &&
    env?.RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED === "true" &&
    env?.RENDERING_REVIEW_INTEGRATION_VERIFIED === "true";
}

export async function handleRenderingReviewFeedbackRequest({
  request, env, authorization, output_id, assertWriteRequest, operations,
  in_flight_only = false, conversation_only = false,
}) {
  // Narrow in-flight feedback is enabled only under the existing six-gated
  // Producer rollout, scoped to queued/running/validating by the state policy.
  // All other legacy /messages writes keep their original independent gates.
  if (in_flight_only === true || conversation_only === true ?
      !producerConversationWritesEnabled(env) : !reviewFeedbackWriteEnabled(env))
    reject(405,"REVIEW_WRITES_DISABLED","Rendering Review feedback submissions are not enabled");
  if (request?.method !== "POST")
    reject(405,"METHOD_NOT_ALLOWED","POST required");
  if (!authorization?.authenticated || !authorization?.authorized ||
      authorization?.permissions?.outputs_review !== true ||
      !authorization?.user?.record_id)
    reject(403,"REVIEW_PERMISSION_REQUIRED","Authenticated Studio reviewer required");
  if (typeof assertWriteRequest !== "function")
    reject(503,"WRITE_AUTH_UNAVAILABLE","The existing Studio write security gate is required");
  assertWriteRequest(request,env);
  const contentType=String(request.headers?.get("Content-Type")||"").toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(contentType))
    reject(415,"JSON_REQUIRED","Only JSON feedback submissions are supported");
  const raw=await request.text();
  if(raw.length>7000)reject(413,"BODY_TOO_LARGE","Review feedback request is too large");
  let body;
  try{body=JSON.parse(raw);}catch{reject(400,"INVALID_JSON","Invalid JSON feedback body");}
  if(!body || Array.isArray(body) || typeof body!=="object" ||
     Object.keys(body).some(k=>!bodyKeys.has(k)))
    reject(400,"UNTRUSTED_BODY","Only literal feedback, version, request ID and timestamp are accepted");
  const result=await submitManualReviewFeedback({
    output_id,content:body.content,expected_version:body.expected_version,
    client_request_id:body.client_request_id,
    timestamp_seconds:body.timestamp_seconds===undefined?null:body.timestamp_seconds,
    in_flight_only,conversation_only,operations,
  });
  return {
    ok:true,replay:result.replay,session_version:result.session.version,
    message_count:result.session.messages.length,
    review_hold_active:result.session.review_hold.active,
  };
}
