/**
 * Durable, read-only Exception Recovery census snapshot.
 * Ordinary dashboard navigation is forbidden from launching an 8k-row
 * source scan. Only the explicit administrator Reconcile action may refresh.
 */
export const EXCEPTION_RECOVERY_CENSUS_R2_KEY="studio/state/exception-recovery-census-v1.json";
export const EXCEPTION_RECOVERY_CENSUS_MAX_AGE_MS=15*60*1000;
export function validExceptionRecoveryCensus(value,{nowMs=Date.now(),maxAgeMs=EXCEPTION_RECOVERY_CENSUS_MAX_AGE_MS}={}) {
  if(!value||value.status!=="complete_census"||value.source!=="airtable"||value.read_only!==true
    ||!Array.isArray(value.exception_items)||value.exception_items_truncated===true
    ||!Number.isInteger(value.source_row_count)||value.source_row_count<=0
    ||!value.totals||typeof value.totals!=="object"
    ||!Number.isInteger(value.exception_items_count)
    ||value.exception_items_count!==value.exception_items.length)return false;
  for(const key of ["outputs","approved_past_due","approved_missing_date","failed","held_deferred"]){
    const n=value.totals[key];
    if(!Number.isInteger(n)||n<0||n>value.source_row_count)return false;
  }
  const at=Date.parse(String(value.scan_completed_at||""));
  return Number.isFinite(at)&&at>0&&at<=nowMs+60000
    &&nowMs-at<=maxAgeMs
    &&Number.isFinite(maxAgeMs)&&maxAgeMs>0;
}
export async function readExceptionRecoveryCensusCache(media,{nowMs=Date.now()}={}){
  if(typeof media?.get!=="function")return null;
  try{
    const raw=await media.get(EXCEPTION_RECOVERY_CENSUS_R2_KEY);
    if(!raw)return null;
    const data=await raw.json();
    if(!validExceptionRecoveryCensus(data,{nowMs}))return null;
    return {...data,census_cache_status:"durable_fresh"};
  }catch{return null;}
}
export async function persistExceptionRecoveryCensusCache(media,data,{nowMs=Date.now()}={}){
  if(typeof media?.put!=="function"||typeof media?.get!=="function")
    return {status:"unavailable",reason:"R2 census store unavailable"};
  if(!validExceptionRecoveryCensus(data,{nowMs}))
    return {status:"unavailable",reason:"Incomplete or truncated source census cannot be cached"};
  try{
    await media.put(EXCEPTION_RECOVERY_CENSUS_R2_KEY,JSON.stringify(data),{
      httpMetadata:{contentType:"application/json"}});
    const proof=await readExceptionRecoveryCensusCache(media,{nowMs});
    if(!proof||proof.scan_completed_at!==data.scan_completed_at
      ||proof.source_row_count!==data.source_row_count)
      return {status:"unavailable",reason:"Census cache readback was not verified"};
    return {status:"durable_verified"};
  }catch{return {status:"unavailable",reason:"Census cache write/readback unavailable"};}
}
