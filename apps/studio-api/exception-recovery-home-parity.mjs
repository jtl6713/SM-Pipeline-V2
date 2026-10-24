/**
 * Reconcile one complete Airtable census with a pinned durable Home generation.
 * Never imply snapshot equivalence when Home changes while Airtable is scanned.
 * The comparison is observational: the two reads are not one DB transaction.
 */
const COUNT_FIELDS=["approved_past_due","approved_missing_date","failed"];
const iso=n=>Number.isFinite(n)&&n>0?new Date(n).toISOString():null;
export function compareHomeSnapshotToExceptionCensus(census,before,after,{scanAtMs=Date.now(),maxSnapshotAgeMs=120000}={}) {
  const base={status:"unavailable",snapshot_generation:null,snapshot_at:null,
    scope:"Home active profiles only",comparison_fields:COUNT_FIELDS,
    compared_profiles:0,differences:[],missing_in_home:[],missing_in_census:[],
    note:"Census and Home snapshot are distinct reads, not one atomic database transaction."};
  if(!census||census.status!=="complete_census"||!census.by_profile)
    return {...base,status:"incomplete_census"};
  const valid=s=>s?.complete===true&&Number(s.schemaVersion)===6
    &&typeof s.generation==="string"&&s.generation.length>0&&Array.isArray(s.rows)&&s.rows.length>0;
  if(!valid(before)||!valid(after))return base;
  if(before.generation!==after.generation)
    return {...base,status:"generation_changed_during_census",
      snapshot_generation:after.generation,snapshot_at:iso(Number(after.at)),
      note:"Home was refreshed during this census; no stable generation can be compared."};
  const snapshotAt=Number(after.at);
  const metadata={...base,snapshot_generation:after.generation,snapshot_at:iso(snapshotAt)};
  const ageMs=scanAtMs-snapshotAt;
  if(!Number.isFinite(ageMs)||ageMs<0||ageMs>maxSnapshotAgeMs)
    return {...metadata,status:"snapshot_too_old",snapshot_age_ms:ageMs,
      note:"Home generation is older than the allowed comparison window; rebuild Home before evaluating parity."};
  const records=new Map();
  for(const p of after.rows) {
    if(!p?.id||records.has(p.id))return {...metadata,status:"invalid_home_profile_scope"};
    records.set(p.id,p);
  }
  const scanned=new Map(Object.entries(census.by_profile).filter(([id])=>id!=="unassigned"));
  const differences=[];
  for(const [id,live] of scanned){
    const home=records.get(id);
    if(!home)continue;
    for(const k of COUNT_FIELDS){
      if(!Number.isFinite(Number(live[k]))||!Number.isFinite(Number(home[k])))
        return {...metadata,status:"invalid_home_metric",metric:k,profile_id:id};
      if(Number(live[k])!==Number(home[k]))
        differences.push({profile_id:id,metric:k,airtable:Number(live[k]),home:Number(home[k])});
    }
  }
  const missingInHome=[...scanned.keys()].filter(id=>!records.has(id));
  const missingInCensus=[...records.keys()].filter(id=>!scanned.has(id));
  const status=differences.length?"mismatch"
    :missingInHome.length||missingInCensus.length?"incomplete_profile_scope":"counts_match_stable_generation";
  return {...metadata,status,snapshot_age_ms:ageMs,
    compared_profiles:[...scanned.keys()].filter(id=>records.has(id)).length,
    differences,missing_in_home:missingInHome,missing_in_census:missingInCensus,
    note:status==="counts_match_stable_generation"
      ?"Counts agree against one unchanged, recent Home generation; this is not an atomic cross-system snapshot."
      :"Home and the current Airtable census are not fully reconciled. No automatic action is authorized."};
}
