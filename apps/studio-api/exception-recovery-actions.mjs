import { publishedReceiptRepairReason } from "./approved-past-due-quality.mjs";
/**
 * Explicitly administrator-approved existing Facebook post finalization.
 * Delegates only to the existing FB3 stage (Graph GET / status reconcile).
 * NEVER dispatch FB0/FB1/FB2, schedule, upload, delete or create remote media.
 */
import {fb3FinalizeEligible} from "./facebook-photo-finalize-priority.mjs";
const field=(r,n)=>String(r?.fields?.[n]??r?.[n]??"").trim();
const fbUrl=(s)=>{
 try{const u=new URL(String(s||""));return u.protocol==="https:"&&/^(?:www\.|m\.)?facebook\.com$/i.test(u.hostname);}catch{return false;}
};
export const FB3_ACTION="finalize_existing_facebook_post";
export function validateFb3Approval(row,{action,confirm_post_id,confirm_output_id}={}) {
  if(action!==FB3_ACTION)return "unsupported_action";
  if(!row?.id||!/^rec[A-Za-z0-9]{14}$/.test(row.id))return "missing_current_output";
  if(!confirm_output_id||String(confirm_output_id)!==field(row,"Output_ID"))return "output_id_confirmation_mismatch";
  if(!confirm_post_id||String(confirm_post_id)!==field(row,"Platform_Post_ID"))return "remote_post_confirmation_mismatch";
  if(!fb3FinalizeEligible(row))return "not_eligible_for_existing_post_finalization";
  return null;
}
export async function executeFb3AdminRecovery({
  recordId, approval, readOutput, verifyRemote, finalizeExistingPost, appendLedger,
}={}){
 if(!/^rec[A-Za-z0-9]{14}$/.test(String(recordId||"")))throw Object.assign(new Error("Invalid output record identity"),{status:400});
 for(const fn of [readOutput,verifyRemote,finalizeExistingPost,appendLedger])
   if(typeof fn!=="function")throw Object.assign(new Error("Safe recovery dependency unavailable"),{status:503});
 // Caller must hold existing Factory/Pipeline per-output approval mutex.
 const current=await readOutput(recordId);
 const block=validateFb3Approval(current,approval);
 if(block){
   // Already reconciled can be idempotent only when exact existing identity
   // and previously verified canonical public URL are both still present.
   if(block==="not_eligible_for_existing_post_finalization"
      && current?.id===recordId
      && String(approval?.confirm_post_id||"")===field(current,"Platform_Post_ID")
      && String(approval?.confirm_output_id||"")===field(current,"Output_ID")
      && field(current,"Publish_Status")==="Published"
      && field(current,"Output_Status")==="Published"
      && field(current,"Published_At") && fbUrl(field(current,"Platform_Post_URL"))){
     return {status:"already_finalized",record_id:recordId,remote_id:field(current,"Platform_Post_ID"),published_at:field(current,"Published_At"),replayed:true};
   }
   return {status:"blocked",reason:block,record_id:recordId};
 }
 const remote=await verifyRemote(current);
 if(!remote?.verified_public||remote.platform!=="Facebook"
   ||remote.remote_id!==field(current,"Platform_Post_ID")
   ||!fbUrl(remote.permalink)){
   return {status:"blocked",reason:remote?.evidence||"remote_publication_not_verified",record_id:recordId};
 }
 // Recheck authoritative state after provider latency; a new hold or lock blocks.
 const beforeStage=await readOutput(recordId);
 const changed=validateFb3Approval(beforeStage,approval);
 if(changed)return {status:"blocked",reason:"state_changed_before_finalization:"+changed,record_id:recordId};
 // Existing FB3 can mutate only local finalization state for a preexisting post.
 const response=await finalizeExistingPost(beforeStage);
 const after=await readOutput(recordId);
 const completed=after?.id===recordId
   && field(after,"Platform_Post_ID")===remote.remote_id
   && field(after,"Output_Status")==="Published"
   && field(after,"Publish_Status")==="Published"
   && Boolean(field(after,"Published_At"))
   && fbUrl(field(after,"Platform_Post_URL"))
   && savedPublicReceiptMatchesProvider(after,remote);
 if(!completed) return {
   status:"pending_verification",record_id:recordId,
   reason:response?.skipped||"existing_fb3_finalization_not_yet_verified",
   remote_id:remote.remote_id,
 };
 let durable={recorded:false};
 try {
   durable=await appendLedger(after,{source:"airtable_existing_publication_receipt",post_id:remote.remote_id});
 } catch {
   // Verified published output is authoritative even if secondary ledger write
   // fails. Never turn this into an HTTP failure inviting another FB3 click.
   durable={recorded:false};
 }
 return {status:"verified_published",record_id:recordId,remote_id:remote.remote_id,
   published_at:field(after,"Published_At"),durable_recovery_recorded:durable?.recorded===true,
   provider_evidence:remote.evidence, no_graph_create:true};
}

