/**
 * Canonical exception counts, derived from the existing Home/Pipeline predicates
 * against one completely paginated Airtable production-output census.
 * An unavailable/incomplete scan must never become a zero count.
 */
import {homeApprovedExceptionKind,homeIsUnpublishedFailure,homeOutputContribution} from "./profile-summary-classification.mjs";
const bool=v=>v===true;
const mappedProfile=row=>Array.isArray(row?.fields?.Content_Profile) ? String(row.fields.Content_Profile[0]||"") : "";
const blank=()=>({outputs:0,approved_past_due:0,approved_missing_date:0,failed:0,manual_action_required:0,held_deferred:0});
export function reconcileExceptionCensus(rawRows,mapOutput,{atMs=Date.now(),qaFailed=null,qaPastDue=null}={}) {
  if(!Array.isArray(rawRows)||typeof mapOutput!=="function") throw new Error("Complete Airtable output census required");
  const totals=blank(),byProfile=new Map(),seen=new Set();
  const homeFailed=new Set(),homeDue=new Set();
  const byPlatform={};
  const exceptionItems=[];
  let unverifiedRemoteIds=0;
  const overdueRecoveryLanes={};
  for(const row of rawRows) {
    if(!/^rec[A-Za-z0-9]{14}$/.test(String(row?.id||"")))throw new Error("Bad output identity in canonical census");
    if(seen.has(row.id))throw new Error("Repeated output record in canonical census");
    seen.add(row.id);
    if(row?.fields?.Test_Run_ID)throw new Error("Nonproduction test row in canonical census");
    const mapped=mapOutput(row);
    if(!mapped||mapped.id!==row.id)throw new Error("Canonical mapping missing record");
    const profile=mappedProfile(row)||"unassigned";
    const p=byProfile.get(profile)||blank();
    const platform=String(mapped.platform||"Unknown");
    const plat=byPlatform[platform]||blank();
    const kind=homeApprovedExceptionKind(mapped,atMs);
    const failed=homeIsUnpublishedFailure(mapped);
    const manual=homeOutputContribution(mapped,atMs).manual_action_required>0;
    const held=bool(row?.fields?.Do_Not_Publish);
    for(const counter of [totals,p,plat]) {
      counter.outputs++;
      if(kind==="approved_past_due")counter.approved_past_due++;
      if(kind==="approved_missing_date")counter.approved_missing_date++;
      if(failed)counter.failed++;
      if(manual)counter.manual_action_required++;
      if(held)counter.held_deferred++;
    }
    const fields=row.fields||{};
    const remoteId=fields.Platform_Post_ID||fields.Platform_Media_ID||fields.YouTube_Video_ID||"";
    const savedReceipt=Boolean(fields.Published_At||fields.Platform_Post_URL||fields.Manual_Published_URL);
    const remoteUnverified=Boolean(remoteId&&!savedReceipt);
    if(remoteUnverified)unverifiedRemoteIds++;
    // Disjoint, informational overdue triage. Neither a stored remote ID nor
    // an old "Publishing" status is proof of a published post or a retry permit.
    // The only autonomous lane is a candidate for a fresh provider GET and
    // guarded, status-only write; all other lanes retain the existing publisher
    // and administrator preflights.
    const recoveryLane=kind==="approved_past_due"
      ? held?"intentional_hold"
      : remoteId && (platform==="YouTube"||platform==="Instagram")
        ?"verify_existing_post_status_only"
      : remoteId?"provider_adapter_or_manual_verification_required"
      : fields.Publish_Status==="Failed" || fields.Output_Status==="Failed"
        ?"failed_stage_requires_diagnosis"
      : fields.Publish_Status==="Publishing"
        ?"inflight_requires_lock_and_receipt_preflight"
      :"missing_remote_identity_requires_publisher_preflight"
      :null;
    if(recoveryLane) overdueRecoveryLanes[recoveryLane]=(overdueRecoveryLanes[recoveryLane]||0)+1;
    const categories=[
      ...(kind?[kind]:[]),
      ...(failed?["failed"]:[]),
      ...(held?["held_deferred"]:[]),
      ...(remoteUnverified?["remote_identity_unverified"]:[]),
    ];
    if(categories.length)exceptionItems.push({
      record_id:row.id,output_id:String(fields.Output_ID||mapped.output_id||"")||null,
      title:String(fields.Output_Title||mapped.output_title||fields.Title_Text||fields.Studio_Effective_Requested_Title||"")||null,
      profile_id:profile==="unassigned"?null:profile,platform,output_type:String(mapped.output_type||fields.Studio_Output_Type||fields.Platform_Output_Type||"")||null,
      output_status:String(fields.Output_Status||"")||null,
      publish_status:String(fields.Publish_Status||"")||null,
      scheduled_at:fields.Scheduled_Post_Date||null,
      minutes_past_due:kind==="approved_past_due"&&fields.Scheduled_Post_Date
        ?Math.max(0,Math.floor((atMs-Date.parse(fields.Scheduled_Post_Date))/60000)):null,
      held,remote_identity_exists:Boolean(remoteId),public_receipt_recorded:savedReceipt,
      recovery_lane:recoveryLane,status_only_verification_candidate:recoveryLane==="verify_existing_post_status_only",
      signature:kind==="approved_past_due"?"QA-PUBLISH-001":failed?"HOME-FAILED":held?"INTENTIONAL-HOLD":"REMOTE-ID-UNVERIFIED",
      diagnosis:failed?"Failed publication or production requires Quality Agent inspection."
        :held?"Intentional do-not-publish hold remains authoritative."
        :kind==="approved_past_due"?"Approved publication is overdue without an authoritative public receipt."
        :"Existing provider identity has no saved public publication receipt.",
      recommendation:remoteUnverified?"Verify the existing remote ID before any further dispatch; never assume it is safe to repost."
        :held?"Preserve the hold; no release is authorized by this Center."
        :failed?"Inspect the existing Quality Agent failure diagnostics, locks and attempt limits."
        :"Inspect actual publication status and the matching provider receipt; do not blindly repost.",
      categories,actions_enabled:false,
    });
    if(failed)homeFailed.add(row.id);
    if(kind==="approved_past_due")homeDue.add(row.id);
    byProfile.set(profile,p);byPlatform[platform]=plat;
  }
  const compare=(home,qa)=>{
    if(!Array.isArray(qa))return {status:"unavailable",quality_agent_count:null,home_count:home.size,missing_in_quality_agent:null,extra_quality_agent:null};
    const idset=new Set(qa.map(x=>String(x?.record_id||x?.id||"")).filter(Boolean));
    const missing=[...home].filter(id=>!idset.has(id));
    const extra=[...idset].filter(id=>!home.has(id));
    return {status:!missing.length&&!extra.length?"matched":"mismatch",
      home_count:home.size,quality_agent_count:idset.size,
      missing_in_quality_agent:missing.length,extra_quality_agent:extra.length,
      missing_ids_sample:missing.slice(0,30),extra_ids_sample:extra.slice(0,30)};
  };
  return {
    status:"complete_census",source:"airtable",scan_completed_at:new Date(atMs).toISOString(),
    semantics:"home-pipeline-canonical-predicates",source_row_count:seen.size,
    totals,by_profile:Object.fromEntries(byProfile),by_platform:byPlatform,
    comparisons:{failed:compare(homeFailed,qaFailed),approved_past_due:compare(homeDue,qaPastDue)},
    exception_items:exceptionItems.sort((a,b)=>{
      const priority=x=>x.categories.includes("failed")?4:x.categories.includes("approved_past_due")?3:x.categories.includes("remote_identity_unverified")?2:1;
      return priority(b)-priority(a)||Number(b.output_id||0)-Number(a.output_id||0);
    }).slice(0,500),
    exception_items_count:exceptionItems.length,
    exception_items_truncated:exceptionItems.length>500,
    unverified_remote_ids:unverifiedRemoteIds,
    overdue_recovery_lanes:overdueRecoveryLanes,
    snapshot_parity_with_home_widget:"not_proven_without_matching_generation",
    read_only:true,
  };
}
