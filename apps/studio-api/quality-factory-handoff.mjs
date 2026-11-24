/**
 * Quality Agent: end-to-end Production -> Factory handoff (issue #2846).
 *
 * One durable content-level signature, not one stale status per platform.
 * This module is READ-ONLY. It reports exact evidence and names existing,
 * independently guarded recovery adapters; it does not invoke a producer,
 * release a hold, invent an image approval, schedule or publish.
 */
export const FACTORY_HANDOFF_SIGNATURE = "QA-PRODUCTION-FACTORY-E2E-2846";
export const FACTORY_HANDOFF_SCHEMA = "studio.quality.factory-handoff.1";

export const FACTORY_HANDOFF_RUNBOOK = Object.freeze([
  Object.freeze({stage:"plan",check:"Validate unique enabled destinations, request, content, owner/profile and immutable plan revision",on_failure:"repair_output_plan_or_ownership",auto_action:false}),
  Object.freeze({stage:"fanout",check:"Match each planned platform + Studio_Output_Type to exactly one canonical Platform Output",on_failure:"resume_fenced_i3_i4_only_after_exact_preflight",auto_action:"existing_zero_output_recovery_only"}),
  Object.freeze({stage:"produce",check:"Reconcile active job/lease, stalled/failed render, voiceover and variant dependencies; read back each output",on_failure:"route_existing_bounded_worker_repair",auto_action:"only_independently_proven_retries"}),
  Object.freeze({stage:"media",check:"Validate format-specific CDN media, caption, cover, selected photo manifest and exact linked gallery slides; check location, rights and watermark",on_failure:"rebuild_correct_media_and_reinspect",auto_action:"no_unverified_image_or_rights_substitution"}),
  Object.freeze({stage:"holds",check:"Respect revision, copyright, creative and provider safety holds; diagnose before considering release",on_failure:"request_authorized_hold_resolution",auto_action:false}),
  Object.freeze({stage:"factory",check:"Verify each eligible output in actual Needs Eyes server cards with canonical publish_status; reconcile stale terminal submission history and client visibility",on_failure:"repair_card_projection_or_queue_filter_then_live_verify",auto_action:"read_only_diagnostic"}),
  Object.freeze({stage:"approval",check:"Require authenticated human final-slide decisions and separate Factory approval submission with durable receipt",on_failure:"await_human_review",auto_action:false}),
  Object.freeze({stage:"terminal",check:"All planned outputs exist; every eligible sibling has complete verified media and is visible/selectable in Factory. STOP before human approval, scheduling or publishing.",on_failure:"retain_open_incident",auto_action:false}),
]);

const str = value => String(value ?? "").trim();
const nonempty = value => Boolean(str(value));
const key = (platform,type) => str(platform).toLowerCase()+"::"+str(type).toLowerCase();
const publicCdn = value => str(value).startsWith("https://media.chicagoshining.com/");
const list = value => Array.isArray(value) ? value : [];
const validNumber = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const statusName = value => str(value).toLowerCase();
const terminalOutput = row => /^(approved for publishing|scheduled|published|skipped|cancelled|rejected)$/i.test(str(row.output_status))
  || /^(scheduled|publishing|published)$/i.test(str(row.publish_status))
  || row.published_at || row.platform_post_url;
// An approval receipt is not a successful provider publication. Keep the
// original approval and provider evidence; route failure to reconciliation,
// never to production fanout or an automatic provider retry.
const approvedPublishFailure = row =>
  /^(failed|error)$/i.test(str(row.publish_status))
  && (str(row.output_status)==="Approved for Publishing"
    || str(row.review_status)==="Approved"
    || Boolean(row.published_at || row.platform_post_url));
