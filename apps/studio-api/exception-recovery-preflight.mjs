import { publishedReceiptRepairReason } from "./approved-past-due-quality.mjs";
import { fb3FinalizeEligible } from "./facebook-photo-finalize-priority.mjs";
/**
 * Read-only recovery preflight. Reads a fresh authoritative Platform Output;
 * does not verify remote publication, mutate any stage or authorize a replay.
 */
const get = (row, name) => row?.fields?.[name] ?? row?.[name];
const str = (row, name) => String(get(row,name) ?? "").trim();
const bool = (row, name) => get(row,name) === true;
const knownDate = (s) => { const n=Date.parse(String(s||""));return Number.isFinite(n)?n:null; };
export const PREFLIGHT_ACTIONS = [
  "verify_publication","resume_processing","retry_failed_stage","reschedule",
  "send_back_to_producer","confirm_manually_published","hold_or_release","resolve_duplicate","archive_delete"
];
export function assessRecoveryPreflight(row, {nowMs=Date.now()}={}) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(row?.id||""))) throw new Error("Valid authoritative output required");
  const held=bool(row,"Do_Not_Publish");
  const approved=str(row,"Review_Status")==="Approved";
  const stage=str(row,"Publish_Status"), outputStatus=str(row,"Output_Status");
  const publicProof=Boolean(str(row,"Published_At")&&str(row,"Platform_Post_URL") || str(row,"Manual_Published_URL"));
  const remoteId=Boolean(str(row,"Platform_Post_ID")||str(row,"Platform_Media_ID")||str(row,"YouTube_Video_ID"));
  const nextRetry=knownDate(str(row,"Publish_Next_Retry_At"));
  const lockAt=knownDate(str(row,"Publish_Locked_At"));
  const locked=Boolean(str(row,"Publish_Locked_By")&&(lockAt==null || nowMs-lockAt<15*60000));
  const attempts=Math.max(Number(str(row,"Publish_Attempt_Count"))||0,Number(str(row,"Studio_Publish_Dispatch_Count"))||0);
  const cooldown=nextRetry!=null&&nextRetry>nowMs;
  const retryExhausted=attempts>=3;
  const testing=Boolean(str(row,"Test_Run_ID"));
  const identityRisk=remoteId&&!publicProof;
  const core=testing?"test_record":held?"intentional_hold":publicProof?"authoritative_publication_receipt":identityRisk?"remote_identity_unverified":locked?"active_publish_lock":cooldown?"provider_cooldown":retryExhausted?"retry_limit":!approved?"approval_missing":"requires_provider_preflight";
  const action={};
  for(const name of PREFLIGHT_ACTIONS) {
    action[name]={can_execute:false,requires_confirmation:true,
      blocked_reason:name==="verify_publication"?"Provider readback adapter not yet linked; this preflight is read-only.":
      (testing?"Test output is excluded from live recovery.":held?"Existing hold must be preserved until separately authorized release.":
       identityRisk?"Saved remote ID may already represent a post; verify provider before another send.":
       locked?"Active publish lock prevents concurrent recovery.":
       cooldown?"Existing provider cooldown remains in force.":
       retryExhausted?"Existing attempt ceiling must not be reset.":
       "Execution adapter requires a fresh authorized, action-specific preflight and audit ledger.")};
  }
  // This phase supports only inspection. No action is inadvertently enabled.
  return {
    status:"read_only",record_id:row.id,output_id:str(row,"Output_ID")||null,
    profile_id:Array.isArray(get(row,"Content_Profile"))?get(row,"Content_Profile")[0]||null:null,
    held,approved,public_receipt_recorded:publicProof,
    remote_identity_exists:remoteId,remote_publication_verified:false,
    provider_receipt_needed:identityRisk||(!publicProof&&!testing),
    lock_active:locked,cooldown_until:cooldown?new Date(nextRetry).toISOString():null,
    attempts,attempt_limit_reached:retryExhausted,category:core,
    fb3_existing_post_eligible:fb3FinalizeEligible(row),
    verified_receipt_status_repair_candidate:publishedReceiptRepairReason(row)===null,
    publish_status:stage||null,output_status:outputStatus||null,
    actions:action,as_of:new Date(nowMs).toISOString(),
  };
}
