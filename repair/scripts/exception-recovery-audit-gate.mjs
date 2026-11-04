/**
 * Stage 3 acceptance contract for authenticated production verification.
 * A healthy HTTP response or an apparently complete census is not parity.
 * All three independent gates must be true in the same audit attempt.
 */
export function stage3ProductionAcceptance(census, parity, disposition) {
  const fail = (reason) => ({ status: "unverified", reason });
  if (census?.status !== "complete_census"
      || !Number.isInteger(census?.source_row_count)
      || census.source_row_count <= 0
      || census.exception_items_truncated !== false) {
    return fail("authoritative_census_incomplete");
  }
  const home = census.home_snapshot_comparison;
  if (home?.status !== "counts_match_stable_generation"
      || !home.snapshot_generation || !home.snapshot_at
      || !Number.isInteger(home.compared_profiles)
      || home.compared_profiles < 4
      || !Array.isArray(home.differences)
      || home.differences.length) {
    return fail("home_generation_not_fresh_and_stable");
  }
  if (parity?.status !== "complete"
      || parity.failed?.status !== "matched"
      || parity.approved_past_due?.status !== "matched") {
    return fail("independent_quality_agent_identity_parity_not_proven");
  }
  for (const key of ["failed", "approved_past_due"]) {
    const item = parity[key];
    if (!Number.isInteger(item.home_count)
        || item.home_count !== Number(census.totals?.[key])
        || item.quality_agent_count !== item.home_count
        || item.missing_in_quality_agent !== 0
        || item.extra_quality_agent !== 0) {
      return fail("inconsistent_exact_identity_"+key);
    }
  }
  if (disposition?.status !== "classified_read_only"
      || disposition.complete !== true
      || !Number.isInteger(disposition.case_count)
      || !Array.isArray(disposition.cases)
      || disposition.case_count !== disposition.cases.length
      || disposition.cases.some(item => item.actions_enabled !== false)) {
    return fail("read_only_case_disposition_incomplete");
  }
  return {
    status:"verified",
    source_rows:census.source_row_count,
    home_generation:home.snapshot_generation,
    failed:parity.failed.home_count,
    approved_past_due:parity.approved_past_due.home_count,
    case_count:disposition.case_count,
    note:"Independent exact-ID agreement on a stable refreshed Home generation; distinct reads are not one database transaction.",
  };
}