export const RECEIPT_REPAIR_ACTION="reconcile_verified_existing_receipt";
const safeHost=(value,platform)=>{
  try {
    const u=new URL(String(value||""));
    if(u.protocol!=="https:")return false;
    const h=u.hostname.toLowerCase();
    if(platform==="Facebook")return h==="facebook.com"||h==="www.facebook.com"||h==="m.facebook.com";
    if(platform==="Instagram")return h==="instagram.com"||h==="www.instagram.com";
    if(platform==="YouTube")return h==="youtube.com"||h==="www.youtube.com"||h==="m.youtube.com"||h==="youtu.be";
    return false;
  }catch{return false;}
};
/**
 * Status-only recovery must prove that the *saved* public receipt refers to
 * the very same post returned by the provider. A trusted host alone is not
 * enough: it could point to an entirely different published item.
 *
 * URL variants are deliberately conservative. Ambiguous/mismatched links
 * require manual investigation rather than a speculative status repair.
 */
function canonicalPublicReceipt(value, platform) {
  if (!safeHost(value,platform)) return null;
  let u;
  try { u=new URL(value); } catch { return null; }
  if(u.username||u.password||(u.port&&u.port!=="443"))return null;
  if(platform==="YouTube"){
    const host=u.hostname.toLowerCase();
    const pieces=u.pathname.split("/").filter(Boolean);
    const id=host==="youtu.be" ? (pieces.length===1?pieces[0]:null)
      : u.pathname==="/watch" ? u.searchParams.get("v")
      : (pieces.length===2&&["shorts","live"].includes(pieces[0])?pieces[1]:null);
    return /^[A-Za-z0-9_-]{11}$/.test(String(id||""))?"youtube:"+id:null;
  }
  const path=u.pathname.replace(/\/+$/,"")||"/";
  if(platform==="Facebook"&&/^\/(?:permalink|story)\.php$/i.test(path)){
    const post=u.searchParams.get("story_fbid");
    const page=u.searchParams.get("id");
    if(!/^\d{6,35}$/.test(String(post||""))||!/^\d{6,35}$/.test(String(page||"")))return null;
    return "facebook.com"+path.toLowerCase()+"?story_fbid="+post+"&id="+page;
  }
  // Query strings cannot establish another identity for ordinary post paths.
  // Avoid comparing fbclid/utm trackers, but require an exact path match.
  return (platform==="Facebook"?"facebook.com":"instagram.com")+path;
}
function savedPublicReceiptMatchesProvider(row,remote) {
  const exact=canonicalPublicReceipt(remote?.permalink,remote?.platform);
  return Boolean(exact&&["Platform_Post_URL","Manual_Published_URL"].some(
    name=>canonicalPublicReceipt(field(row,name),remote.platform)===exact));
}
const currentRemoteId=(row)=>{
 const p=field(row,"Platform");
 return p==="YouTube" ? field(row,"YouTube_Video_ID")||field(row,"Platform_Post_ID")
   : p==="Instagram" ? field(row,"Platform_Media_ID")||field(row,"Platform_Post_ID")
   : field(row,"Platform_Post_ID");
};
export function validateApprovedReceiptRepair(row, approval) {
 if(approval?.action!==RECEIPT_REPAIR_ACTION)return "unsupported_action";
 if(!row?.id||!/^rec[A-Za-z0-9]{14}$/.test(row.id))return "missing_current_output";
 const output=field(row,"Output_ID");
 if(!output||String(approval?.confirm_output_id||"")!==output)return "output_id_confirmation_mismatch";
 const remote=currentRemoteId(row);
 if(!remote||String(approval?.confirm_post_id||"")!==remote)return "remote_post_confirmation_mismatch";
 const reason=publishedReceiptRepairReason(row);
 if(reason)return reason;
 if(!safeHost(field(row,"Platform_Post_URL")||field(row,"Manual_Published_URL"),field(row,"Platform")))
   return "trusted_saved_public_url_required";
 return null;
}
/**
 * Existing QA-PUBLISH-001 status-only repair, scoped to one verified remote ID.
 * The caller must own the pre-existing output approval lease. No new post is made.
 */