const unresolved = row => !terminalOutput(row) || approvedPublishFailure(row);
function incident({stage,kind,reason,output,remediation,automatic=false,more={}}) {
  return {
    kind,signature:FACTORY_HANDOFF_SIGNATURE,stage,reason,
    output_id:output?.output_number ?? null,record_id:output?.airtable_record_id ?? null,
    action:remediation, automatic_action_authorized:automatic === true,
    ...more,
  };
}
function nativePhoto(row) {
  return str(row.render_status)==="Native Photo Route"
    || /carousel|photo set|multi-photo|multi-image|single image/i.test(
      str(row.platform_output_type)+" "+str(row.studio_output_type));
}
function activeJob(request) {
  return /^(queued|running|rendering|processing|producing|promoting|waiting|admitted|claimed)$/i
    .test(str(request?.production_job?.step || request?.production_job?.status));
}
function planItems(request) {
  const raw=request?.output_plan;
  let parsed=raw;
  if (typeof raw==="string") {
    try {parsed=JSON.parse(raw);}catch{return null;}
  }
  if (!parsed || !Array.isArray(parsed.items)) return null;
  return parsed.items.filter(item=>item && item.enabled!==false).map(item=>({
    platform:str(item.platform),type:str(item.output_type || item.studio_output_type),
  }));
}
const unique = items => new Set(items.map(x=>key(x.platform,x.type))).size===items.length;

/**
 * Inspects an exact content. "Missing proof" is never inferred as "verified".
 * gallerySlides and factoryCards may be omitted; the result then explicitly
 * lacks gallery/Factory proof instead of reporting a false all-clear.
 *
 * The terminal state is Ready for *human* Factory approval. It is never an
 * automatic production approval/publish/schedule permission.
 */
