/**
 * Canonical exception counts, derived from the existing Home/Pipeline predicates
 * against one completely paginated Airtable production-output census.
 * An unavailable/incomplete scan must never become a zero count.
 */
import {homeApprovedExceptionKind,homeIsUnpublishedFailure,homeOutputContribution} from "./profile-summary-classification.mjs";
const bool=v=>v===true;
const mappedProfile=row=>Array.isArray(row?.fields?.Content_Profile) ? String(row.fields.Content_Profile[0]||"") : "";
const blank=()=>({outputs:0,approved_past_due:0,approved_missing_date:0,failed:0,manual_action_required:0,held_deferred:0});
export function reconcileExceptionCensus(rawRows,mapOutput,{atMs=Date.now(),qaFailed=[],qaPastDue=[]}={}) {
  if(!Array.isArray(rawRows)||typeof mapOutput!=="function") throw new Error("Complete Airtable output census required");
  const totals=blank(),byProfile=new Map(),seen=new Set();
  const homeFailed=new Set(),homeDue=new Set();
  const byPlatform={};
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
    snapshot_parity_with_home_widget:"not_proven_without_matching_generation",
    read_only:true,
  };
}
