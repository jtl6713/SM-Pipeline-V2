/**
 * Independently signed Global Factory rollout.
 * Pilot: 4 total, 2 per profile. Expanded: 20 total, 10 per profile.
 * Production is fail-closed for every other environment / value combination.
 *
 * Global V2 authorizes every currently implemented publishing platform/output
 * type while still routing each row through the canonical single-output Factory
 * approval transaction. Threads is intentionally absent because it is not an
 * implemented publishing destination.
 */
import {
  FACTORY_BATCH_STAGING_BASE_ID, FACTORY_BATCH_PRODUCTION_BASE_ID,
} from "./factory-batch-rollout.mjs";

export const FACTORY_GLOBAL_MODE = "global_all_platforms_v2";
export const FACTORY_GLOBAL_STAGES = Object.freeze({
  pilot: Object.freeze({max_total:4,max_per_profile:2}),
  expanded: Object.freeze({max_total:20,max_per_profile:10}),
});
export const FACTORY_GLOBAL_OUTPUT_TYPES = Object.freeze({
  Instagram: Object.freeze(["Reel","Story","Single Image","Carousel"]),
  Facebook: Object.freeze(["Reel","Story","Single Image","Multi-Image Post","Slideshow Reel"]),
  TikTok: Object.freeze(["Video Draft","Story","Single Photo","Multi-Photo"]),
  YouTube: Object.freeze(["Short","Standard Video","Slideshow Video"]),
});
const FACTORY_GLOBAL_PLATFORMS = Object.freeze(Object.keys(FACTORY_GLOBAL_OUTPUT_TYPES));
const FACTORY_GLOBAL_FORMATS = Object.freeze(
  [...new Set(Object.values(FACTORY_GLOBAL_OUTPUT_TYPES).flat())]
);

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
    allowed_platforms:enabled?[...FACTORY_GLOBAL_PLATFORMS]:[],
    allowed_formats:enabled?[...FACTORY_GLOBAL_FORMATS]:[],
    allowed_output_types_by_platform:enabled
      ? Object.fromEntries(Object.entries(FACTORY_GLOBAL_OUTPUT_TYPES).map(([platform,types])=>[platform,[...types]]))
      : {}};
}
export function factoryGlobalAcceptsOutput(policy, record) {
  if (!policy?.enabled||!record?.fields) return false;
  const platform=String(record.fields.Platform||"").trim();
  const type=String(record.fields.Studio_Output_Type||record.fields.Format||"").trim();
  const allowed=policy.allowed_output_types_by_platform?.[platform]||
    FACTORY_GLOBAL_OUTPUT_TYPES[platform];
  return Array.isArray(allowed)&&allowed.includes(type);
}
