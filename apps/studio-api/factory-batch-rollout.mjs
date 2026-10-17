/**
 * Production Factory Batch approval rollout policy.
 *
 * Production is fail-closed: only the configured Chicago Instagram Reel
 * single-output canary can use the POST. No YouTube, Stories, TikTok,
 * Carousel, cross-profile, or multi-output batches are permitted in phase 1.
 *
 * The explicitly isolated staging Airtable base retains its broader synthetic
 * acceptance behavior; it never grants permissions to a production Airtable base.
 */
export const FACTORY_BATCH_STAGING_BASE_ID = "appJ0ox62OMfZuE1v";
export const FACTORY_BATCH_PRODUCTION_BASE_ID = "appe33zkZn35yirTL";
export const FACTORY_BATCH_CHICAGO_PROFILE_ID = "recT2rbKX3MF7cVFU";
export const FACTORY_BATCH_CANARY_MODE = "chicago_ig_reel_v1";
export const FACTORY_BATCH_MULTI_REEL_MODE = "chicago_ig_reels_v2";

export function factoryBatchRolloutPolicy(env, selectedProfileId = "") {
  const base = String(env?.AIRTABLE_BASE_ID || "");
  const flag = String(env?.FACTORY_BATCH_APPROVALS_ENABLED || "").trim().toLowerCase() === "true";
  if (base === FACTORY_BATCH_STAGING_BASE_ID) {
    return {
      enabled: flag,
      mode: "isolated_staging",
      max_items: 100,
      profile_id: selectedProfileId || "",
      platform: "",
      output_type: "",
    };
  }
  const selectedMode = String(env?.FACTORY_BATCH_ROLLOUT_MODE || "");
  const expectedMax = selectedMode === FACTORY_BATCH_CANARY_MODE ? 1 :
    selectedMode === FACTORY_BATCH_MULTI_REEL_MODE ? 5 : 0;
  const configured = base === FACTORY_BATCH_PRODUCTION_BASE_ID
    && expectedMax > 0
    && String(env?.FACTORY_BATCH_ROLLOUT_MAX_ITEMS || "") === String(expectedMax);
  const profile = FACTORY_BATCH_CHICAGO_PROFILE_ID;
  return {
    enabled: flag && configured && (!selectedProfileId || selectedProfileId === profile),
    mode: configured ? selectedMode : "disabled",
    max_items: configured ? expectedMax : 0,
    profile_id: configured ? profile : "",
    platform: configured ? "Instagram" : "",
    output_type: configured ? "Reel" : "",
  };
}

export function factoryBatchRolloutAcceptsOutput(policy, output) {
  if (!policy?.enabled || !output?.fields) return false;
  if (policy.mode === "isolated_staging") return true;
  if (![FACTORY_BATCH_CANARY_MODE, FACTORY_BATCH_MULTI_REEL_MODE].includes(policy.mode)) return false;
  const platform = String(output.fields.Platform || "").trim();
  const type = String(output.fields.Studio_Output_Type || output.fields.Format || "").trim();
  return platform === "Instagram" && type === "Reel";
}

export function factoryBatchRolloutAcceptsIds(policy, ids) {
  const unique = new Set((Array.isArray(ids) ? ids : []).map(String));
  return policy?.enabled === true
    && unique.size > 0 && unique.size <= Number(policy.max_items || 0)
    && [...unique].every(id => /^rec[A-Za-z0-9]+$/.test(id));
}
