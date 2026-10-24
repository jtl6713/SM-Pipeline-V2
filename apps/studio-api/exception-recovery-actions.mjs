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
 // Existing FB3 can mutate only local finalization state for a preexisting post.
 const response=await finalizeExistingPost(current);
 const after=await readOutput(recordId);
 const completed=after?.id===recordId
   && field(after,"Platform_Post_ID")===remote.remote_id
   && field(after,"Output_Status")==="Published"
   && field(after,"Publish_Status")==="Published"
   && Boolean(field(after,"Published_At"))
   && fbUrl(field(after,"Platform_Post_URL"));
 if(!completed) return {
   status:"pending_verification",record_id:recordId,
   reason:response?.skipped||"existing_fb3_finalization_not_yet_verified",
   remote_id:remote.remote_id,
 };
 const durable=await appendLedger(after,{source:"airtable_existing_publication_receipt",post_id:remote.remote_id});
 return {status:"verified_published",record_id:recordId,remote_id:remote.remote_id,
   published_at:field(after,"Published_At"),durable_recovery_recorded:durable?.recorded===true,
   provider_evidence:remote.evidence, no_graph_create:true};
}
