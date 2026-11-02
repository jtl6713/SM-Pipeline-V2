/** #1495 non-Vibe deployment evidence gate. Pure validation, never deployment authorization.
 * Real Admin QA may consume this contract, but cannot fabricate proofs.
 */
const REQUIRED=[
 "generation_rights","factory_mae","admin_qa","chicago_canary",
 "la_canary","nyc_canary","miami_canary","ci_exact_head",
 "airtable_drive_readback","supabase_reconcile","versions"
];
const SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
const iso=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s)&&!Number.isNaN(Date.parse(s));
const val=s=>typeof s==="string"&&s.length>=8&&s.length<=512;
export const nativeGalleryRequiredReleaseEvidence=Object.freeze([...REQUIRED]);
export function evaluateNativeGalleryReleaseGate({head_sha,evidence,production_flags}={}){
 const blockers=[];
 if(!SHA.test(String(head_sha||"")))blockers.push("invalid_exact_head");
 if(!evidence||typeof evidence!=="object"||Array.isArray(evidence))
   return {ready:false,blockers:[...blockers,...REQUIRED.map(k=>"missing_"+k)]};
 for(const key of REQUIRED){
   const item=evidence[key];
   if(!item||typeof item!=="object"||Array.isArray(item)||
     item.result!=="pass"||item.mocked!==false||
     !val(item.evidence_url)||!/^https:\/\//.test(item.evidence_url)||
     !iso(item.executed_at_utc)||item.head_sha!==head_sha||
     !val(item.tester)||!val(item.deployment_id)||
     !HASH.test(String(item.receipt_sha256||"")))
       blockers.push("unverified_"+key);
 }
 if(!production_flags||typeof production_flags!=="object"||Array.isArray(production_flags)||
   Object.values(production_flags).some(v=>v!==false))
   blockers.push("unsafe_production_flags");
 return {ready:blockers.length===0,blockers};
}
