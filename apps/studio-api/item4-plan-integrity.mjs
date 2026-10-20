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

