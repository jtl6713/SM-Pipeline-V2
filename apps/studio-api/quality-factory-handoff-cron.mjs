import {
  FACTORY_HANDOFF_SIGNATURE,
  scanRecentProductionFactoryHandoffs,
} from "./quality-factory-handoff.mjs";

/**
 * Small on-schedule Quality Agent detection, never a second producer.
 * Stagger from Airtable retirement heartbeat and other one-minute healers.
 * The emergency kill switch is allowlisted at runtime.
 */
export function shouldRunQualityFactoryHandoffCron({
  cron, minute, source, configured, disabled=false,
}={}) {
  return cron==="* * * * *"
    && source==="supabase"
    && configured===true
    && disabled!==true
    && Number.isInteger(minute) && minute>=0 && minute<=59
    && minute % 5===2;
}

export function qualityFactoryHandoffCronReceipt(report) {
  if (!report || report.status!=="ok" || !Array.isArray(report.reports)
      || !Array.isArray(report.findings)) {
    return {
      signature:FACTORY_HANDOFF_SIGNATURE,
      status:"unavailable",outcome:"no_clearance_from_missing_evidence",
      publish_actions:0,schedule_actions:0,approval_actions:0,
    };
  }
  return {
    signature:FACTORY_HANDOFF_SIGNATURE,status:"checked",
    scanned:report.scanned,repair_required:report.incomplete_count,
    verification_required:report.verification_required_count,
    finding_count:report.findings.length,
    // No captions/URLs/media/access tokens or PII in worker logs.
    stages:[...new Set(report.findings.map(x=>String(x.stage||"unknown")))],
    checked_at:report.checked_at,
    publish_actions:0,schedule_actions:0,approval_actions:0,
  };
}

/**
 * Read-only background scan for the most recent 4 production requests.
 * This loop never calls I3/I4, R4/R5, gallery generation, approval or provider
 * writes. Existing zero-output and render claim-governed healers stay separate.
 */
export async function runQualityFactoryHandoffCron({
  read,logger=()=>{},limit=4,
  canaryRecordId=null,repair=null,
}={}) {
  const report=await scanRecentProductionFactoryHandoffs({read,limit});
  const receipt=qualityFactoryHandoffCronReceipt(report);
  logger(receipt);
  // No default write authority. A protected deployment may authorize one
  // exact, independently checked candidate, not a general backlog scan.
  if(typeof repair!=="function" || !/^rec[A-Za-z0-9]{14}$/.test(String(canaryRecordId||""))) return receipt;
  const finding=report.findings.find(x=>x.record_id===canaryRecordId &&
    x.reason==="stale_tiktok_waiting_schedule_blocks_review");
  if(!finding) {
    const result={...receipt,repair:{status:"skipped",reason:"no_matching_canary_candidate"}};
    logger(result);
    return result;
  }
  try {
    const outcome=await repair({...report,findings:[finding]});
    const result={...receipt,repair:{
      status:outcome?.status==="repaired"?"repaired":outcome?.status==="skipped"?"skipped":"unverified",
      output_id:finding.output_id,
      // The adapter returns a versioned receipt but no untrusted free-form
      // diagnostic is copied to Worker logs.
      signature:"QA-TIKTOK-STALE-SCHEDULE-RFR-v1",
      approval_actions:0,schedule_actions:0,publish_actions:0,
    }};
    logger(result);
    return result;
  } catch {
    // The durable reservation remains owned by the adapter. Never retry a
    // possibly committed write automatically on this same tick.
    const result={...receipt,repair:{status:"unverified",reason:"repair_requires_reconciliation",
      output_id:finding.output_id}};
    logger(result);
    return result;
  }
}
