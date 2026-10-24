/**
 * Conservative recovery for autonomous proposals whose initial plan and
 * companion rows were generated in the same burst. Operator-owned rows are
 * never changed here. A photo plan does not authorize unplanned video outputs.
 */
export function autonomousPlanOutputSpilloverRepair({ request = {}, plan = null, rows = [] } = {}) {
  const no = (reason) => ({ repair: false, reason, disableIds: [] });
  const note = String(request.notes || "");
  if (!/(?:^|\n)origin=autonomous(?:\n|$)/i.test(note)) return no("not_autonomous");
  if (request.active !== true || request.revisionOpen || request.promoted || !["Draft", "Ready"].includes(request.status)) {
    return no("operator_or_promotion_gate");
  }
  if (request.masterStatus !== "Ready" || request.planStatus !== "Ready"
      || request.variantStatus !== "Ready") return no("pipeline_not_ready");
  if (plan?.schema_version !== "item4.output-plan.1" || !Array.isArray(plan.items)
      || !plan.items.length) return no("no_authoritative_plan");
  const created = Date.parse(String(request.createdAt || ""));
  const generated = Date.parse(String(plan.generated_at || ""));
  if (!Number.isFinite(created) || !Number.isFinite(generated)
      || generated < created - 60_000 || generated > created + 15 * 60_000) {
    return no("plan_not_initial");
  }
  if (Number(plan.source_asset_count) !== Number(request.masterAssetCount)) {
    return no("media_count_changed");
  }
  const key = (platform, type) => String(platform || "").trim() + "::" + String(type || "").trim();
  const planned = new Set(plan.items.map((row) => key(row.platform, row.output_type)));
  if (planned.size !== plan.items.length || rows.length <= planned.size) {
    return no("no_automatic_spillover");
  }
  // Every participating output must be the original untouched Draft from the
  // original planning burst. Any manual edit, pipeline link or disabled choice
  // is a hard stop; never second-guess an operator's selected destinations.
  const clean = rows.every((row) => {
    const made = Date.parse(String(row.createdAt || ""));
    const edited = Date.parse(String(row.updatedAt || ""));
    return row.id && row.enabled === true && row.active === true
      && row.status === "Draft" && !row.hasPlatformOutput
      && Number.isFinite(made) && Number.isFinite(edited)
      && Math.abs(edited - made) <= 1500
      && Math.abs(made - generated) <= 5 * 60_000;
  });
  if (!clean) return no("output_edited_or_not_draft");
  const present = new Set(rows.map((row) => key(row.platform, row.outputType)));
  if (![...planned].every((item) => present.has(item))) return no("planned_output_missing");
  const extras = rows.filter((row) => !planned.has(key(row.platform, row.outputType)));
  if (!extras.length || extras.length > 8) return no("no_bounded_spillover");
  return { repair: true, reason: "untouched_autonomous_companion_spillover",
    disableIds: extras.map((row) => row.id) };
}