export function assessProductionFactoryHandoff({
  request,outputs,gallerySlides=null,factoryCards=null,
  activeSubmissionIds=[],verifiedMediaEvidence=null,
}={}) {
  const at=new Date().toISOString();
  const report={
    schema:FACTORY_HANDOFF_SCHEMA,signature:FACTORY_HANDOFF_SIGNATURE,
    request_id:str(request?.airtable_record_id)||null,
    content_item_id:str(request?.promoted_content_item_id)||null,
    checked_at:at,status:"unavailable",stage:"plan",
    expected_count:null,actual_count:null,ready_count:0,findings:[],
    terminal:"await_human_factory_approval",stop_before_factory_approval:true,
    publishing_authorized:false,schedule_actions:0,publish_actions:0,
  };
  if (!request || !Array.isArray(outputs)) {
    report.findings.push(incident({stage:"plan",kind:"production_factory_handoff",reason:"canonical_request_or_output_inventory_unavailable",remediation:"Retry bounded canonical read; never infer zero outputs"}));
    return report;
  }
  if (request.test_run_id || request.production_job?.test_run_id) {
    report.status="excluded_test";return report;
  }
  const plan=planItems(request);
  if (!plan || !plan.length || plan.some(x=>!x.platform||!x.type)||!unique(plan)||plan.length>24) {
    report.status="blocked";report.stage="plan";
    report.findings.push(incident({stage:"plan",kind:"production_factory_handoff",reason:"invalid_or_duplicate_output_plan",remediation:"Repair exact plan/ownership with user before any output creation"}));
    return report;
  }
  report.expected_count=plan.length;
  // Earliest false-success signature: Production says Promoted / completed
  // but has no canonical linked Content owner at all. Never treat this as
  // 0 outputs successfully validated, and never create output records from
  // an unowned request. An active Submitted job remains in-progress.
  if (!str(request.promoted_content_item_id)) {
    report.actual_count=0;report.stage="fanout";
    const step=statusName(request.production_job?.step||request.production_job?.status);
    const unfinished= str(request.request_status)==="Submitted"
      && !["done","failed","escalated","error","complete"].includes(step);
    report.status=unfinished?"in_progress":"repair_required";
    report.findings.push(incident({
      stage:"fanout",kind:"production_factory_handoff",
      reason:"production_content_promotion_not_reconciled",
      remediation:"Reconcile original Idea / Production Request ownership, completed job and content link; only a fenced I3/I4 fanout may create missing outputs after exact readback",
    }));
    return report;
  }
  const canonical=list(outputs).filter(x=>!x.test_run_id);
  report.actual_count=canonical.length;
  if (canonical.length>24) {
    report.status="blocked";
    report.findings.push(incident({stage:"fanout",kind:"production_factory_handoff",reason:"output_inventory_exceeds_bounded_plan",remediation:"Reconcile duplicates and source ownership; do not automatically create outputs"}));
    return report;
  }
  // The live production_requests table has NO content_profile_id column.
  // Its source profile must be obtained by a separate exact parent/idea
  // identity verification before any mutating repair. Detect cross-profile
  // leakage among the existing child outputs without inventing that column.
  const observedProfiles=new Set(canonical.map(x=>str(x.content_profile_id)).filter(Boolean));
  if (canonical.some(x=>request.promoted_content_item_id && str(x.content_item_id)!==str(request.promoted_content_item_id))
      || canonical.some(x=>request.content_profile_id && str(x.content_profile_id)!==str(request.content_profile_id))
      || observedProfiles.size>1) {
    report.status="blocked";report.stage="fanout";
    report.findings.push(incident({stage:"fanout",kind:"production_factory_handoff",reason:"wrong_content_or_profile_ownership",remediation:"Quarantine cross-profile media/outputs and reconcile exact links before production"}));
    return report;
  }
  const byKey=new Map();
  for (const row of canonical) {
    const name=key(row.platform,row.studio_output_type);
    if (!byKey.has(name)) byKey.set(name,[]);
    byKey.get(name).push(row);
  }
  const intended=new Set(plan.map(x=>key(x.platform,x.type)));
  for (const [identity,rows] of byKey) {
    if (!intended.has(identity)||rows.length!==1) {
      report.findings.push(incident({stage:"fanout",kind:"production_factory_handoff",reason:"unexpected_or_duplicate_platform_output",output:rows[0],remediation:"Reconcile exact plan, duplicate output and any provider identity before retry",more:{count:rows.length}}));
    }
  }
  const missing=plan.filter(x=>!(byKey.get(key(x.platform,x.type))||[]).length);
  for(const item of missing) {
    report.findings.push(incident({stage:"fanout",kind:"production_factory_handoff",reason:"planned_output_missing",remediation:"If producer still active, monitor; otherwise reconcile original I3/I4 job and resume with lease/unique identity after readback",more:{platform:item.platform,output_type:item.type,existing_worker:"studioRecoverEmptyPlatformOutputCron (zero-only, narrowly eligible)"}}));
  }
  if (report.findings.length) {
    report.stage="fanout";
    report.status=activeJob(request) ? "in_progress" : "repair_required";
    return report;
  }
  // A promoted parent can still have a running video/media producer.
  // Never call this a failed render merely because the final file has not
  // arrived while its OWN verified execution claim remains active.
  if (activeJob(request) && canonical.some(row => !terminalOutput(row))
      && !canonical.some(row => /^(failed|error|blocked)$/i.test(str(row.output_status))
        || /^(failed|error|blocked)$/i.test(str(row.render_status))
        || approvedPublishFailure(row))) {
    report.stage="produce";report.status="in_progress";return report;
  }
  const cards=Array.isArray(factoryCards) ? new Map(factoryCards.map(x=>[str(x.id||x.airtable_record_id),x])) : null;
  const active=new Set(activeSubmissionIds.map(str));
  let missingProof=false, alreadyPastFactory=0;
  for (const dest of plan) {
    const row=byKey.get(key(dest.platform,dest.type))[0];
    if(approvedPublishFailure(row)) {
      report.findings.push(incident({stage:"publish",kind:"production_factory_handoff",
        reason:"approved_publication_failed_requires_reconciliation",output:row,
        remediation:"Reconcile exact provider attempt, existing publication evidence, rights and current media revision via the guarded publishing recovery path; preserve original approval and any hold; no blind retry or new production fanout"}));
      continue;
    }
    if(terminalOutput(row)) {
      alreadyPastFactory++;
      continue; // do not rewind approved/published siblings
    }
    const problem=statusName(row.output_status)==="failed" || /^(failed|blocked|error)$/i.test(str(row.render_status))
      || /^(failed|error)$/i.test(str(row.publish_status));
    if(problem){
      report.findings.push(incident({stage:"produce",kind:"production_factory_handoff",reason:"generation_or_render_failed",output:row,remediation:"Diagnose exact typed job/asset/voiceover error; use existing bounded producer/render recovery and verify public result, never restart a provider publish"}));
      continue;
    }
    if(!nonempty(row.output_caption)){
      report.findings.push(incident({stage:"media",kind:"production_factory_handoff",reason:"missing_output_caption",output:row,remediation:"Generate and source-verify correct city/profile caption before human review"}));
      continue;
    }
    if(nativePhoto(row)){
      const expected=Number(row.selected_clip_count)||0;
      if(!validNumber(expected)||!publicCdn(row.studio_preview_url)||!publicCdn(row.thumbnail_url)){
        report.findings.push(incident({stage:"media",kind:"production_factory_handoff",reason:"native_selected_assets_or_public_preview_missing",output:row,remediation:"Rebuild correct source images, watermark, dimensions and public CDN preview/cover; do not substitute a cover for slides"}));
        continue;
      }
      const slides=gallerySlides && Object.prototype.hasOwnProperty.call(gallerySlides,str(row.output_number))
        ? gallerySlides[str(row.output_number)] : null;
      // C9 carousel_slides are mandatory for Instagram carousels and Facebook
      // photo sets, but TikTok Multi-Photo is a different native manifest.
      // Never invent C9 rows for TikTok to make an unrelated gallery pass.
      const requireC9Gallery=["Instagram","Facebook"].includes(str(row.platform))
        && expected>1;
      if (requireC9Gallery) {
        if(slides==null){missingProof=true;}
        else if(!Array.isArray(slides)||slides.length<expected||slides.some(x=>x.deleted_from_carousel
          ||!publicCdn(x.final_image_url??x.fields?.["Final Image URL"])
          ||x.media_status==="Error"||x.fields?.Asset_4x5_Public_Status==="Error")) {
          report.findings.push(incident({stage:"media",kind:"production_factory_handoff",reason:"canonical_gallery_missing_or_unready",output:row,remediation:"Create/repair exact owned ordered native slides; verify CDN bytes, selected manifest, aspect ratio, topic/location/rights/branding; keep publishing held during repair"}));
          continue;
        }
      } else if (str(row.platform)==="TikTok" && (!Array.isArray(slides)||slides.length===0)) {
        // The compact scan has no typed TikTok image array. Ask the exact
        // TikTok review preflight to verify it rather than falsely fail C9.
        missingProof=true;
      } else if (slides==null) missingProof=true;
      // Image final approval is a separate *human* decision. Never change
      // Approved For Final or Shared Asset Approved as an automated repair.
    } else if (!nonempty(row.final_file_url)||!publicCdn(row.thumbnail_url)) {
      report.findings.push(incident({stage:"media",kind:"production_factory_handoff",reason:"video_final_or_public_cover_missing",output:row,remediation:"Resume guarded render, verify audio, MP4 bytes/cover/captions and source location; no automatic review or publishing"}));
      continue;
    }
    if(row.do_not_publish===true || row.review_hold_active || row.safety_hold_active){
      report.findings.push(incident({stage:"holds",kind:"production_factory_handoff",reason:"unresolved_publish_or_creative_safety_hold",output:row,remediation:"Verify precise hold owner/reason and corrected package; require explicit authorized release, never clear automatically"}));
      continue;
    }
    if(str(row.output_status)!=="Ready for Review"||str(row.review_status)!=="Review Sent"||str(row.publish_status)!=="Not Ready"){
      report.findings.push(incident({stage:"factory",kind:"production_factory_handoff",reason:"review_handoff_status_mismatch",output:row,remediation:"Run existing pre-Factory review-readiness gate and CAS/readback; do not set approval, schedule or publish fields"}));
      continue;
    }
    // #2915: candidate only. The bounded executor must reload exact proof,
    // provider evidence, ownership and current media before changing anything.
    if(row.platform==="TikTok"&&row.studio_output_type==="Multi-Photo"
      &&row.render_status==="Native Photo Route"&&row.tiktok_draft_status==="Waiting for Schedule"
      &&row.auto_publish_enabled===false&&row.do_not_publish===false
      &&!row.scheduled_post_date&&!row.studio_scheduled_at&&!row.youtube_scheduled_publish_at
      &&!row.published_at&&!row.platform_post_url) {
      report.findings.push(incident({stage:"factory",kind:"production_factory_handoff",
        reason:"stale_tiktok_waiting_schedule_blocks_review",output:row,
        remediation:"Run guarded verified-native repair: exact owned current media and provider absence, CAS clear only stale TikTok draft flag, read back; verify Factory visibility and stop at human approval",
        more:{repair_signature:"QA-TIKTOK-STALE-SCHEDULE-RFR-v1",adapter:"recoverOneVerifiedNativeReview"}}));
      continue;
    }
    if (cards) {
      const card=cards.get(str(row.airtable_record_id));
      if(!card){
        report.findings.push(incident({stage:"factory",kind:"production_factory_handoff",reason:"canonical_ready_output_missing_from_needs_eyes",output:row,remediation:"Trace server Factory classification then UI profile/search/pagination and historical failed-approval fences; repair the filter/projection, not the canonical output status"}));
        continue;
      }
      if(card.publish_status!=="Not Ready"||card.review_package_ready===false){
        report.findings.push(incident({stage:"factory",kind:"production_factory_handoff",reason:"factory_card_publication_or_readiness_projection_mismatch",output:row,remediation:"Preserve canonical Publish_Status on factoryCardFromRow and review_package_ready; rerun exact-ID Factory GET and browser historical-receipt recovery"}));
        continue;
      }
      if(active.has(str(row.airtable_record_id))){
        report.findings.push(incident({stage:"factory",kind:"production_factory_handoff",reason:"active_approval_submission_requires_reconciliation",output:row,remediation:"Check the exact durable Factory batch/claim before a new attempt; do not clear an active submission"}));
        continue;
      }
    } else missingProof=true;
    // Existence of an https image URL or a C9 row does not independently
    // prove public bytes, creative location, permitted source, 4:5/9:16
    // dimensions, branding, or video sound. Keep deep QA UNKNOWN until an
    // authenticated image/video validator returns exact output evidence.
    const proof=verifiedMediaEvidence && typeof verifiedMediaEvidence==="object"
      ? verifiedMediaEvidence[str(row.output_number)] : null;
    const required=["cdn_bytes_verified","topic_location_verified",
      "rights_verified","branding_verified","aspect_ratio_verified"];
    if(!nativePhoto(row))required.push("audio_verified");
    if(!proof || !required.every(k=>proof[k]===true)) missingProof=true;
    report.ready_count++;
  }
  if(report.findings.length){
    const order=["produce","media","holds","factory","publish"];
    report.findings.sort((a,b)=>order.indexOf(a.stage)-order.indexOf(b.stage));
    report.stage=report.findings[0].stage;report.status="repair_required";
  } else if (missingProof) {
    report.stage="verification";report.status="verification_required";
  } else if (alreadyPastFactory===plan.length) {
    report.stage="complete";report.status="past_factory_review";
    report.terminal="no_quality_reapproval_needed";
    report.stop_before_factory_approval=true;
  } else {
    report.stage="approval";report.status="awaiting_human_factory_approval";
  }
  return report;
}

