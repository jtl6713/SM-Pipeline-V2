import { savedPublicReceiptMatchesProvider } from "./exception-recovery-actions.mjs";
import { assessRecoveryPreflight } from "./exception-recovery-preflight.mjs";

export const RECOVERY_SIGNATURE = "AUTONOMOUS-PUBLICATION-RECONCILIATION";
 // Missing account/channel/transport settings are verification dependencies,
 // not evidence that the previously uploaded post is unsafe or unpublished.
 // They may be reprobed after an operator fixes the config without requiring
 // an administrator to clear a terminal "Needs Decision" flag.
 const RETRYABLE_PROVIDER_CONFIG = new Set([
   "expected_profile_channel_not_configured",
   "profile_instagram_account_not_configured",
   "profile_instagram_token_not_configured",
   "profile_service_auth_missing",
 ]);
 // An already-uploaded YouTube ID can exist before processing completes.
 // Reprobe the same ID after cooldown, never call the publishing/upload stage.
 // Prior versions incorrectly made this temporary provider state terminal.
 const RETRYABLE_PROVIDER_PROCESSING = new Set(["upload_not_processed"]);
const str = (r,k) => String(r?.fields?.[k] ?? "").trim();
// Airtable omits unchecked checkbox values on readback. Only for this known
// checkbox, an omitted value and false are the same stored state.
const readbackMatches = (key, actual, expected) => key === "Publish_Retry_Eligible"
  ? (actual === true) === (expected === true)
  : JSON.stringify(actual ?? null) === JSON.stringify(expected ?? null);
const snapshotFields = ["Output_ID","Output_Title","Title_Text","Content_Item","Content_Profile","Platform",
  "Output_Status","Publish_Status","Review_Status","Do_Not_Publish","Test_Run_ID",
  "Platform_Post_ID","YouTube_Video_ID","Platform_Media_ID","IG_Carousel_Published_Media_ID",
  "IG_Carousel_Published_At","IG_Story_Post_ID","Platform_Output_Type","Studio_Output_Type","Platform_Post_URL",
  "Manual_Published_URL","Published_At","Scheduled_Post_Date","YouTube_Scheduled_Publish_At",
  "YouTube_Privacy_Status","YouTube_Upload_Status","YouTube_Processing_Status","YouTube_Stage",
  "Publish_Retry_Eligible","Publish_Locked_By",
  "Publish_Locked_At","Publish_Next_Retry_At","Publish_Attempt_Count","Studio_Publish_Dispatch_Count"];
export const recoverySnapshot = row => Object.fromEntries(
  snapshotFields.map(key => [key,row?.fields?.[key] ?? null]));
// Delivery completion is distinct from provider public release. Airtable's
// existing "Awaiting Public Release" / "Published Privately" pair closes the
// Studio handoff without fabricating a public publication or timestamp.
const privateStudioHandoff = row =>
  str(row,"Platform")==="YouTube" &&
  str(row,"Output_Status")==="Awaiting Public Release" &&
  str(row,"Publish_Status")==="Published Privately";
const complete = row =>
  (str(row,"Output_Status")==="Published" && str(row,"Publish_Status")==="Published") ||
  privateStudioHandoff(row);

/**
 * A completed private Studio upload is not a completed PUBLIC publication.
 * Only after the exact scheduled release is due may we re-GET the EXISTING
 * channel-owned YouTube video. This predicate never authorizes a provider
 * write, resets a retry, or converts a private video into a public post.
 */
