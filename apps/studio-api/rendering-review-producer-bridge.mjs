/**
 * Authenticated, strictly read-only Studio -> Pipeline Runner Producer proposal.
 * No conversation persistence, render, approval, scheduling or publishing.
 * Activation requires a separately verified end-to-end implementation.
 */
const recordRe=/^rec[A-Za-z0-9]{14}$/;
const requestRe=/^[A-Za-z0-9_-]{8,120}$/;
const fail=(code,status,message)=>{const e=new Error(message);e.code=code;e.status=status;throw e;};

export function reviewProducerBridgeEnabled(env){
  return env?.RENDERING_REVIEW_PRODUCER_BRIDGE_ENABLED==="true" &&
    env?.RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED==="true" &&
    env?.RENDERING_REVIEW_INTEGRATION_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED==="true";
}

function requireSession(s,hold,outputId,version){
  if(!s||s.output_id!==outputId||s.profile_id!=="recT2rbKX3MF7cVFU"||
     s.output_type!=="Instagram Reel"||s.version!==version||
     !requestRe.test(String(s.id||""))||
     !["ready_for_review","discussing","awaiting_assets","plan_ready","revision_failed"].includes(s.state)||
     s.review_hold?.active!==true||!s.review_hold.id||
     hold?.verified!==true||hold?.active!==true||
     hold.output_id!==outputId||hold.owner!==s.id||
     hold.id!==s.review_hold.id)
    fail("REVIEW_SESSION_STALE",409,"An exact active Chicago review hold and current session are required");
}

async function inspectCurrent(ops,id,version){
  const allowed=await ops.authorizeReview(id);
  if(allowed!==true)fail("REVIEW_SCOPE_DENIED",403,"Output is outside authorized Chicago Reel scope");
  const output=await ops.readOutput(id);
  if(output?.id!==id||output.profile_id!=="recT2rbKX3MF7cVFU"||
     output.platform!=="Instagram"||output.output_type!=="Instagram Reel")
    fail("REVIEW_SCOPE_DENIED",403,"Authoritative output is outside the Chicago Reel pilot");
  if(output.publish_locked_by||output.publish_started_at||output.publish_locked_at||
     output.platform_media_id||output.platform_post_id||output.post_id||
     output.published_at||output.platform_post_url||
     /^(published|publishing|dispatched)$/i.test(String(output.publish_status||"")))
    fail("REVIEW_DISPATCH_STARTED",409,"Publishing ownership or remote provider identity exists");
  const s=await ops.loadSession(id);
  const hold=await ops.readHold(id);
  requireSession(s,hold,id,version);
  return {sessionId:s.id,attemptId:s.current_attempt_id,holdId:hold.id};
}

/**
 * The caller supplies a server-constructed adapter and authenticated reviewer.
 * No request field can assert a model result, publication permission or hold.
 */
