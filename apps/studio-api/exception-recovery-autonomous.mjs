import { savedPublicReceiptMatchesProvider } from "./exception-recovery-actions.mjs";
import { assessRecoveryPreflight } from "./exception-recovery-preflight.mjs";

export const RECOVERY_SIGNATURE = "AUTONOMOUS-PUBLICATION-RECONCILIATION";
const str = (r,k) => String(r?.fields?.[k] ?? "").trim();
const snapshotFields = ["Output_ID","Output_Title","Title_Text","Content_Profile","Platform",
  "Output_Status","Publish_Status","Review_Status","Do_Not_Publish","Test_Run_ID",
  "Platform_Post_ID","YouTube_Video_ID","Platform_Media_ID","Platform_Post_URL",
  "Manual_Published_URL","Published_At","Scheduled_Post_Date","Publish_Locked_By",
  "Publish_Locked_At","Publish_Next_Retry_At","Publish_Attempt_Count","Studio_Publish_Dispatch_Count"];
export const recoverySnapshot = row => Object.fromEntries(
  snapshotFields.map(key => [key,row?.fields?.[key] ?? null]));
const complete = row => str(row,"Output_Status")==="Published" && str(row,"Publish_Status")==="Published";
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
  if(p.cooldown_until) return "provider_cooldown";
  if(p.attempt_limit_reached) return "existing_retry_ceiling";
  if(!Array.isArray(row.fields.Content_Profile) || row.fields.Content_Profile.length !== 1)
    return "ambiguous_profile";
  if(str(row,"Platform") !== "YouTube") return "provider_not_enabled_for_autonomous_correction";
  if(!str(row,"Platform_Post_URL") && !str(row,"Manual_Published_URL"))
    return "saved_public_permalink_required";
  return null;
}
export function receiptBlock(row, receipt, nowMs) {
  if(!receipt?.verified_public || !receipt.ownership_verified) return receipt?.evidence || "public_ownership_unverified";
  if(receipt.platform !== str(row,"Platform") || receipt.profile_id !== row.fields.Content_Profile[0])
    return "provider_profile_mismatch";
  const remote = str(row,"YouTube_Video_ID") || str(row,"Platform_Post_ID");
  if(receipt.remote_id !== remote || (str(row,"YouTube_Video_ID") && str(row,"Platform_Post_ID") &&
     str(row,"YouTube_Video_ID") !== str(row,"Platform_Post_ID"))) return "remote_identity_mismatch";
  const checked = Date.parse(receipt.checked_at);
  if(!Number.isFinite(checked) || nowMs-checked > 60000 || checked > nowMs+1000)
    return "stale_provider_evidence";
  if(!savedPublicReceiptMatchesProvider(row,receipt)) return "saved_permalink_mismatch";
  // Every saved URL must agree; one good URL cannot mask conflicting evidence.
  for(const key of ["Platform_Post_URL","Manual_Published_URL"]) {
    if(str(row,key) && !savedPublicReceiptMatchesProvider({fields:{[key]:str(row,key)}},receipt))
      return "conflicting_saved_permalink";
  }
  const published=Date.parse(receipt.published_at);
  if(!Number.isFinite(published) || published > nowMs) return "provider_publication_time_missing";
  if(str(row,"Published_At") && Date.parse(str(row,"Published_At")) !== published)
    return "conflicting_publication_timestamp";
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
  readState, saveState, now=Date.now, uuid=()=>crypto.randomUUID(),
}) {
  const started=now(), prior=await readState(recordId);
  const row=await readOutput(recordId);
  if(row?.id !== recordId) throw new Error("authoritative_output_unavailable");
  const before=recoverySnapshot(row);
  // A crash after a successful PATCH is resolved from the durable intent.
  if(prior?.pending && complete(row)) {
    const expected=prior.pending.after;
    const preserved=Object.entries(prior.pending.before).filter(([k])=>!(k in expected));
    if(Object.entries(expected).every(([k,v])=>JSON.stringify(row.fields[k])===JSON.stringify(v)) &&
       preserved.every(([k,v])=>JSON.stringify(row.fields[k]??null)===JSON.stringify(v))) {
      const recovered={...prior.pending, outcome:"Corrected", phase:"outcome",
        after:recoverySnapshot(row), corrected_at:new Date(now()).toISOString(),
        duration_ms:now()-Date.parse(prior.pending.detected_at),
        reason:"authoritative_readback_after_restart"};
      await appendAudit(recovered);
      await saveState(recordId,{...prior,pending:null,terminal:true,last:recovered});
      return recovered;
    }
  }
  if(complete(row) && !prior?.pending) return {outcome:"Already Reconciled",record_id:recordId,duplicate:true};
  if(!prior?.pending && (prior?.terminal || Number(prior?.next_at)>now()))
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
  if(denied) return finish(/unavailable|inaccessible|private|scheduled|stale/.test(denied)
    ?"Awaiting Verification":"Needs Decision",denied);
  if(!policy.mutate || (!policy.broad && policy.canaryRecord!==recordId))
    return finish("Awaiting Verification","verified_publication_mutation_not_authorized");
  // No cached state may authorize a write after provider latency.
  const current=await readOutput(recordId);
  if(current?.id!==recordId || JSON.stringify(recoverySnapshot(current))!==JSON.stringify(before))
    return finish("Blocked","authoritative_state_changed_during_verification");
  const recheck=recoveryBlock(current,now())||receiptBlock(current,receipt,now());
  if(recheck) return finish("Blocked",recheck);
  const fields={Output_Status:"Published",Publish_Status:"Published"};
  if(!str(current,"Published_At")) fields.Published_At=receipt.published_at;
  if(!str(current,"Platform_Post_URL")) fields.Platform_Post_URL=receipt.permalink;
  const intent={...event,audit_id:attempt+":intent",phase:"intent",outcome:"Awaiting Verification",
    reason:"verified_status_only_write_intent",after:fields};
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
    if(after?.id!==recordId || !Object.entries(fields).every(([k,v])=>after.fields[k]===v) ||
       receiptBlock(after,receipt,now())) throw new Error("readback_unconfirmed");
    return await finish("Corrected","authoritative_airtable_readback_confirmed",{
      after:recoverySnapshot(after),corrected_at:new Date(now()).toISOString()});
  } catch {
    // Keep the intent pending. Never turn a timeout into another PATCH.
    const uncertain={...event,outcome:"Awaiting Verification",reason:"status_write_or_audit_uncertain",
      duration_ms:now()-started,completed_at:new Date(now()).toISOString()};
    await appendAudit({...uncertain,audit_id:attempt+":uncertain"});
    return uncertain;
  }
}
