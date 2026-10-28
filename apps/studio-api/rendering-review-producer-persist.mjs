/**
 * Server-only model-to-conversation persistence. Only the trusted Worker may
 * call this AFTER its authenticated, candidate-only Runner response passes
 * the independent post-model session/hold readback. No plan is frozen here.
 */
import {mutateReviewSessionCommand} from "./rendering-review-coordinator.mjs";
const rec=/^rec[A-Za-z0-9]{14}$/;
const keyPattern=/^[A-Za-z0-9_-]{8,120}$/;
const hex=x=>Array.from(new Uint8Array(x),b=>b.toString(16).padStart(2,"0")).join("");
const hash=async value=>hex(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(JSON.stringify(value))));
function deny(code,status,reason){const e=new Error(reason);e.code=code;e.status=status;throw e;}

export function producerConversationWritesEnabled(env){
  return env?.RENDERING_REVIEW_PRODUCER_WRITES_ENABLED==="true" &&
    env?.RENDERING_REVIEW_PRODUCER_BRIDGE_ENABLED==="true" &&
    env?.RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED==="true" &&
    env?.RENDERING_REVIEW_INTEGRATION_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED==="true";
}

export async function persistReviewProducerCandidate({
  env,output_id,expected_version,client_request_id,direction,
  proposal,authorization,operations,now=()=>new Date(),
}){
  if(!producerConversationWritesEnabled(env))
    deny("PRODUCER_WRITES_DISABLED",405,"Producer conversation persistence is disabled");
  const actor=authorization?.user?.record_id;
  if(!authorization?.authenticated||!authorization?.authorized||
     authorization.permissions?.outputs_review!==true||
     typeof actor!=="string"||!rec.test(actor))
    deny("REVIEW_PERMISSION_REQUIRED",403,"Authenticated reviewer required");
  if(!rec.test(output_id)||!Number.isSafeInteger(expected_version)||expected_version<1||
     !keyPattern.test(String(client_request_id||""))||
     typeof direction!=="string"||!direction.trim()||direction.trim().length>3000)
    deny("PRODUCER_INPUT_INVALID",400,"Exact request, session version and direction required");
  if(!proposal||proposal.candidate_only!==true||
     proposal.requires_fact_validation!==true||
     proposal.visual_inspection_performed!==false||
     !/^[a-f0-9]{64}$/.test(proposal.candidate_hash||"")||
     !/^[a-f0-9]{64}$/.test(proposal.evidence_hash||"")||
     !proposal.candidate||typeof proposal.candidate!=="object"||
     typeof proposal.candidate.explanation!=="string"||
     !proposal.candidate.explanation.trim())
    deny("UNTRUSTED_PRODUCER_CANDIDATE",502,"Model proposal cannot grant execution authority");
  const explanation=proposal.candidate.explanation.trim();
  const summary=explanation.length>2950?explanation.slice(0,2946)+"…":explanation;
  const requestId=await hash(["render-review-producer-v1",actor,output_id,client_request_id]);
  const fingerprint=await hash(["render-review-producer-v1",actor,output_id,
    expected_version,direction.trim()]);
  const event={
    type:"PRODUCER_CANDIDATE",
    idempotency_key:"rrproducer_"+requestId.slice(0,64),
    fingerprint:"rrfp_"+fingerprint,
    user_message_id:"rruser_"+requestId.slice(0,48),
    producer_message_id:"rrmodel_"+requestId.slice(0,48),
    expected_version,direction:direction.trim(),summary,
    candidate:proposal.candidate,candidate_hash:proposal.candidate_hash,
    evidence_hash:proposal.evidence_hash,at:now().toISOString(),
  };
  // The coordinator owns the canonical output lock, hold readback, versioned
  // Airtable write and independent persistence verification.
  const result=await mutateReviewSessionCommand({output_id,event,operations});
  return {ok:true,replay:result.replay,persisted:true,
    session_version:result.session.version,session_id:result.session.id,
    message_count:result.session.messages.length,
    candidate_hash:proposal.candidate_hash,
    authorization:"none",render_queued:false,publication_changed:false};
}
