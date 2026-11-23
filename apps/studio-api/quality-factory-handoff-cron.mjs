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
}={}) {
  const report=await scanRecentProductionFactoryHandoffs({read,limit});
  const receipt=qualityFactoryHandoffCronReceipt(report);
  logger(receipt);
  return receipt;
}
