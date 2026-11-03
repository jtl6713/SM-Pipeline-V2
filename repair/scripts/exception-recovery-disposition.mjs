/**
 * Read-only Stage 3 disposition evidence. Does not interpret saved provider IDs
 * as publication proof, schedule retries, or grant mutation authorization.
 */
const validId = (v) => /^rec[A-Za-z0-9]{14}$/.test(String(v || ""));
const nonempty = (v) => String(v ?? "").trim();
export function summarizeStage3ExceptionDispositions(census, quality) {
  if (census?.status !== "complete_census"
      || !Array.isArray(census?.exception_items)
      || census?.exception_items_truncated !== false
      || !Number.isInteger(census?.exception_items_count)
      || census.exception_items.length !== census.exception_items_count) {
    return { status: "unavailable", reason: "authoritative_complete_exception_items_required" };
  }
  const q = quality?.status === "provisional" && Array.isArray(quality?.items)
    ? quality.items : [];
  const diagnosticById = new Map(q.filter(x => validId(x?.record_id))
    .map(x => [x.record_id,x]));
  const seen = new Set();
  const categories = {};
  const overdueLanes = {};
  const platforms = {};
  const actionCounts = {};
  const cases = [];
  for(const x of census.exception_items) {
    if(!validId(x?.record_id) || seen.has(x.record_id) || !Array.isArray(x.categories)
        || !x.categories.length) {
      return {status:"unavailable", reason:"invalid_or_repeated_case_identity"};
    }
    seen.add(x.record_id);
    const cats=[...new Set(x.categories.map(nonempty).filter(Boolean))];
    if(!cats.length || x.actions_enabled !== false)
      return {status:"unavailable",reason:"unverified_or_enabled_case"};
    for(const c of cats)categories[c]=(categories[c]||0)+1;
    const platform=nonempty(x.platform)||"Unknown";
    platforms[platform]=(platforms[platform]||0)+1;
    const lane=nonempty(x.recovery_lane)||null;
    if(cats.includes("approved_past_due"))
      overdueLanes[lane||"unclassified"]=(overdueLanes[lane||"unclassified"]||0)+1;
    // Do not treat a raw publisher attempt as evidence of public delivery.
    const nextAction=x.held===true?"preserve_authoritative_hold"
      :cats.includes("failed")?"investigate_failure_and_apply_existing_guarded_recovery"
      :cats.includes("approved_past_due") && x.remote_identity_exists===true
        ?"verify_saved_remote_identity_before_any_retry"
      :cats.includes("approved_past_due")
        ?"recheck_lock_cooldown_attempts_and_dispatch_preflight"
      :cats.includes("remote_identity_unverified")
        ?"verify_saved_remote_identity_before_any_retry"
      :"review_current_canonical_state";
    actionCounts[nextAction]=(actionCounts[nextAction]||0)+1;
    const diagnostic=diagnosticById.get(x.record_id);
    cases.push({
      record_id:x.record_id,
      output_id:nonempty(x.output_id)||null,
      profile_id:nonempty(x.profile_id)||null,
      platform,
      output_type:nonempty(x.output_type)||null,
      categories:cats,
      output_status:nonempty(x.output_status)||null,
      publish_status:nonempty(x.publish_status)||null,
      scheduled_at:nonempty(x.scheduled_at)||null,
      recovery_lane:lane,
      held:x.held===true,
      remote_identity_exists:x.remote_identity_exists===true,
      public_receipt_recorded:x.public_receipt_recorded===true,
      quality_diagnosis:nonempty(diagnostic?.diagnosis)||null,
      quality_recommendation:nonempty(diagnostic?.recommendation)||null,
      next_action:nextAction,
      actions_enabled:false,
    });
  }
  const sum=n=>Number.isInteger(n)?n:null;
  for(const key of ["approved_past_due","failed","held_deferred"]) {
    if(sum(census.totals?.[key]) !== (categories[key]||0))
      return {status:"unavailable",reason:"canonical_category_count_mismatch_"+key};
  }
  if(Object.values(overdueLanes).reduce((n,v)=>n+v,0)!==sum(census.totals?.approved_past_due))
    return {status:"unavailable",reason:"overdue_recovery_lane_census_incomplete"};
  return {
    status:"classified_read_only",
    scanned_at:census.scan_completed_at||null,
    complete:true,
    case_count:cases.length,
    categories,
    overdue_recovery_lanes:overdueLanes,
    platforms,
    next_actions:actionCounts,
    unverified_remote_ids:sum(census.unverified_remote_ids),
    cases,
    note:"Every listed case requires current Airtable preflight before any authorized mutation. IDs or uploads do not prove public posting. No output, schedule, hold, or provider writes were made.",
  };
}
