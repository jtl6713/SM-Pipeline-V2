const RECOVERY_SIGNATURE = "AUTONOMOUS-PUBLICATION-RECONCILIATION";
export function recoveryAuditFields(event) {
  if(!/^rec[A-Za-z0-9]{14}$/.test(event.record_id) ||
    !/^[A-Za-z0-9_-]+:(intent|outcome|uncertain)$/.test(event.audit_id))
    throw new Error("invalid_recovery_audit_identity");
  return {
    Event_Key:"publication-recovery:"+event.audit_id,Output_Record_ID:event.record_id,
    Exception_Signature:RECOVERY_SIGNATURE,Role:"quality_agent",
    Message_Text:event.outcome+": "+event.reason,Actor:event.actor,
    Created_At:event.completed_at||event.detected_at,
    Reply_To_Event_Key:event.phase==="intent"?"":"publication-recovery:"+event.attempt_id+":intent",
    Intent_JSON:JSON.stringify({kind:"publication_reconciliation",...event}),
  };
}
export function normalizeRecoveryHistory(rows, filters={}) {
  const parse=row=>{
    const f=row?.fields||{};
    let evidence;
    try { evidence=JSON.parse(f.Intent_JSON||"{}"); } catch { return null; }
    if(f.Exception_Signature===RECOVERY_SIGNATURE)
      return {...evidence,audit_record_id:row.id,event_key:f.Event_Key,
        timestamp:f.Created_At,automatic:true};
    if(f.Exception_Signature==="FACTORY_BATCH_APPROVAL_FAILURE")
      return {...evidence,audit_record_id:row.id,event_key:f.Event_Key,
        timestamp:f.Created_At,actor:f.Actor||"quality_agent",
        reason:evidence.original_error || f.Message_Text, outcome:"Escalated",
        phase:"outcome",automatic:true};
    if(!["ADMIN_APPROVED_ACTION","ADMIN_ACTION_OUTCOME"].includes(f.Exception_Signature)) return null;
    return {...evidence,audit_record_id:row.id,event_key:f.Event_Key,
      timestamp:f.Created_At,record_id:f.Output_Record_ID,actor:f.Actor,automatic:false,
      outcome:evidence.status==="verified_published"?"Corrected":
        evidence.status==="blocked"?"Blocked":"Awaiting Verification",
      reason:f.Message_Text,phase:evidence.kind==="approved_action"?"intent":"outcome"};
  };
  return rows.map(parse).filter(Boolean).filter(e=>{
    const time=Date.parse(e.timestamp);
    if(filters.from && time<Date.parse(filters.from)) return false;
    if(filters.to && time>Date.parse(filters.to)) return false;
    if(filters.profile && e.profile_id!==filters.profile) return false;
    if(filters.platform && e.platform!==filters.platform) return false;
    if(filters.outcome && e.outcome!==filters.outcome) return false;
    if(filters.actor==="automatic" && !e.automatic) return false;
    if(filters.actor==="manual" && e.automatic) return false;
    if(filters.q && ![e.output_id,e.title,e.record_id,e.audit_id,e.reason].join(" ").toLowerCase()
      .includes(String(filters.q).toLowerCase())) return false;
    return true;
  }).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
}
