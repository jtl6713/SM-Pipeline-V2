/** Read-only, separate-request QA exact-ID proof against a complete saved source census. */
const empty=(status,reason)=>({status,reason,home_count:null,quality_agent_count:null,
  missing_in_quality_agent:null,extra_quality_agent:null});
const validId=x=>/^rec[A-Za-z0-9]{14}$/.test(String(x||""));
function ids(items,category){
 const values=(items||[]).filter(x=>Array.isArray(x?.categories)&&x.categories.includes(category))
   .map(x=>x.record_id);
 if(values.some(x=>!validId(x))||new Set(values).size!==values.length)return null;
 return new Set(values);
}
function compare(home,qa){
 const missing=[...home].filter(x=>!qa.has(x)),extra=[...qa].filter(x=>!home.has(x));
 return {status:missing.length||extra.length?"mismatch":"matched",home_count:home.size,
   quality_agent_count:qa.size,missing_in_quality_agent:missing.length,
   extra_quality_agent:extra.length,missing_ids_sample:missing.slice(0,30),
   extra_ids_sample:extra.slice(0,30)};
}
export function compareIndependentQaCensus(source,qa,{maxSkewMs=300000}={}){
 const unavailable=reason=>({status:"unavailable",reason,
   failed:empty("unavailable",reason),approved_past_due:empty("unavailable",reason)});
 if(source?.status!=="complete_census"||source?.exception_items_truncated!==false||
   !Array.isArray(source?.exception_items)||!source?.totals)
   return unavailable("source_census_incomplete_or_truncated");
 const sourceAt=Date.parse(source.scan_completed_at),qaAt=Date.parse(qa?.as_of);
 if(!Number.isFinite(sourceAt)||!Number.isFinite(qaAt)||
    Math.abs(qaAt-sourceAt)>maxSkewMs)return unavailable("source_quality_agent_generation_too_far_apart");
 if(!["provisional","partial"].includes(qa?.status)||!Array.isArray(qa?.items))
   return unavailable("independent_quality_agent_unavailable");
 const results={status:"complete",source_scan_at:source.scan_completed_at,
   quality_agent_scan_at:qa.as_of,scan_skew_ms:qaAt-sourceAt};
 for(const cat of ["failed","approved_past_due"]){
   const home=ids(source.exception_items,cat),quality=ids(qa.items,cat);
   const observed=qa.metrics?.[cat]?.observed;
   if(!home||!quality||home.size!==Number(source.totals[cat])||
     qa.metrics?.[cat]?.status!=="provisional"||
     !Number.isInteger(observed)||observed!==quality.size){
      results[cat]=empty("unavailable","incomplete_or_conflicting_"+cat+"_scope");
      results.status="partial";
      continue;
   }
   results[cat]=compare(home,quality);
   if(results[cat].status==="mismatch")results.status="mismatch";
 }
 return results;
}
