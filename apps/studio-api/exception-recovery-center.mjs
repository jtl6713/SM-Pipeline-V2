/**
 * Exception Recovery Center, Phase A: read-only presentation of existing
 * Quality Agent census results. No new scanner, retry controller, or writer.
 * A bucket is NOT a canonical Home metric until classification parity is proved.
 */
const str = (x) => String(x ?? "").trim();
const finite = (x) => x == null || x === "" ? null : (Number.isFinite(Number(x)) ? Number(x) : null);
const has = (x) => Boolean(str(x));
const isHeld = (row) => row?.fields?.Do_Not_Publish === true || row?.Do_Not_Publish === true;

function observedBucket(observed, status, source, note) {
  return {
    count: null, // Home/Pipeline parity has not been demonstrated.
    observed: status === "ok" ? observed : null,
    status: status === "ok" ? "provisional" : "unavailable",
    source,
    note,
  };
}

const unknown = (note) => ({
  count: null, observed: null, status: "not_implemented",
  source: null, note,
});

function safeItem(source, row) {
  const due = source === "approved_past_due";
  return {
    record_id: str(row?.record_id),
    output_id: str(row?.output_id) || null,
    title: str(row?.title) || null,
    profile_id: str(row?.profile_id) || null,
    profile_name: str(row?.profile_name) || null,
    platform: str(row?.platform) || null,
    output_type: str(row?.output_type) || null,
    output_status: str(row?.output_status) || null,
    publish_status: str(row?.publish_status) || null,
    scheduled_at: due ? str(row?.scheduled_at) || null : null,
    minutes_past_due: due ? finite(row?.minutes_past_due) : null,
    retry_at: due ? null : str(row?.retry_at) || null,
    attempts: finite(due ? row?.dispatch_attempts : row?.attempt_count),
    signature: str(row?.signature) || null,
    diagnosis: str(due ? row?.cause : row?.error) || null,
    recovery: str(row?.recovery) || null,
    recommendation: str(row?.action) || null,
    categories: [source],
    // Informational only. No mutating action can be inferred from this field.
    actions_enabled: false,
  };
}

function mergeItem(target, item) {
  if (!target) return item;
  const categories = [...new Set([...target.categories, ...item.categories])];
  // Existing failed-output details include title/error; past-due includes due age.
  const merged = { ...target, ...item, categories };
  for (const field of ["title", "profile_id", "profile_name", "platform", "output_type", "output_status", "publish_status", "scheduled_at", "minutes_past_due", "retry_at", "diagnosis", "recommendation", "signature"]) {
    if (item[field] == null || item[field] === "") merged[field] = target[field];
  }
  return merged;
}

/**
 * Builds a fail-closed, unfiltered census view from the existing authoritative
 * and cursor-paginated Quality Agent snapshot. No provider calls or writes.
 */