export function publicReleaseCatchupCandidate(row, atMs = Date.now()) {
  if (!privateStudioHandoff(row) || !Number.isFinite(atMs) ||
      str(row,"Review_Status")!=="Approved" || row?.fields?.Do_Not_Publish === true ||
      str(row,"Test_Run_ID") || !str(row,"YouTube_Video_ID") ||
      str(row,"Published_At")) return false;
  const scheduled = Date.parse(str(row,"YouTube_Scheduled_Publish_At") ||
    str(row,"Scheduled_Post_Date"));
  const separateScheduled = Date.parse(str(row,"Scheduled_Post_Date"));
  if (!Number.isFinite(scheduled) || atMs < scheduled) return false;
  // Conflicting Studio and YouTube release clocks require investigation.
  if (Number.isFinite(separateScheduled) && Math.abs(separateScheduled-scheduled)>1000)
    return false;
  return true;
}
export function autonomousRecoveryPolicy(env = {}) {
  const number = (key, fallback, max) => {
    const n = Number(env[key]);
    return Number.isFinite(n) && n > 0 ? Math.min(max,Math.floor(n)) : fallback;
  };
  return {
    inspect:env.PUBLICATION_RECONCILIATION_SCAN_ENABLED === "true",
    // Separate deployment authorization. The administrator action gate is not
    // reinterpreted: this policy cannot enable any administrator action.
    mutate:env.PUBLICATION_RECONCILIATION_ENABLED === "true",
    canaryRecord:String(env.PUBLICATION_RECONCILIATION_CANARY_RECORD || ""),
    broad:env.PUBLICATION_RECONCILIATION_BOUNDED_ENABLED === "true",
    batch:number("PUBLICATION_RECONCILIATION_BATCH_SIZE",2,5),
    intervalMs:number("PUBLICATION_RECONCILIATION_INTERVAL_MINUTES",15,1440)*60000,
    cooldownMs:number("PUBLICATION_RECONCILIATION_COOLDOWN_MINUTES",60,10080)*60000,
    maxAttempts:number("PUBLICATION_RECONCILIATION_MAX_ATTEMPTS",5,20),
  };
}
export function recoveryBlock(row, nowMs) {
  const p=assessRecoveryPreflight(row,{nowMs});
  if(str(row,"Test_Run_ID")) return "test_record";
  if(p.held) return "intentional_hold";
  if(!p.approved) return "approval_changed";
  if(p.lock_active) return "active_publish_lock";
  // Dispatch cooldowns and retry ceilings remain authoritative to the
  // publisher. Status-only reconciliation may close an already-delivered
  // original post after fresh authenticated identity/ownership verification;
  // it never uploads/retries or resets publisher attempt counters.
  if(!Array.isArray(row.fields.Content_Profile) || row.fields.Content_Profile.length !== 1)
    return "ambiguous_profile";
  const platform=str(row,"Platform");
  if(platform==="Instagram") {
    if(/story/i.test(str(row,"Platform_Output_Type")||str(row,"Studio_Output_Type")))
      return "instagram_story_adapter_not_enabled";
    if(!str(row,"Platform_Post_ID") && !str(row,"IG_Carousel_Published_Media_ID"))
      return "published_instagram_media_id_required";
  } else if(platform!=="YouTube") return "provider_not_enabled_for_autonomous_correction";
  return null;
}
export function receiptBlock(row, receipt, nowMs) {
  if(!receipt?.verified_delivery || !receipt.ownership_verified) return receipt?.evidence || "delivery_ownership_unverified";
  if(receipt.platform !== str(row,"Platform") || receipt.profile_id !== row.fields.Content_Profile[0])
    return "provider_profile_mismatch";
  const instagram=str(row,"Platform")==="Instagram";
  const remote=instagram
    ?(str(row,"Platform_Post_ID")||str(row,"IG_Carousel_Published_Media_ID"))
    :(str(row,"YouTube_Video_ID")||str(row,"Platform_Post_ID"));
  const requiredIds=instagram
    ?[str(row,"Platform_Post_ID"),str(row,"IG_Carousel_Published_Media_ID")]
    :[str(row,"YouTube_Video_ID"),str(row,"Platform_Post_ID")];
  if(receipt.remote_id!==remote || new Set(requiredIds.filter(Boolean)).size>1)
    return "remote_identity_mismatch";
  if(instagram && !receipt.verified_public) return "instagram_publication_not_verified";
  const checked = Date.parse(receipt.checked_at);
  if(!Number.isFinite(checked) || nowMs-checked > 60000 || checked > nowMs+1000)
    return "stale_provider_evidence";
  // A failed Studio finalization frequently has no saved permalink at all.
  // The channel-owned exact remote ID and authenticated provider GET establish
  // identity; absent URLs can be recovered, but conflicting URLs still block.
  if((str(row,"Platform_Post_URL") || str(row,"Manual_Published_URL")) &&
     !savedPublicReceiptMatchesProvider(row,receipt)) return "saved_permalink_mismatch";
  // Every saved URL must agree; one good URL cannot mask conflicting evidence.
  for(const key of ["Platform_Post_URL","Manual_Published_URL"]) {
    if(str(row,key) && !savedPublicReceiptMatchesProvider({fields:{[key]:str(row,key)}},receipt))
      return "conflicting_saved_permalink";
  }
  const expectedSchedule=Date.parse(str(row,"YouTube_Scheduled_Publish_At"));
  const actualSchedule=Date.parse(receipt.scheduled_at);
  if(!instagram && !receipt.verified_public && Number.isFinite(expectedSchedule) && (!Number.isFinite(actualSchedule) ||
      Math.abs(actualSchedule-expectedSchedule)>1000)) return "scheduled_handoff_mismatch";
  if(!instagram && !receipt.verified_public && str(row,"Published_At"))
    return "saved_publication_time_conflicts_with_private_delivery";
  if(receipt.verified_public) {
    const published=Date.parse(receipt.published_at);
    if(!Number.isFinite(published) || published > nowMs) return "provider_publication_time_missing";
    if(str(row,"Published_At") && Date.parse(str(row,"Published_At")) !== published)
      return "conflicting_publication_timestamp";
  }
  return null;
}
/**
 * Caller holds the canonical per-output approval lease throughout this function.
 * appendAudit MUST append and read back durable evidence before returning.
 * saveState MUST persist and read back the restart journal before a status write.
 * Only patchStatus can mutate an output. No publisher callback exists.
 */
