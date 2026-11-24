import {
  FACTORY_HANDOFF_SIGNATURE,
  scanRecentProductionFactoryHandoffs,
  matchesStaleTikTokReviewSignature,
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
  let finding=report.findings.find(x=>x.record_id===canaryRecordId &&
    x.reason==="stale_tiktok_waiting_schedule_blocks_review");
  // A configured exact canary may predate the four newest plans. One bounded
  // ID-indexed lookup is permitted only for that explicit target. The adapter
  // rechecks the full parent, ownership, plan and media before any write.
  if(!finding) {
    try {
      const rows=await read("platform_outputs?airtable_record_id=eq."+encodeURIComponent(canaryRecordId)
        +"&select=airtable_record_id,output_number,content_item_id,platform,studio_output_type,"
        +"render_status,output_status,review_status,publish_status,tiktok_draft_status,"
        +"auto_publish_enabled,do_not_publish,scheduled_post_date,studio_scheduled_at,"
        +"youtube_scheduled_publish_at,published_at,platform_post_url,test_run_id&limit=2");
      if(!Array.isArray(rows)||rows.length>1)throw Error("exact canary inventory unavailable");
      const row=rows[0];
      if(row?.airtable_record_id===canaryRecordId && matchesStaleTikTokReviewSignature(row)) {
        finding={reason:"stale_tiktok_waiting_schedule_blocks_review",record_id:row.airtable_record_id,
          output_id:row.output_number,content_item_id:row.content_item_id};
      }
    } catch {
      const result={...receipt,repair:{status:"unverified",reason:"exact_canary_lookup_unavailable"}};
      logger(result);
      return result;
    }
  }
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
      // Report actionable bounded blocker codes, not arbitrary diagnostics.
      reason: new Set(["no_documented_safe_media_rebuild","source_or_factory_claim_unverified",
        "shared_admission_denied","exact_rebuild_revision_already_attempted","media_rebuilt_review_required",
        "hold_or_prior_provider_evidence","hold_test_or_publishing_evidence",
        "not_stale_native_review_handoff","missing_protected_exact_variant_receipt",
        "current_revision_does_not_match_protected_receipt","exact_revision_already_attempted",
        "exact_parent_or_owned_variants_unverified","public_media_hash_unverified",
        "concurrent_output_revision","concurrent_owner_revision"]).has(outcome?.reason)?outcome.reason:"no_public_blocker_code",
      ...(outcome?.reason==="shared_admission_denied" ? {
        admission_reason:new Set(["capacity_or_circuit","broker_auth_denied","broker_request_rejected",
          "broker_http_unavailable","broker_receipt_invalid","broker_unavailable","broker_timeout",
          "broker_transport_unavailable","invalid_lease_identity","shared_admission_not_configured"]).has(outcome.admission_reason)
          ? outcome.admission_reason : "unknown",
        admission_http_status:Number.isInteger(outcome.admission_http_status)&&outcome.admission_http_status>=100&&outcome.admission_http_status<=599
          ? outcome.admission_http_status : null,
      } : {}),
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
