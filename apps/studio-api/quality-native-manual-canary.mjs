// Version-controlled, exact manual canary policy. No new Cloudflare bindings.
// Existing tenant-admin authorization and runtime kill switch still apply.
export const qualityNativeManualCanary=Object.freeze({
  schema:"quality-native-manual-canary-v1",enabled:true,record_id:"rec8I104V9gQmiOxf",
  output_number:10857,human_approval_required:true,request_revision:5,
});
export function manualQualityCanaryTarget(env){
  return qualityNativeManualCanary.enabled===true &&
    env.QUALITY_FACTORY_HANDOFF_CRON_DISABLED!=="true" &&
    !env.QUALITY_FACTORY_HANDOFF_REPAIR_CANARY_RECORD_ID
    ? qualityNativeManualCanary.record_id : null;
}