export async function reconcilePublication({
  recordId, policy, readOutput, verifyRemote, patchStatus, appendAudit,
  readState, saveState, readAudit, now=Date.now, uuid=()=>crypto.randomUUID(),
}) {
  const started=now(), prior=await readState(recordId);
  const row=await readOutput(recordId);
  if(row?.id !== recordId) throw new Error("authoritative_output_unavailable");
  const before=recoverySnapshot(row);
  // A crash after a successful PATCH is resolved from the durable intent.
  if(prior?.pending && complete(row)) {
    const expected=prior.pending.after;
    // The publisher/QA may update processing counters after our PATCH. On a
    // readback retry, compare the fields that THIS transaction intended to
    // write and its immutable provider/Studio identity, not every unrelated
    // snapshot field. Never issue a second PATCH for an uncertain write.
    const identityKeys=["Output_ID","Platform","Content_Item","Content_Profile",
      "Platform_Post_ID","YouTube_Video_ID","Scheduled_Post_Date",
      "YouTube_Scheduled_Publish_At"];
    const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
    const intendedWritten=Object.entries(expected).every(([k,v])=>readbackMatches(k,row.fields[k],v));
    const identityPreserved=identityKeys.every(k=>same(
      row.fields[k],prior.pending.before?.[k]));
    if(intendedWritten && identityPreserved) {
      const recovered={...prior.pending, outcome:"Corrected", phase:"outcome",
        completion_kind:prior.pending.receipt?.verified_public
          ?"public_publication_verified":"studio_delivery_completed",
        after:recoverySnapshot(row), corrected_at:new Date(now()).toISOString(),
        duration_ms:now()-Date.parse(prior.pending.detected_at),
        reason:"authoritative_readback_after_uncertain_write"};
      await appendAudit(recovered);
      await saveState(recordId,{...prior,pending:null,terminal:true,last:recovered});
      return recovered;
    }
  }
  // Legacy canary retries could mark an uncertain write Needs Decision before
  // the original durable Corrected outcome was finalized. Reconcile only the
  // restart journal against that exact independently persisted audit; no PATCH.
  if(prior?.terminal && !prior.pending &&
      prior.last?.reason==="uncertain_write_requires_review" && complete(row) && readAudit) {
    const attempt=String(prior.last.previous_attempt||"");
    if(/^[A-Za-z0-9_-]+$/.test(attempt)) {
      const confirmed=await readAudit("publication-recovery:"+attempt+":outcome");
      const receipt=confirmed?.receipt;
      const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
      const ids=["Output_ID","Platform","Content_Item","Content_Profile","Platform_Post_ID",
        "YouTube_Video_ID","Scheduled_Post_Date","YouTube_Scheduled_Publish_At"];
      const exactIdentity=ids.every(k=>same(row.fields[k],confirmed?.before?.[k]));
      const afterMatches=confirmed?.after &&
        ["Output_Status","Publish_Status","Published_At","Platform_Post_URL",
          "Publish_Retry_Eligible","Publish_Next_Retry_At"]
          .every(k=>readbackMatches(k,row.fields[k],confirmed.after[k]));
      if(confirmed?.outcome==="Corrected" && confirmed?.phase==="outcome" &&
         confirmed.attempt_id===attempt && confirmed.audit_id===attempt+":outcome" &&
         confirmed.record_id===recordId && confirmed.authorization==="deployment" &&
         receipt?.ownership_verified===true && receipt?.verified_delivery===true &&
         receipt?.remote_id===str(row,"YouTube_Video_ID") &&
         receipt?.profile_id===row.fields.Content_Profile?.[0] &&
         exactIdentity && afterMatches) {
        await saveState(recordId,{...prior,pending:null,terminal:true,last:confirmed});
        return {...confirmed,journal_reconciled:true};
      }
    }
  }
  const privateCatchup = publicReleaseCatchupCandidate(row,now());
  // A fresh private delivery remains complete in the current cooldown. Later
  // release verification must not be permanently suppressed by that handoff.
  if(complete(row) && !prior?.pending &&
      (!privateCatchup || Number(prior?.next_at)>now())) {
    // A private public-release probe is still awaiting evidence, not a newly
    // completed publication. Preserve cooldown and do not contact provider.
    if(privateCatchup && prior?.last?.reason === "public_release_not_yet_verified")
      return {outcome:"Awaiting Verification",record_id:recordId,
        reason:"public_release_verification_cooldown",skipped:true};
    return {outcome:"Already Reconciled",record_id:recordId,duplicate:true};
  }
  // Reopen only legacy terminal configuration failures. Once reprobed, a still
  // missing setting becomes a nonterminal, cooldown-limited verification item.
  // All identity mismatches, holds, exhausted attempts and uncertain writes
  // retain their original terminal protection.
  const oldConfigFailure=prior?.terminal && RETRYABLE_PROVIDER_CONFIG.has(prior?.last?.reason)
    && (prior?.attempts||0)<policy.maxAttempts;
  const processingPending=prior?.terminal &&
    RETRYABLE_PROVIDER_PROCESSING.has(prior?.last?.reason) &&
    (prior?.attempts||0)<policy.maxAttempts &&
    !(Number(prior?.next_at)>now());
  // The ONE terminal state that can be re-probed is a verified previous
  // private Studio delivery: it has never proven the eventual public release.
  // Identity conflicts, Needs Decision, uncertain writes and other terminal
  // outcomes cannot be reopened by the public-status catch-up.
  const completedPrivateHandoff = privateCatchup && prior?.terminal &&
    prior?.last?.outcome === "Corrected" &&
    prior?.last?.completion_kind === "studio_delivery_completed";
  if(!prior?.pending && ((prior?.terminal && !oldConfigFailure && !processingPending && !completedPrivateHandoff) ||
      (Number(prior?.next_at)>now() && !oldConfigFailure)))
    return {outcome:prior?.last?.outcome || "Awaiting Verification",record_id:recordId,skipped:true};
  const attempt=uuid();
  const event={attempt_id:attempt,audit_id:attempt+":outcome",record_id:recordId,
    output_id:str(row,"Output_ID"),title:str(row,"Output_Title")||str(row,"Title_Text"),
    profile_id:row.fields.Content_Profile?.[0]||null,platform:str(row,"Platform"),
    category:prior?.pending?"uncertain_previous_write":"publication_state_unverified",
    detected_at:new Date(started).toISOString(),actor:"automated-publication-reconciler",
    authorization:"deployment",before,phase:"outcome"};
  const finish=async(outcome,reason,extra={})=>{
    const result={...event,...extra,outcome,reason,duration_ms:now()-started,
      completed_at:new Date(now()).toISOString()};
    await appendAudit(result);
    await saveState(recordId,{attempts:(prior?.attempts||0)+(reason==="verified_publication_mutation_not_authorized"?0:1),
      next_at:now()+policy.cooldownMs,terminal:outcome==="Corrected"||outcome==="Needs Decision",
      pending:null,last:result});
    return result;
  };
  if(prior?.pending) return finish("Needs Decision","uncertain_write_requires_review",{previous_attempt:prior.pending.attempt_id});
  const block=recoveryBlock(row,now());
  if(block) return finish(["active_publish_lock","provider_cooldown"].includes(block)?"Blocked":"Needs Decision",block);
  if((prior?.attempts||0)>=policy.maxAttempts) return finish("Needs Decision","verification_retry_ceiling");
  let receipt;
  try { receipt=await verifyRemote(row); }
  catch { return finish("Awaiting Verification","provider_network_failure"); }
  event.receipt=receipt;
  const denied=receiptBlock(row,receipt,now());
  if(denied) return finish(RETRYABLE_PROVIDER_CONFIG.has(denied) ||
    RETRYABLE_PROVIDER_PROCESSING.has(denied) ||
    /unavailable|inaccessible|private|scheduled|stale/.test(denied)
    ?"Awaiting Verification":"Needs Decision",denied);
  if(privateCatchup && receipt.verified_public!==true)
    return finish("Awaiting Verification","public_release_not_yet_verified");
  if(!policy.mutate || (!policy.broad && policy.canaryRecord!==recordId))
    return finish("Awaiting Verification","verified_publication_mutation_not_authorized");
  // No cached state may authorize a write after provider latency.
  const current=await readOutput(recordId);
  if(current?.id!==recordId || JSON.stringify(recoverySnapshot(current))!==JSON.stringify(before))
    return finish("Blocked","authoritative_state_changed_during_verification");
  const recheck=recoveryBlock(current,now())||receiptBlock(current,receipt,now());
  if(recheck) return finish("Blocked",recheck);
  // Use the real existing Airtable states. Private/scheduled upload proves
  // Studio delivery, NOT a public publication. Leave Published_At empty until
  // the provider establishes an actual public release.
  const fields=receipt.verified_public
    ? {Output_Status:"Published",Publish_Status:"Published"}
    : {Output_Status:"Awaiting Public Release",
       Publish_Status:"Published Privately",YouTube_Stage:"Complete"};
  // A release catch-up only corrects public status and source-backed receipt.
  // Do not modify publisher retry or cooldown controls on this path.
  if(!privateCatchup) {
    fields.Publish_Retry_Eligible=false;
    fields.Publish_Next_Retry_At=null;
  }
  if(receipt.verified_public && !str(current,"Published_At")) fields.Published_At=receipt.published_at;
  if(receipt.verified_public && !str(current,"Platform_Post_URL"))
    fields.Platform_Post_URL=receipt.permalink;
  const intent={...event,audit_id:attempt+":intent",phase:"intent",outcome:"Awaiting Verification",
    reason:"verified_status_only_write_intent",
    provider_visibility:receipt.summary?.privacy_status||null,after:fields};
  await appendAudit(intent);
  await saveState(recordId,{...prior,pending:intent});
  // Evidence may age while the ledger is being written. Fail closed before PATCH.
  const final=await readOutput(recordId);
  if(final?.id!==recordId || JSON.stringify(recoverySnapshot(final))!==JSON.stringify(before) ||
      receiptBlock(final,receipt,now()) || recoveryBlock(final,now()))
    return finish("Blocked","state_or_evidence_changed_before_write");
  try {
    await patchStatus(final,fields);
    const after=await readOutput(recordId);
    if(after?.id!==recordId || !Object.entries(fields).every(([k,v])=>readbackMatches(k,after.fields[k],v)) ||
       receiptBlock(after,receipt,now())) throw new Error("readback_unconfirmed");
    return await finish("Corrected","authoritative_airtable_readback_confirmed",{
      completion_kind:receipt.verified_public?"public_publication_verified":"studio_delivery_completed",
      provider_visibility:receipt.summary?.privacy_status||null,
      provider_scheduled_at:receipt.scheduled_at||null,
      after:recoverySnapshot(after),corrected_at:new Date(now()).toISOString()});
  } catch {
    // Keep the intent pending. Never turn a timeout into another PATCH.
    const uncertain={...event,outcome:"Awaiting Verification",reason:"status_write_or_audit_uncertain",
      duration_ms:now()-started,completed_at:new Date(now()).toISOString()};
    await appendAudit({...uncertain,audit_id:attempt+":uncertain"});
    return uncertain;
  }
}

