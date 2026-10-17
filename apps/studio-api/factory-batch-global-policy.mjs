/**
 * Independently signed Global Factory rollout.
 * Pilot: 4 total, 2 per profile. Expanded: 20 total, 10 per profile.
 * Production is fail-closed for every other environment / value combination.
 * Chicago Instagram Reels v2 remains an independent rollout.
 */
import {
  FACTORY_BATCH_STAGING_BASE_ID, FACTORY_BATCH_PRODUCTION_BASE_ID,
} from "./factory-batch-rollout.mjs";

export const FACTORY_GLOBAL_MODE = "global_ig_reel_story_v1";
export const FACTORY_GLOBAL_STAGES = Object.freeze({
  pilot: Object.freeze({max_total:4,max_per_profile:2}),
  expanded: Object.freeze({max_total:20,max_per_profile:10}),
});
export function factoryGlobalPolicy(env) {
  const base=String(env?.AIRTABLE_BASE_ID||"");
  const staging=base===FACTORY_BATCH_STAGING_BASE_ID;
  const production=base===FACTORY_BATCH_PRODUCTION_BASE_ID;
  const enabledFlag=String(env?.FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED||"").toLowerCase()==="true";
  const mode=String(env?.FACTORY_BATCH_GLOBAL_MODE||"");
  const total=String(env?.FACTORY_BATCH_GLOBAL_MAX_TOTAL||"");
  const perProfile=String(env?.FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE||"");
  const stage=Object.entries(FACTORY_GLOBAL_STAGES)
    .find(([,caps])=>total===String(caps.max_total)&&perProfile===String(caps.max_per_profile))?.[0]||"disabled";
  const signed=String(env?.FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF||"")==="explicit-review";
  const enabled=enabledFlag&&mode===FACTORY_GLOBAL_MODE&&Boolean(stage!=="disabled")&&
    (staging||(production&&signed));
  return {enabled,stage:enabled?stage:"disabled",
    mode:enabled?FACTORY_GLOBAL_MODE:"disabled",
    max_total:enabled?FACTORY_GLOBAL_STAGES[stage].max_total:0,
    max_per_profile:enabled?FACTORY_GLOBAL_STAGES[stage].max_per_profile:0,
    allowed_platforms:enabled?["Instagram"]:[],
    allowed_formats:enabled?["Reel","Story"]:[]};
}
export function factoryGlobalAcceptsOutput(policy, record) {
  if (!policy?.enabled||!record?.fields) return false;
  return String(record.fields.Platform||"").trim()==="Instagram"
    && ["Reel","Story"].includes(String(
      record.fields.Studio_Output_Type||record.fields.Format||"").trim());
}