/**
 * Small read-only projection audit fed by actual Factory rows. No extra DB
 * calls. Catches "ready on server, missing in card" before a browser refresh.
 */
export function auditFactoryCardProjection(sourceRows,needsEyesCards){
  const cards=new Map(list(needsEyesCards).map(x=>[str(x.id),x]));
  return list(sourceRows).filter(x=>x?.kind==="output"
      && x.output_status==="Ready for Review"&&x.review_status==="Review Sent"
      && x.publish_status==="Not Ready"&&x.do_not_publish===false
      && x.review_package_ready===true
      && !x.review_hold_active&&!x.safety_hold_active
      && !x.scheduled_at&&!x.published_at&&!x.platform_post_url)
    .flatMap(x=>{
      const card=cards.get(str(x.id));
      if(!card)return [incident({stage:"factory",kind:"production_factory_handoff",reason:"factory_ready_output_not_in_needs_eyes",output:{airtable_record_id:x.id,output_number:x.output_id},remediation:"Inspect Factory lane admission, R2 pins, profile and pagination; never modify canonical status to simulate review eligibility"})];
      if(card.publish_status!=="Not Ready")return [incident({stage:"factory",kind:"production_factory_handoff",reason:"factory_card_publish_status_dropped",output:{airtable_record_id:x.id,output_number:x.output_id},remediation:"Pass through canonical publish_status in factoryCardFromRow; verify browser old-batch reconciliation"})];
      return [];
    });
}

