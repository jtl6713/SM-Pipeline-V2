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
const unresolved = row => !terminalOutput(row);
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
  request,outputs,gallerySlides=null,factoryCards=null,activeSubmissionIds=[],
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
  const canonical=list(outputs).filter(x=>!x.test_run_id);
  report.actual_count=canonical.length;
  if (canonical.length>24) {
    report.status="blocked";
    report.findings.push(incident({stage:"fanout",kind:"production_factory_handoff",reason:"output_inventory_exceeds_bounded_plan",remediation:"Reconcile duplicates and source ownership; do not automatically create outputs"}));
    return report;
  }
  if (canonical.some(x=>request.promoted_content_item_id && str(x.content_item_id)!==str(request.promoted_content_item_id))
      || canonical.some(x=>request.content_profile_id && str(x.content_profile_id)!==str(request.content_profile_id))) {
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
  if (["Draft","Ready","Submitted"].includes(str(request.request_status)) && activeJob(request)) {
    report.stage="produce";report.status="in_progress";return report;
  }
  const cards=Array.isArray(factoryCards) ? new Map(factoryCards.map(x=>[str(x.id||x.airtable_record_id),x])) : null;
  const active=new Set(activeSubmissionIds.map(str));
  let missingProof=false;
  for (const dest of plan) {
    const row=byKey.get(key(dest.platform,dest.type))[0];
    if(terminalOutput(row)) continue; // do not rewind approved/published siblings
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
      if(slides==null){missingProof=true;}
      else if(!Array.isArray(slides)||slides.length<expected||slides.some(x=>x.deleted_from_carousel
        ||!publicCdn(x.final_image_url??x.fields?.["Final Image URL"])
        ||x.media_status==="Error"||x.fields?.Asset_4x5_Public_Status==="Error")) {
        report.findings.push(incident({stage:"media",kind:"production_factory_handoff",reason:"canonical_gallery_missing_or_unready",output:row,remediation:"Create/repair exact owned ordered native slides; verify CDN bytes, selected manifest, aspect ratio, topic/location/rights/branding; keep publishing held during repair"}));
        continue;
      }
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
    report.ready_count++;
  }
  if(report.findings.length){
    const order=["produce","media","holds","factory"];
    report.findings.sort((a,b)=>order.indexOf(a.stage)-order.indexOf(b.stage));
    report.stage=report.findings[0].stage;report.status="repair_required";
  } else if (missingProof) {
    report.stage="verification";report.status="verification_required";
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
