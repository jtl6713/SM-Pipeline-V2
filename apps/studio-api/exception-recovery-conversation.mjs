/**
 * Durable Exception Recovery Center exchanges (Airtable write authority).
 * This is conversation capture and advice, NOT an instruction executor.
 * Reuses the Studio Airtable adapter, auth and existing Quality Agent classifier.
 */
export const EXCEPTION_MESSAGES_TABLE = "Exception Recovery Messages";
export const RECOVERY_RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
export const RECOVERY_CLIENT_ID = /^[A-Za-z0-9_-]{16,80}$/;
const value = x => String(x ?? "").trim();

export function recoveryIntent(message) {
  const text = value(message).toLowerCase();
  if (/\b(delete|remove|purge|erase)\b/.test(text) && /\b(duplicate|second|copy|render)/.test(text))
    return { intent:"duplicate_removal", risk:"irreversible", requires_approval:true };
  if (/\b(already|manually|i)\b.*\b(published|posted|live)\b/.test(text))
    return { intent:"claimed_publication", risk:"remote_identity", requires_approval:true };
  if (/\b(hold|stop publishing|do not publish)\b/.test(text))
    return { intent:"hold", risk:"policy_change", requires_approval:true };
  if (/\b(release hold|unhold|resume held)\b/.test(text))
    return { intent:"release_hold", risk:"policy_change", requires_approval:true };
  if (/\b(reschedule|schedule|next week|tomorrow)\b/.test(text))
    return { intent:"reschedule", risk:"schedule_change", requires_approval:true };
  if (/\b(rework|repair (the )?video|additional photos|add (a )?clip|producer)\b/.test(text))
    return { intent:"producer_rework", risk:"production_change", requires_approval:true };
  if (/\b(retry|try again|restart|republish|repost)\b/.test(text))
    return { intent:"retry", risk:"duplicate_publication", requires_approval:true };
  if (/\b(verify|check|published\?|already live\?)\b/.test(text))
    return { intent:"verify_publication", risk:"read_only", requires_approval:false };
  return { intent:"investigate", risk:"read_only", requires_approval:false };
}

export function recoveryAgentResponse(intent, diagnosis = "") {
  const recommendation = value(diagnosis).slice(0,800);
  const action = {
    duplicate_removal: "I recorded the duplicate-removal request. A side-by-side comparison and an explicit confirmation are needed before deleting an output or generated renders. Shared source media will be protected.",
    claimed_publication: "I recorded that you believe this was published. Please provide the public post URL. A provider readback must confirm publication before Studio reconciles the output. No second upload is authorized.",
    hold: "I recorded the hold request. The existing publishing state has not changed; an authorized hold action and fresh output preflight are still required.",
    release_hold: "I recorded the release request. The existing hold remains until a fresh preflight and explicit confirmation allow the existing guarded publisher to resume.",
    reschedule: "I recorded the scheduling request. Specify the intended local date and time. Existing reservation locks, profile timezone and blackout windows must be checked before any schedule is changed.",
    producer_rework: "I recorded the requested changes. Production has not restarted. The existing Producer revision path must evaluate assets and render eligibility before beginning rework.",
    retry: "I recorded the retry request. Studio must check provider receipts, remaining attempts, active locks and cooldown before running any existing stage-specific recovery. No repost was started.",
    verify_publication: "I recorded the verification request. A remote provider readback is still required before publication can be confirmed; a saved media ID alone is not proof of a public post.",
    investigate: "I recorded your question. The existing Quality Agent diagnosis is available below. No output state or publishing action has been changed."
  }[intent.intent] || "Request recorded. No publishing or state change was performed.";
  return recommendation ? action + "\n\nExisting Quality Agent recommendation: " + recommendation : action;
}

export function prepareRecoveryConversationMessage({recordId, clientId, message, actor, signature, diagnosis, now = new Date().toISOString()}) {
  if (!RECOVERY_RECORD_ID.test(value(recordId))) throw new Error("Invalid output record identity");
  if (!RECOVERY_CLIENT_ID.test(value(clientId))) throw new Error("Invalid idempotency key");
  const content=value(message);
  if (!content || content.length>2000) throw new Error("Message must contain 1–2000 characters");
  const who=value(actor);
  if (!who || who.length>256) throw new Error("Administrator identity required");
  const at = new Date(now).toISOString();
  const intent=recoveryIntent(content);
  const base="erc:"+recordId+":"+clientId;
  const fields={
    Event_Key:base+":administrator",
    Output_Record_ID:recordId,
    Exception_Signature:value(signature).slice(0,120),
    Role:"administrator",
    Message_Text:content,
    Actor:who,
    Created_At:at,
    Reply_To_Event_Key:"",
    Intent_JSON:JSON.stringify(intent),
  };
  const reply={
    Event_Key:base+":quality_agent",
    Output_Record_ID:recordId,
    Exception_Signature:value(signature).slice(0,120),
    Role:"quality_agent",
    Message_Text:recoveryAgentResponse(intent,diagnosis).slice(0,2000),
    Actor:"studio-quality-agent",
    Created_At:at,
    Reply_To_Event_Key:fields.Event_Key,
    Intent_JSON:JSON.stringify({intent:intent.intent,executed:false,requires_approval:intent.requires_approval}),
  };
  return {idempotency_key:base, intent, records:[{fields},{fields:reply}]};
}

export function normalizeRecoveryConversation(records = []) {
  const seen=new Set(),items=[];
  for(const row of records){
    const f=row?.fields||row;
    const event_key=value(f?.Event_Key);
    if(!event_key.startsWith("erc:")||seen.has(event_key))continue;
    seen.add(event_key);
    items.push({
      event_key,output_record_id:value(f.Output_Record_ID),
      role:value(f.Role),message:value(f.Message_Text),actor:value(f.Actor),
      created_at:value(f.Created_At),reply_to:value(f.Reply_To_Event_Key)||null,
    });
  }
  return items.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.event_key.localeCompare(b.event_key));
}