/**
 * Bounded, read-only Supabase Quality Agent sampler. Two indexed, narrow
 * production-family reads; it never enumerates the full platform_outputs
 * catalog or pulls big JSONB media manifests. Exact linked-slide/CDN proofs
 * are a separate deep preflight; absence of that evidence is NOT a pass.
 *
 * 'read' is the existing authenticated server-side Supabase REST adapter.
 * This sampler never runs from an untrusted public browser.
 */
export async function scanRecentProductionFactoryHandoffs({
  read,limit=4,checkedAt=new Date().toISOString(),
}={}) {
  if(typeof read!=="function") throw Error("authoritative Supabase read required");
  const n=Math.max(1,Math.min(8,Number(limit)||4));
  const requests=await read("production_requests?request_status=in.(Promoted,Submitted)"
    +"&output_plan_status=eq.Ready"
    +"&select=airtable_record_id,promoted_content_item_id,"
    +"request_status,output_plan,production_job,updated_at"
    +"&order=updated_at.desc&limit="+n);
  if(!Array.isArray(requests)||requests.length>n)throw Error("handoff request inventory unavailable");
  const ids=[...new Set(requests.map(r=>str(r.promoted_content_item_id)).filter(x=>
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x)))];
  if(!ids.length) {
    const reports=requests.map(request=>assessProductionFactoryHandoff({
      request,outputs:[],gallerySlides:null,factoryCards:null,
    }));
    return {
      schema:FACTORY_HANDOFF_SCHEMA,signature:FACTORY_HANDOFF_SIGNATURE,
      status:"ok",checked_at:checkedAt,scanned:reports.length,
      findings:reports.flatMap(r=>r.findings.map(item=>({...item,
        request_id:r.request_id,content_item_id:r.content_item_id}))),
      incomplete_count:reports.filter(r=>r.status==="repair_required"||r.status==="blocked").length,
      verification_required_count:reports.filter(r=>r.status==="verification_required").length,
      reports:reports.map(r=>({request_id:r.request_id,content_item_id:r.content_item_id,
        status:r.status,stage:r.stage,expected_count:r.expected_count,
        actual_count:r.actual_count,ready_count:r.ready_count,
        terminal:r.terminal,publishing_authorized:false})),
      scope:"latest_ready_production_requests", 
      note:"No linked content owner in sampled requests; verify promotion before any fanout repair",
    };
  }
  const outputLimit=8*24+1;
  const outputs=await read("platform_outputs?content_item_id=in.("+ids.join(",")+")"
    +"&select=airtable_record_id,output_number,content_item_id,content_profile_id,"
    +"platform,studio_output_type,platform_output_type,output_status,"
    +"render_status,review_status,publish_status,do_not_publish,auto_publish_enabled,tiktok_draft_status,"
    +"output_caption,studio_preview_url,thumbnail_url,final_file_url,"
    +"selected_clip_count,scheduled_post_date,studio_scheduled_at,"
    +"published_at,platform_post_url,test_run_id,youtube_scheduled_publish_at"
    +"&order=output_number.desc.nullslast&limit="+outputLimit);
  if(!Array.isArray(outputs)) throw Error("handoff output inventory unavailable");
  if(outputs.length>=outputLimit)
    throw Error("handoff output inventory truncated; status unknown, not all-clear");
  const reports=requests.map(request=>assessProductionFactoryHandoff({
    request,outputs:outputs.filter(x=>str(x.content_item_id)===str(request.promoted_content_item_id)),
    gallerySlides:null,factoryCards:null,
  }));
  const findings=reports.flatMap(report=>report.findings.map(row=>({
    ...row,content_item_id:report.content_item_id,request_id:report.request_id,
  })));
  return {
    schema:FACTORY_HANDOFF_SCHEMA,signature:FACTORY_HANDOFF_SIGNATURE,
    status:"ok",checked_at:checkedAt,scanned:reports.length,
    incomplete_count:reports.filter(r=>r.status==="repair_required"||r.status==="blocked").length,
    verification_required_count:reports.filter(r=>r.status==="verification_required").length,
    findings:findings.slice(0,80),
    reports:reports.map(r=>({
      request_id:r.request_id,content_item_id:r.content_item_id,
      status:r.status,stage:r.stage,expected_count:r.expected_count,
      actual_count:r.actual_count,ready_count:r.ready_count,
      terminal:r.terminal,publishing_authorized:false,
    })),
    scope:"latest_ready_production_requests",
    note:"Native slide/CDN byte and Factory browser visibility require exact second-stage verification; they are not treated as clear from a compact scan",
  };
}
