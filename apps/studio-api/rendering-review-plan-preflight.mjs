/**
 * Rendering Review immutable creative-plan preflight; zero writes or render calls.
 *
 * Candidate text is an UNTRUSTED model suggestion. Only server-origin,
 * independent Drive/provenance, source-visual, factual and requirement receipts
 * can promote it to a frozen plan for a later explicit authorization.
 * This module is NOT an enrollment, job dispatch, or publish API.
 */
import {CHICAGO_PROFILE_ID, REVIEW_SCHEMA} from "./rendering-review-policy.mjs";

const str=x=>String(x??"").trim();
const validId=x=>/^[A-Za-z0-9_-]{8,120}$/.test(str(x));
const rec=x=>/^rec[A-Za-z0-9]{14}$/.test(str(x));
function err(code,message){const e=new Error(message);e.code=code;e.status=409;throw e;}
function stable(x){
  if(Array.isArray(x))return x.map(stable);
  if(x&&typeof x==="object")
    return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));
  return x;
}
async function digest(x){
  const bytes=await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify(stable(x))));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
}
function validSession(s){
  if(s?.schema!==REVIEW_SCHEMA||!rec(s.output_id)||
     s.profile_id!==CHICAGO_PROFILE_ID||s.output_type!=="Instagram Reel"||
     !["ready_for_review","discussing","awaiting_assets","plan_ready","revision_failed"].includes(s.state)||
     !s.review_hold?.active||!validId(s.review_hold.id)||
     s.active_job||!validId(s.current_attempt_id))
    err("REVIEW_NOT_EDITABLE","A held Chicago Reel without an active job is required");
  const attempt=(s.attempts||[]).find(a=>a.id===s.current_attempt_id);
  if(!attempt || attempt.status!=="ready_for_review"&&!["discussing","revision_failed"].includes(s.state)||
     !str(attempt.artifact_id))
    err("SOURCE_ATTEMPT_UNVERIFIED","The current source artifact is unavailable");
  const p=s.producer_candidate;
  if(!p||p.stale||p.source_attempt_id!==s.current_attempt_id||
     !/^[a-f0-9]{64}$/.test(str(p.hash))||!p.candidate)
    err("PRODUCER_CANDIDATE_STALE","A fresh model candidate from this source attempt is required");
  return {attempt,p};
}
function receiptFor(requirement,receipts,sourceId,candidateHash){
  return receipts.find(r=>r?.requirement_id===requirement.id&&
    r.candidate_hash===candidateHash&&r.source_attempt_id===sourceId&&
    r.verified===true&&r.authority==="server"&&str(r.provenance));
}
export async function inspectReviewPlan({
  session, source, assets=[],factReceipts=[],requirementReceipts=[],
  visualReceipt=null,
}){
  const {attempt,p}=validSession(session);
  const c=p.candidate;
  if(!source||source.output_id!==session.output_id||
     source.profile_id!==CHICAGO_PROFILE_ID||
     source.artifact_id!==attempt.artifact_id||
     source.attempt_id!==attempt.id||
     !str(source.drive_file_id)||source.canonical_media_authority!=="google_drive")
    err("SOURCE_AUTHORITY_MISSING","Exact, authoritative Drive source evidence required");
  for(const k of ["narration","explanation"])
    if(!str(c[k]))err("CANDIDATE_INCOMPLETE","Producer draft is incomplete");
  for(const k of ["changes","preserve","reuse_asset_ids","timeline","requirements","claims","acceptance_checks"])
    if(!Array.isArray(c[k]))err("CANDIDATE_INCOMPLETE","Structured Producer draft is incomplete");
  if(!c.changes.length||!c.timeline.length||!c.acceptance_checks.length)
    err("CANDIDATE_INCOMPLETE","An actionable script, timeline and acceptance checks are required");
  const blockers=[];
  const need=(kind,description,id)=>{if(!blockers.some(b=>b.id===id))blockers.push({id,kind,description});};
  const resolved=[];
  const references=new Set(c.reuse_asset_ids);
  for(const scene of c.timeline){
    if(!scene||typeof scene!=="object"||!Array.isArray(scene.asset_ids))
      err("TIMELINE_INVALID","Every proposed scene requires an asset list");
    for(const assetId of scene.asset_ids)references.add(assetId);
  }
  for(const assetId of references){
    if(!validId(assetId))err("ASSET_ID_INVALID","Candidate asset identity is malformed");
    const a=assets.find(x=>x?.id===assetId);
    if(!a||a.verified!==true||a.rights_clear!==true||
       !str(a.drive_file_id)||a.canonical_media_authority!=="google_drive"||
       !(a.profile_id===CHICAGO_PROFILE_ID||a.cross_profile_authorized===true)){
      need("asset","Selected media must be independently verified in Drive", "rrasset_"+(await digest([p.hash,assetId])).slice(0,48));
    }else resolved.push({asset_id:a.id,drive_file_id:a.drive_file_id,
      profile_id:a.profile_id,media_type:str(a.media_type),
      rights_receipt_id:str(a.rights_receipt_id)});
  }
  for(const [i,r] of c.requirements.entries()){
    if(!r||!["asset","research","clarification"].includes(r.kind)||
       !str(r.description)||!Array.isArray(r.alternatives))
      err("REQUIREMENT_INVALID","Producer requirement must be specific");
    const id="rrreq_"+(await digest([p.hash,i,r.kind,r.description])).slice(0,48);
    if(!receiptFor({id},requirementReceipts,attempt.id,p.hash))
      need(r.kind,r.description,id);
  }
  for(const [i,claim] of c.claims.entries()){
    if(!claim||!str(claim.claim)||!Array.isArray(claim.source_ids))
      err("FACT_CLAIM_INVALID","Factual claims require an independent source association");
    const receipt=factReceipts.find(r=>r?.claim===claim.claim&&
      r?.source_attempt_id===attempt.id&&r?.candidate_hash===p.hash&&
      r?.authority==="server"&&r?.verified===true&&
      Array.isArray(r?.source_urls)&&r.source_urls.every(x=>str(x).startsWith("https://"))&&
      r.source_urls.length>0&&str(r.verified_at));
    if(!receipt)need("research","Independently verify factual claim: "+claim.claim.slice(0,300),
      "rrfact_"+(await digest([p.hash,i,claim.claim])).slice(0,48));
  }
  if(c.preserve.length&&!(visualReceipt?.verified===true&&
     visualReceipt?.authority==="server"&&
     visualReceipt?.source_attempt_id===attempt.id&&
     visualReceipt?.source_drive_file_id===source.drive_file_id&&
     Array.isArray(visualReceipt?.observed_segments)&&visualReceipt.observed_segments.length>0)){
    need("visual_verification","Verify footage and exact segment(s) that must remain",
      "rrvisual_"+(await digest([p.hash,attempt.id])).slice(0,48));
  }
  const duration=Number(c.timeline.at(-1)?.end_seconds);
  if(!Number.isFinite(duration)||duration<=0||duration>180)
    err("DURATION_INCOMPATIBLE","The Instagram Reel plan must end within 180 seconds");
  const unresolvedResearch=blockers.some(x=>x.kind!=="asset");
  const frozen=!unresolvedResearch;
  const plan={
    plan_version:Number(session.latest_plan_version||0)+1,
    source_attempt_id:attempt.id,source_artifact_id:attempt.artifact_id,
    source_drive_file_id:source.drive_file_id,
    candidate_hash:p.hash,evidence_hash:p.evidence_hash,
    profile_id:CHICAGO_PROFILE_ID,output_id:session.output_id,
    output_type:"Instagram Reel",creative:{
      narration:c.narration,changes:c.changes,preserve:c.preserve,
      timeline:c.timeline,acceptance_checks:c.acceptance_checks,
      target_duration_seconds:duration,
    },
    asset_manifest:resolved,
    factual_receipt_count:factReceipts.filter(r=>r?.verified===true&&
      r?.candidate_hash===p.hash&&r?.source_attempt_id===attempt.id).length,
    blockers,
    media_authority:"google_drive",
    branding_policy:"retain_current_approved",
    allow_platform_upload:false,
    allow_public_publish:false,
    mutate_original_production_request:false,
    mutate_sibling_outputs:false,
    auto_approve:false,
  };
  const planHash=await digest(plan);
  return {ok:true,frozen,ready_to_commit:frozen&&blockers.length===0,
    blockers,plan_hash:planHash,plan,
    // These semantic event fields are passed only by a trusted server adapter
    // after it reads the latest review session under its canonical lock.
    event_preview:{type:"PROPOSE_PLAN",plan_version:plan.plan_version,
      plan_hash:planHash,missing_assets:blockers.map(x=>x.id),
      frozen,acceptance_checks:c.acceptance_checks},
  };
}
