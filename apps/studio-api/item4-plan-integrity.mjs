/**
 * Output plan integrity contract shared by production APIs.
 *
 * A stored "Ready" flag does not make a missing/zero-item plan usable.
 * Read projections must fail closed. Rebuilding active plans is performed by
 * the existing authenticated Ready-production dispatcher, never by a GET.
 */
export function item4EffectivePlanStatus(storedStatus, parsedPlan, requestStatus = "Draft") {
  const raw = String(storedStatus || "Needs Plan").trim() || "Needs Plan";
  if (raw !== "Ready") return { status: raw, invalid: false, issue: null };
  const items = Array.isArray(parsedPlan?.items) ? parsedPlan.items : [];
  const valid = items.length > 0 && items.every(item =>
    item && typeof item === "object"
    && String(item.platform || "").trim()
    && String(item.output_type || "").trim()
  );
  if (valid) return { status: raw, invalid: false, issue: null };
  // Never reset a historical promoted request or its human-reviewed outputs
  // as a side effect of a read. Route those to explicit data reconciliation.
  const promoted = ["Promoted", "Submitted"].includes(String(requestStatus || "").trim());
  return {
    status: promoted ? "Needs Review" : "Needs Plan",
    invalid: true,
    issue: "ready_plan_missing_output_items",
  };
}



/**
 * Verify a saved Item 4 plan against actual enabled, persisted destination rows.
 * The write API must not use successful batch-create echoes as proof of commit.
 * Compare by exact platform + output_type; no read or mutation side effects.
 */
export function item4DestinationParity(items = [], rows = []) {
  const key = (row) => `${String(row?.platform || "").trim()}::${String(row?.output_type || "").trim()}`;
  const expected = new Set((Array.isArray(items) ? items : []).map(key));
  const enabled = (Array.isArray(rows) ? rows : []).filter((row) => row?.enabled === true);
  const counts = new Map();
  for (const row of enabled) counts.set(key(row), (counts.get(key(row)) || 0) + 1);
  const missing = [...expected].filter((id) => !counts.has(id));
  const duplicates = [...counts].filter(([, count]) => count !== 1).map(([id]) => id);
  const unplanned = [...counts.keys()].filter((id) => !expected.has(id));
  return {
    ok: expected.size > 0 && missing.length === 0 && duplicates.length === 0 && unplanned.length === 0,
    expected_count: expected.size,
    enabled_count: enabled.length,
    missing,
    duplicates,
    unplanned,
  };
}
