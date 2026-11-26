/**
 * #3094: bounded, read-only calibration of the creative alignment evidence
 * contract. This is NOT production enforcement or a model implementation.
 * A protected caller must supply exact canonical snapshots, independently
 * reviewed human labels and an authorized semantic reviewer.
 */
import {buildCreativeAlignmentContext,assessCreativeAlignmentShadow} from "./creative-alignment-shadow.mjs";

const LABELS=new Set(["valid","uncertain","material_mismatch","technical_failure"]);
const STRATA=new Set(["broad_city","specific_landmark","mixed_b_roll","day_night","sparse_metadata","explicit_scene","technical_failure"]);
const PROFILES=new Set(["Chicago","New York","Los Angeles","Miami"]);
const MAX_SAMPLE=16;
const validText=x=>typeof x==="string"&&x.trim().length>0;
const metrics=()=>({sampled:0,assessed:0,reviewer_unavailable:0,invalid_context:0,
  valid:0,uncertain:0,material_mismatch:0,technical_failure:0,
  pass:0,warn_pass_through:0,repair:0,exception:0,
  false_repair:0,uncertain_repair:0,missed_mismatch:0,missed_technical_failure:0,
  reviewer_latency_ms_total:0,time_to_factory_ms_total:0,time_to_factory_observed:0});
function accumulate(m,row) {
  m.sampled++;m[row.human_label]++;
  if(row.status!=="assessed"){m[row.status]++;return;}
  m.assessed++;m[row.disposition]++;
  if(row.human_label==="valid"&&["repair","exception"].includes(row.disposition))m.false_repair++;
  if(row.human_label==="uncertain"&&["repair","exception"].includes(row.disposition))m.uncertain_repair++;
  if(row.human_label==="material_mismatch"&&row.disposition!=="repair")m.missed_mismatch++;
  if(row.human_label==="technical_failure"&&row.disposition!=="exception")m.missed_technical_failure++;
  m.reviewer_latency_ms_total+=row.reviewer_latency_ms;
  if(row.time_to_factory_ms!==null){m.time_to_factory_observed++;m.time_to_factory_ms_total+=row.time_to_factory_ms;}
}
function withDeadline(review,context,timeoutMs) {
  const controller=new AbortController();
  let timer;
  return Promise.race([
    Promise.resolve().then(()=>review(context,{signal:controller.signal})),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("review timeout"));},timeoutMs);}),
  ]).finally(()=>clearTimeout(timer));
}
/**
 * Sample records: exact output_id/revision, profile_group, stratum,
 * independent human_label, canonical context input, optional observed
 * time_to_factory_ms. Never derive a human label from reviewer output.
 *
 * No DB writes, re-render, publishing or automated activation. The semantic
 * reviewer receives only context, never a label. Review requests are serial
 * and capped. On timeout/error, stop issuing new model calls in this batch:
 * an underlying reviewer may still be consuming resources after abort.
 */
export async function calibrateCreativeAlignmentShadow({samples,review,timeoutMs=10000,clock=Date.now}={}) {
  if(!Array.isArray(samples)||!samples.length||samples.length>MAX_SAMPLE)
    throw Error("Calibration sample outside bounded batch");
  if(typeof review!=="function"||typeof clock!=="function"||
      !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)
    throw Error("Bounded semantic reviewer required");
  const keys=new Set();
  for(const sample of samples){
    if(!validText(sample?.output_id)||!validText(sample?.revision)||
       !PROFILES.has(sample.profile_group)||!STRATA.has(sample.stratum)||
       !LABELS.has(sample.human_label))throw Error("Exact independently labeled sample required");
    const key=JSON.stringify([sample.output_id,sample.revision]);
    if(keys.has(key))throw Error("Duplicate output revision in calibration sample");
    keys.add(key);
  }
  const total=metrics(), by_profile={}, by_stratum={}, rows=[];
  let unavailable=false;
  for(const sample of samples){
    const row={output_id:sample.output_id,revision:sample.revision,profile_group:sample.profile_group,
      stratum:sample.stratum,human_label:sample.human_label,status:"assessed",
      disposition:null,reviewer_latency_ms:0,
      time_to_factory_ms:Number.isFinite(sample.time_to_factory_ms)&&sample.time_to_factory_ms>=0?
        sample.time_to_factory_ms:null};
    let context;
    try{
      context=buildCreativeAlignmentContext(sample.context);
      // Exact profile grouping must be attested by the independently reviewed
      // context; a sample may not masquerade as another city for coverage.
      if(context.profile.city!==sample.profile_group)throw Error("Sample profile mismatch");
    }catch{row.status="invalid_context";}
    if(row.status==="assessed"){
      if(context.existing_technical_failures.length){
        row.disposition=assessCreativeAlignmentShadow(context,{}).proposed_disposition;
      }else if(unavailable){row.status="reviewer_unavailable";}
      else{
        const started=clock();
        try{
          // Do not let the injected reviewer mutate the evidence later used
          // by the adjudicator, or see independently assigned labels.
          const result=await withDeadline(review,structuredClone(context),timeoutMs);
          if(!result||!Array.isArray(result.findings))throw Error("Malformed review");
          row.disposition=assessCreativeAlignmentShadow(context,result).proposed_disposition;
        }catch{row.status="reviewer_unavailable";unavailable=true;}
        row.reviewer_latency_ms=Math.max(0,clock()-started);
      }
    }
    rows.push(row);
    accumulate(total,row);
    accumulate(by_profile[row.profile_group]??=metrics(),row);
    accumulate(by_stratum[row.stratum]??=metrics(),row);
  }
  return {schema:"studio.creative_alignment.calibration.1",mode:"shadow",
    total,by_profile,by_stratum,rows,
    missing_profiles:[...PROFILES].filter(x=>!by_profile[x]?.assessed),
    missing_strata:[...STRATA].filter(x=>!by_stratum[x]?.assessed),
    complete_batch:total.assessed===total.sampled,
    enforcement_authorized:false,repair_authorized:false,publishing_authorized:false,
    activation_recommendation:"requires_independent_human_review_and_live_evidence",
    approval_actions:0,schedule_actions:0,publish_actions:0};
}
