/**
 * Independently gated global Factory parent/child rollout.
 * The current production Chicago-only rollout remains unchanged. Merely
 * shipping these code paths never enables global approvals.
 */
import {
  FACTORY_BATCH_STAGING_BASE_ID, FACTORY_BATCH_PRODUCTION_BASE_ID,
} from "./factory-batch-rollout.mjs";

export const FACTORY_GLOBAL_MODE = "global_ig_reel_story_v1";
export function factoryGlobalPolicy(env) {
  const base=String(env?.AIRTABLE_BASE_ID||"");
  const staging=base===FACTORY_BATCH_STAGING_BASE_ID;
  const production=base===FACTORY_BATCH_PRODUCTION_BASE_ID;
  const enabled=String(env?.FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED||"").toLowerCase()==="true"
    && String(env?.FACTORY_BATCH_GLOBAL_MODE||"")===FACTORY_GLOBAL_MODE
    && String(env?.FACTORY_BATCH_GLOBAL_MAX_TOTAL||"")==="20"
    && String(env?.FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE||"")==="10"
    && (staging || (production &&
      String(env?.FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF||"")==="explicit-review"));
  return {enabled,mode:enabled?FACTORY_GLOBAL_MODE:"disabled",
    max_total:enabled?20:0,max_per_profile:enabled?10:0,
    allowed_platforms:enabled?["Instagram"]:[],
    allowed_formats:enabled?["Reel","Story"]:[]};
}
export function factoryGlobalAcceptsOutput(policy, record) {
  if (!policy?.enabled||!record?.fields) return false;
  return String(record.fields.Platform||"").trim()==="Instagram"
    && ["Reel","Story"].includes(String(
      record.fields.Studio_Output_Type||record.fields.Format||"").trim());
}