export async function executeApprovedReceiptRepair({recordId,approval,readOutput,verifyRemote,patchStatus,appendLedger}={}) {
 if(!/^rec[A-Za-z0-9]{14}$/.test(String(recordId||"")))throw Object.assign(new Error("Invalid output record ID"),{status:400});
 for(const fn of [readOutput,verifyRemote,patchStatus,appendLedger])
   if(typeof fn!=="function")throw Object.assign(new Error("Safe receipt repair dependency unavailable"),{status:503});
 const current=await readOutput(recordId);
 const reason=validateApprovedReceiptRepair(current,approval);
 if(reason)return {status:"blocked",reason,record_id:recordId};
 const receipt=await verifyRemote(current);
 if(!receipt?.verified_public||receipt.remote_id!==currentRemoteId(current)
    ||receipt.platform!==field(current,"Platform")
    ||!safeHost(receipt.permalink,receipt.platform))
   return {status:"blocked",reason:receipt?.evidence||"remote_publication_not_verified",record_id:recordId};
 // Recheck after provider latency. A new hold, lock, approval change or
 // cleared publication receipt must never permit a stale status repair.
 const beforeWrite=await readOutput(recordId);
 const changed=validateApprovedReceiptRepair(beforeWrite,approval);
 if(changed)return {status:"blocked",reason:"state_changed_before_repair:"+changed,record_id:recordId};
 if(!savedPublicReceiptMatchesProvider(beforeWrite,receipt))
   return {status:"blocked",reason:"saved_public_receipt_provider_permalink_mismatch",record_id:recordId};
 // QA-PUBLISH-001 required a saved public receipt plus approved state.
 await patchStatus(beforeWrite,{
   Output_Status:"Published",Publish_Status:"Published",Publish_Retry_Eligible:false,
   Publish_Next_Retry_At:null,
 });
 const after=await readOutput(recordId);
 const complete=after?.id===recordId&&currentRemoteId(after)===receipt.remote_id
   &&field(after,"Output_Status")==="Published"
   &&field(after,"Publish_Status")==="Published"
   &&field(after,"Published_At")
   &&savedPublicReceiptMatchesProvider(after,receipt);
 if(!complete)return {status:"pending_verification",record_id:recordId,reason:"authoritative_status_readback_not_confirmed"};
 let logged={recorded:false};
 try{
   logged=await appendLedger(after,{source:"airtable_existing_publication_receipt",post_id:receipt.remote_id});
 }catch{
   // Status repair committed; do not re-run because a secondary ledger failed.
   logged={recorded:false};
 }
 return {status:"verified_published",record_id:recordId,remote_id:receipt.remote_id,
   provider_evidence:receipt.evidence,durable_recovery_recorded:logged?.recorded===true,
   no_new_post:true};
}