export async function handleReviewProducerProposal({
  request,env,authorization,output_id,assertWriteRequest,operations,runnerFetch=fetch,
}){
  if(!reviewProducerBridgeEnabled(env))
    fail("PRODUCER_BRIDGE_DISABLED",405,"Rendering Review Producer is not enabled");
  if(request?.method!=="POST")fail("METHOD_NOT_ALLOWED",405,"POST required");
  if(!authorization?.authenticated||!authorization?.authorized||
     authorization.permissions?.outputs_review!==true||!authorization.user?.record_id)
    fail("REVIEW_PERMISSION_REQUIRED",403,"An authenticated Studio reviewer is required");
  if(typeof assertWriteRequest!=="function")
    fail("WRITE_GATE_MISSING",503,"Existing Studio write security is required");
  assertWriteRequest(request,env);
  if(!recordRe.test(String(output_id||"")))fail("OUTPUT_ID_INVALID",400,"Exact output ID required");
  if(!/^application\/json(?:\s*;|$)/i.test(String(request.headers?.get("Content-Type")||"")))
    fail("JSON_REQUIRED",415,"JSON body required");
  const raw=await request.text();
  if(raw.length>4500)fail("BODY_TOO_LARGE",413,"Producer request too large");
  let body;
  try{body=JSON.parse(raw);}catch{fail("INVALID_JSON",400,"Invalid JSON body");}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).length!==3||
     Object.keys(body).some(k=>!["direction","expected_version","client_request_id"].includes(k))||
     typeof body.direction!=="string"||!body.direction.trim()||
     body.direction.length>3000||
     !Number.isSafeInteger(body.expected_version)||body.expected_version<1||
     !requestRe.test(String(body.client_request_id||"")))
    fail("INVALID_REQUEST",400,"Only direction, expected_version and client_request_id are accepted");

  const base=String(env?.PIPELINE_RUNNER_URL||"").trim().replace(/\/+$/,"");
  const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"").trim();
  if(!/^https:\/\//i.test(base)||!secret)
    fail("RUNNER_UNAVAILABLE",503,"Protected runner connection is unavailable");
  const ops=operations||{};
  for(const name of ["authorizeReview","readOutput","loadSession","readHold","withOutputLock"])
    if(typeof ops[name]!=="function")fail("REVIEW_ADAPTER_MISSING",503,"Trusted review adapter required");

  const pre=await ops.withOutputLock(output_id,()=>inspectCurrent(ops,output_id,body.expected_version));
  let upstream,response;
  try{
    upstream=await runnerFetch(base+"/jobs/rendering-review/propose",{
      method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json",
        "X-Pipeline-Secret":secret},
      body:JSON.stringify({output_id,session_id:pre.sessionId,
        expected_version:body.expected_version,direction:body.direction.trim()}),
      signal:AbortSignal.timeout(125000),
    });
  }catch{
    fail("PRODUCER_CONNECTION_FAILED",503,
      "The private Producer connection failed before a response was received. Your feedback was not saved.");
  }
  try{
    response=await upstream.json();
  }catch{
    fail("PRODUCER_BAD_HTTP_RESPONSE",502,
      "The Producer returned an unreadable response (HTTP "+(Number(upstream.status)||"unknown")+
      "). Your feedback was not saved.");
  }
  if(!upstream.ok||response?.ok!==true){
    // Preserve safe, actionable error categories without exposing credentials,
    // model prompts, internal URLs or provider response bodies to the browser.
    const reason=String(response?.error||"");
    if(upstream.status===409)
      fail("REVIEW_SESSION_STALE",409,"The review changed during this request. Reload the Reel and retry your feedback.");
    if(upstream.status===405&&reason==="producer_proposal_disabled")
      fail("PRODUCER_RUNNER_DISABLED",503,"The private Producer service is not enabled; your feedback was not saved.");
    if(upstream.status===422&&reason==="producer_proposal_invalid")
      fail("PRODUCER_DRAFT_INVALID",502,"The Producer returned an invalid revision proposal. Your feedback was not saved; please retry.");
    if(upstream.status===502&&reason==="producer_model_unavailable")
      fail("PRODUCER_MODEL_UNAVAILABLE",502,"The Producer AI service could not generate a valid reply. Your feedback was not saved; please retry.");
    if(upstream.status===502&&/^producer_model_http_[1-5][0-9][0-9]$/.test(reason))
      fail("PRODUCER_MODEL_HTTP_ERROR",502,
        "The Producer AI service rejected the revision request (provider HTTP "+reason.slice(-3)+
        "). Your feedback was not saved.");
    if(upstream.status===503&&reason==="review_evidence_unavailable")
      fail("PRODUCER_EVIDENCE_UNAVAILABLE",503,"The Producer could not read the saved Reel context. Your feedback was not saved.");
    if(upstream.status===409&&reason==="stale_or_unavailable_review_evidence")
      fail("REVIEW_EVIDENCE_STALE",409,"Saved Reel evidence changed. Reopen the Reel and retry.");
    fail("PRODUCER_UPSTREAM_UNAVAILABLE",502,
      "The private Producer request failed (service status "+upstream.status+"). Your feedback was not saved.");
  }
  if(response.output_id!==output_id||response.session_id!==pre.sessionId||
     response.expected_version!==body.expected_version||
     response.authorization!=="none"||response.render_queued!==false||
     response.publication_changed!==false||
     response.proposal?.candidate_only!==true||
     response.proposal?.requires_fact_validation!==true||
     response.proposal?.visual_inspection_performed!==false)
    fail("PRODUCER_UNTRUSTED_RESPONSE",502,"Runner returned an invalid candidate-only proposal");
  const post=await ops.withOutputLock(output_id,()=>inspectCurrent(ops,output_id,body.expected_version));
  if(post.sessionId!==pre.sessionId||post.attemptId!==pre.attemptId||post.holdId!==pre.holdId)
    fail("REVIEW_SESSION_STALE",409,"Review changed during proposal");
  return {ok:true,output_id,session_id:post.sessionId,
    expected_version:body.expected_version,client_request_id:body.client_request_id,
    proposal:response.proposal,authorization:"none",persisted:false,
    render_queued:false,publication_changed:false};
}
