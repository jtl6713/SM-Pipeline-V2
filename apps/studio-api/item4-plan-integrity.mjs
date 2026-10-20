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
 * Low-burn list projection. Only inspect the first planned item's signature;
 * do not JSON.parse potentially multi-MB plan strings on open/list routes.
 * The full editor and GET plan endpoints use the strict parsed validator.
 */
export function item4EffectivePlanStatusLight(storedStatus, rawPlan, requestStatus = "Draft") {
  const rawStatus = String(storedStatus || "Needs Plan").trim() || "Needs Plan";
  if (rawStatus !== "Ready") return { status: rawStatus, invalid: false, issue: null };
  const source = typeof rawPlan === "string" ? rawPlan : "";
  const marker = /"items"\s*:\s*\[/g.exec(source);
  if (marker) {
    let at = marker.index + marker[0].length;
    while (at < source.length && /\s/.test(source[at])) at++;
    if (source[at] === "{") {
      const firstItem = source.slice(at, at + 2048);
      const firstEnd = firstItem.indexOf("}");
      const header = firstEnd >= 0 ? firstItem.slice(0, firstEnd + 1) : firstItem;
      if (/"platform"\s*:\s*"[^"]+"/.test(header) && /"output_type"\s*:\s*"[^"]+"/.test(header)) {
        return { status: "Ready", invalid: false, issue: null };
      }
    }
  }
  return item4EffectivePlanStatus("Ready", null, requestStatus);
}