export function buildExceptionRecoveryCenter(snapshot, filters = {}) {
  const profileFilter = str(filters.profile_id).slice(0, 80);
  const platformFilter = str(filters.platform).toLowerCase().slice(0, 80);
  const categoryFilter = str(filters.category).slice(0, 80);
  if (!snapshot || snapshot.status !== "ok" || !Array.isArray(snapshot.items)) {
    return { status: "unavailable", as_of: null, read_only: true, items: [],
      metrics: {}, error: "Quality Agent authoritative census unavailable; counts are unknown." };
  }
  const asOf = str(snapshot.scanned_at) || null;
  const pastDueOk = snapshot.approved_past_due?.status === "ok"
    && Array.isArray(snapshot.approved_past_due.items);
  const canonicalFailedOk = snapshot.canonical_failed?.status === "ok"
    && Array.isArray(snapshot.canonical_failed.items);
  const failed = canonicalFailedOk ? snapshot.canonical_failed.items.filter((r) => has(r?.record_id)) : [];
  const overdue = pastDueOk ? snapshot.approved_past_due.items.filter((r) => has(r?.record_id)) : [];
  // QA-only signals stay visible as diagnostics, not mislabeled Home failures.
  const diagnostics = snapshot.items.filter((r) => has(r?.record_id));
  const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const heldIds = new Set(rows.filter(isHeld).map((r) => str(r?.id)).filter(Boolean));
  const byId = new Map();
  for (const [source, items] of [["failed", failed], ["approved_past_due", overdue],
    ["quality_diagnostic", diagnostics]]) {
    for (const raw of items) {
      const item = safeItem(source, raw);
      byId.set(item.record_id, mergeItem(byId.get(item.record_id), item));
    }
  }
  for (const id of heldIds) {
    const item = byId.get(id);
    if (item) {
      item.categories.push("held_deferred");
      item.categories = [...new Set(item.categories)];
      item.recommendation = "Publishing hold is authoritative. Do not automatically publish, reapprove or release it.";
    }
  }
  const verification = snapshot.verification_recovery;
  const verificationOk = verification?.status === "ok" && Array.isArray(verification.items);
  const verificationRows = verificationOk ? verification.items : [];
  const pending = verificationRows.filter((x) =>
    x?.outcome === "pending_verification" || x?.outcome === "cooldown_waiting");
  const resolved = verificationOk && verification?.counts?.recovered_automatically != null && Number.isFinite(Number(verification.counts.recovered_automatically))
    ? Number(verification.counts.recovered_automatically) : null;
  const metrics = {
    needs_decision: unknown("Awaiting one authoritative administrator-decision inbox; cannot infer decisions from failure flags."),
    automatically_recovering: unknown("Existing recovery jobs are not yet represented by a complete, canonical in-flight census."),
    awaiting_verification: observedBucket(pending.length, verificationOk ? "ok" : "unavailable",
      "quality_agent_verification_signatures", "Observed Quality Agent verification signatures only; not a complete cross-platform count."),
    approved_past_due: observedBucket(overdue.length, pastDueOk ? "ok" : "unavailable",
      "QA-PUBLISH-001", "Observed approved-past-due candidates. Home parity not yet verified."),
    failed: observedBucket(failed.length, canonicalFailedOk ? "ok" : "unavailable",
      "independent_quality_agent_home_classifier",
      "Shared Home Failed predicate applied to independent, complete Airtable QA candidates. Exact-ID parity remains subject to verification."),
    quality_diagnostics: observedBucket(diagnostics.length, "ok", "quality_agent_diagnostic_scan",
      "Broader render, publish and manual-action diagnostic signals. Not equivalent to Home Failed."),
    suspected_duplicates: unknown("Duplicate registry is not yet attached to the center."),
    held_deferred: observedBucket(heldIds.size, rows.length || failed.length === 0 ? "ok" : "unavailable",
      "failed_output_census_only", "Held records observed in failed scan only. Other intentional holds are not counted."),
    resolved_last_7_days: observedBucket(resolved, resolved == null ? "unavailable" : "ok",
      "quality_agent_recovery_ledger", "Verified publication reconciliations only, not all forms of resolution."),
  };
  const items = [...byId.values()].map((item) => ({
    ...item, held: heldIds.has(item.record_id),
  })).sort((a,b) => (b.minutes_past_due || 0) - (a.minutes_past_due || 0)
      || Number(b.output_id || 0) - Number(a.output_id || 0));
  const visibleItems = items.filter((item) =>
    (!profileFilter || item.profile_id === profileFilter)
    && (!platformFilter || str(item.platform).toLowerCase() === platformFilter)
    && (!categoryFilter || item.categories.includes(categoryFilter)));
  return {
    status: pastDueOk && canonicalFailedOk && verificationOk ? "provisional" : "partial",
    as_of: asOf, read_only: true, source_of_truth: "airtable",
    completeness: {
      failed: canonicalFailedOk ? "independent_canonical_candidate_scan" : "unavailable",
      approved_past_due: pastDueOk ? "independent_canonical_candidate_scan" : "unavailable",
      verified_recovery: verificationOk ? "ledger_subset" : "unavailable",
      home_pipeline_parity: "unverified",
    },
    metrics, metric_scope: "all_profiles_unfiltered", items: visibleItems,
    visible_count: visibleItems.length,
    filters: { profile_id: profileFilter || null, platform: platformFilter || null,
      category: categoryFilter || null },
    warning: "QA buckets use Home predicates, but independent exact-ID parity is not proven until a fresh production census matches. Broader diagnostic signals remain separate.",
  };
}
