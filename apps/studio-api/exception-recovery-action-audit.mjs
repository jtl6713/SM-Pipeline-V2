/** Durable, append-only administrative action approvals and outcomes. */
const ID=/^rec[A-Za-z0-9]{14}$/;
const REQ=/^[A-Za-z0-9_-]{16,80}$/;
const ACTIONS=new Set(["finalize_existing_facebook_post","reconcile_verified_existing_receipt"]);
const clean=x=>String(x??"").trim();
export function actionApprovalAudit({record_id,client_request_id,action,output_id,post_id,actor,at=new Date().toISOString()}={}){
 if(!ID.test(clean(record_id)))throw new Error("Invalid action record identity");
 if(!REQ.test(clean(client_request_id)))throw new Error("Stable action request ID required");
 if(!ACTIONS.has(clean(action)))throw new Error("Unrecognized action");
 if(!/^\d+$/.test(clean(output_id))||!/^[A-Za-z0-9_-]{6,70}$/.test(clean(post_id)))throw new Error("Exact output/remote IDs required");
 if(!clean(actor)||clean(actor).length>256)throw new Error("Administrator identity required");
 const key="erc:"+record_id+":"+client_request_id+":action_approved";
 return {
  Event_Key:key,Output_Record_ID:record_id,Exception_Signature:"ADMIN_APPROVED_ACTION",
  Role:"administrator",Message_Text:"Approved "+action+" for output #"+output_id+" and existing remote post "+post_id+". No new posting authorized.",
  Actor:clean(actor),Created_At:new Date(at).toISOString(),
  Reply_To_Event_Key:"",Intent_JSON:JSON.stringify({kind:"approved_action",action,output_id,post_id}),
 };
}
export function actionOutcomeAudit(approval,{status,reason,at=new Date().toISOString()}={}){
 if(!approval?.Event_Key?.endsWith(":action_approved"))throw new Error("Approved action ledger entry required");
 return {
  Event_Key:approval.Event_Key.replace(/:action_approved$/,":action_outcome"),
  Output_Record_ID:approval.Output_Record_ID,
  Exception_Signature:"ADMIN_ACTION_OUTCOME",Role:"quality_agent",
  Message_Text:"Action outcome: "+clean(status).slice(0,80)+(reason?"; "+clean(reason).slice(0,160):"")+". Check provider and Airtable receipts before considering the output published.",
  Actor:"studio-exception-recovery",Created_At:new Date(at).toISOString(),
  Reply_To_Event_Key:approval.Event_Key,Intent_JSON:JSON.stringify({kind:"action_outcome",status:clean(status),reason:clean(reason).slice(0,180)}),
 };
}
