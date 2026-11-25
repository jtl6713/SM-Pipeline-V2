/**
 * #3094 creative alignment: shadow-mode evidence contract.
 *
 * The semantic reviewer (not this module) understands title, caption,
 * profile, creative brief, storyboard and visual classifications together.
 * This module builds a bounded review context and adjudicates its structured
 * evidence. It never schedules, publishes, creates holds, replaces assets,
 * or introduces a new technical gate.
 *
 * No filename/keyword match or numeric confidence cutoff is used.
 */
const text = value => typeof value === "string" ? value.trim() : "";
const array = value => Array.isArray(value) ? value : [];
const nonempty = value => Boolean(text(value));
const semanticEvidence = new Set(["classification","visual","verified_location","approved_scene"]);
const boundedText = (value, max) => text(value).slice(0,max);

/** Caller supplies canonical, actual selected/rendered asset rows, not search suggestions. */
export function buildCreativeAlignmentContext({ profile, title, caption, storyboard,
  platform, format, assets, technicalFailures } = {}) {
  const rows = array(assets);
  // Do not silently omit any asset from evaluation or claim a complete sample
  // when the input exceeds its bounded transport. Use a separate bounded scan.
  if (!rows.length || rows.length > 100) throw new Error("Actual asset inventory missing or outside review budget");
  const ids = rows.map(row=>text(row?.id));
  if (ids.some(id=>!id) || new Set(ids).size!==ids.length) throw new Error("Asset identities must be exact and unique");
  return {
    profile: { id:text(profile?.id), scope:boundedText(profile?.scope,1000), city:boundedText(profile?.city,200) },
    title:boundedText(title,500),
    caption:boundedText(caption,5000),
    storyboard: storyboard ?? null,
    platform:boundedText(platform,80),
    format:boundedText(format,80),
    assets:rows.map(row=>({
      id:text(row.id), use:boundedText(row.use,80), scene_ids:array(row.scene_ids).map(text).filter(Boolean),
      classification:row.classification ?? null,
      visual_evidence:row.visual_evidence ?? null,
      verified_location:row.verified_location ?? null,
      provenance:row.provenance ?? null,
    })),
    existing_technical_failures:array(technicalFailures).filter(nonempty).map(value=>boundedText(value,300)),
  };
}

const result = (disposition, reason, findings=[]) => ({
  mode:"shadow", proposed_disposition:disposition, reason, findings,
  // A shadow recommendation has no action authority. Existing technical and
  // rights preflight still runs separately and must never be bypassed.
  creative_enforcement_enabled:false, repair_authorized:false,
  creates_publishing_hold:false, requires_manual_production:false,
  approval_actions:0, schedule_actions:0, publish_actions:0,
});

/**
 * review.findings is a semantic reviewer's structured assessment for each
 * actual asset. Allowed verdicts: supports, plausible_b_roll, uncertain,
 * material_contradiction. A contradiction must cite two distinct present
 * evidence categories with explicit reasoning and a specific required
 * story/profile/scene relationship. Two tags from one classification are
 * not independent corroboration. The caller is responsible for verifying
 * the evidence source provenance; unrecognized or absent evidence is ignored.
 */
export function assessCreativeAlignmentShadow(context, review) {
  if (array(context?.existing_technical_failures).length) {
    return result("exception","existing_mandatory_technical_failure");
  }
  const assets = array(context?.assets);
  if (!nonempty(context?.profile?.id) || !nonempty(context?.profile?.scope) ||
      !nonempty(context?.title) || !nonempty(context?.caption) ||
      !nonempty(context?.platform) || !nonempty(context?.format) || !assets.length) {
    return result("warn_pass_through","incomplete_creative_context");
  }
  const findings = array(review?.findings);
  const ids = new Set(assets.map(asset=>asset.id));
  const seen = new Set();
  if (findings.some(finding=>!ids.has(finding?.asset_id) ||
      seen.has(finding.asset_id) || !seen.add(finding.asset_id))) {
    return result("warn_pass_through","review_asset_identity_unverified");
  }
  const repairs=[], warnings=[];
  for (const asset of assets) {
    const finding = findings.find(row=>row.asset_id===asset.id);
    if (!finding) { warnings.push({asset_id:asset.id,reason:"asset_not_assessed"}); continue; }
    const evidence = new Set();
    for (const item of array(finding.evidence)) {
      if (!semanticEvidence.has(item?.source) || !nonempty(item?.reason)) continue;
      if (item.source==="classification" && asset.classification) evidence.add(item.source);
      if (item.source==="visual" && asset.visual_evidence) evidence.add(item.source);
      if (item.source==="verified_location" && asset.verified_location) evidence.add(item.source);
      if (item.source==="approved_scene" && context.storyboard && asset.scene_ids.length) evidence.add(item.source);
    }
    if (finding.verdict==="supports" || finding.verdict==="plausible_b_roll") {
      if (!evidence.size) warnings.push({asset_id:asset.id,reason:"support_evidence_missing"});
      continue;
    }
    if (finding.verdict==="material_contradiction" && nonempty(finding.required_relationship)
        && nonempty(finding.reason) && evidence.size>=2
        && finding.material_to_story===true) {
      // Only a targeted recommendation, never an automatic repair in shadow.
      repairs.push({asset_id:asset.id,reason:boundedText(finding.reason,300),
        required_relationship:boundedText(finding.required_relationship,300), evidence_sources:[...evidence]});
    } else {
      warnings.push({asset_id:asset.id,reason:"uncertain_or_uncorroborated_alignment"});
    }
  }
  if (repairs.length) return result("repair","corroborated_material_contradiction",repairs);
  if (warnings.length) return result("warn_pass_through","ambiguous_or_incomplete_evidence",warnings);
  return result("pass","semantic_relevance_supported");
}
