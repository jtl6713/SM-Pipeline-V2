/** Exact incident audit. R2 GET/LIST only, no owner impersonation,
 * no claim seeding, no status changes, no provider or database writes. */
const ROOT="studio/state/factory-approvals/v2/";
const NYC="recgtK8Z7eNADNtVy",LA="recF7UAn0LkMZZrWZ",CHI="recT2rbKX3MF7cVFU";
const TARGETS=Object.freeze({
  [NYC]:{rectw2pvgnBzK3wCN:10853,recJ8jTynJDxsN0hl:10854},
  [CHI]:{rec9uodYpY4L6BvyQ:11166,recCYflzPH65HdbpS:11167,recyEgGuGKIrJw8Ca:11168,recckY9KlAJkWtXxO:11170},
  [LA]:{recztl5GuZhhS8dGE:11172,rec1EEHHhPAQmbm9X:11173,reco2npIhDFJmhNSM:11174,recauG5u3gDMDyFN0:11175,recnPrM827psgnJbd:11178,rec17r1eQJmcWl4hy:11180,recKsGoKjLnaHdlpg:11181,recaDRS4GJfkKjNQ3:11182,recnlndGlSR6uWNLR:11183,reckBsz193ABJH2Zj:11184,recMG942g1KpH2FkS:11185,recHV6did16UCcqFL:11186,recL7CGkpA6a6tAbr:11187},
});
const KNOWN=[];
const SINCE=Date.parse("2026-11-25T01:04:00Z");
const RID=/^[A-Za-z0-9_-]{12,128}$/;
const ACTOR=/^rec[A-Za-z0-9]{14}$/;
const ALL=new Map(Object.values(TARGETS).flatMap(rows=>Object.entries(rows)));
const safeError=e=>String(e||"").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").replace(/https?:\/\/\S+/gi,"[url]").replace(/[A-Za-z0-9_+=/-]{45,}/g,"[redacted]").slice(0,240);
async function read(bucket,key){
  const object=await bucket.get(key);
  if(!object)return null;
  if(Number(object.size)>8_000_000)throw Error("ledger_too_large");
  return JSON.parse(await object.text());
}
const targetItem=i=>({id:i.id,output_number:ALL.get(i.id),ledger_output_id:i.output_id??null,status:i.status,error:safeError(i.error),attempts:i.total_attempts??i.attempts??null,updated_at:i.updated_at??null,started_at:i.attempt_started_at??null,original_intent_recovery:i.original_intent_recovery===true,recovery_state:i.exception_recovery?.state??null});
export async function audit(bucket){
  const claims=[];const groupIds=new Set(KNOWN);
  for(const [profile,targets] of Object.entries(TARGETS)){
    const reg=await read(bucket,ROOT+"output-claims-v1/"+profile+".json");
    if(reg&&(reg.schema!=="studio.factory-output-claims.1"||reg.profile_id!==profile))throw Error("claim_registry_identity_mismatch");
    for(const [id,n] of Object.entries(targets)){
      const row=reg?.outputs?.[id];
      if(row?.request_id&&!RID.test(row.request_id))throw Error("invalid_request_identity");
      if(row?.request_id)groupIds.add(row.request_id);
      claims.push({profile,id,n,registry_present:!!reg,request_id:row?.request_id??null,at:row?.at??null,source:row?.source??null,previous_request_id:row?.previous_request_id??null});
      if(RID.test(row?.previous_request_id||""))groupIds.add(row.previous_request_id);
    }
  }
  // List at most three metadata pages and read at most 30 recent parents.
  // Never interpret a partial scan as proof that an owner never clicked.
  let cursor,complete=false;const candidates=[];
  for(let page=0;page<3;page++){
    const result=await bucket.list({prefix:ROOT+"groups/",limit:1000,...(cursor?{cursor}:{})});
    for(const item of result.objects||[]){
      if(Date.parse(item.uploaded)<SINCE)continue;
      const id=item.key.slice((ROOT+"groups/").length,-5);
      if(RID.test(id)&&item.key.endsWith(".json"))candidates.push({id,at:Date.parse(item.uploaded)});
    }
    if(!result.truncated){complete=true;break;}
    if(!result.cursor||result.cursor===cursor)throw Error("cursor_stalled");
    cursor=result.cursor;
  }
  candidates.sort((a,b)=>b.at-a.at);
  for(const c of candidates.slice(0,30))groupIds.add(c.id);
  const reports=[];
  for(const id of groupIds){
    const parent=await read(bucket,ROOT+"groups/"+id+".json");
    if(parent){
      if(parent.schema!=="studio.factory-approval-group.1"||parent.request_id!==id)throw Error("parent_identity_mismatch");
      if(!parent.records?.some(row=>ALL.has(row.id)))continue;
      const children=[];
      for(const child of parent.children||[]){
        if(!TARGETS[child.profile_id]||!RID.test(child.request_id||""))continue;
        const job=await read(bucket,ROOT+"jobs/"+child.profile_id+"/"+child.request_id+".json");
        if(job&&(job.request_id!==child.request_id||job.profile_id!==child.profile_id||job.group_request_id!==id))throw Error("child_identity_mismatch");
        children.push({profile_id:child.profile_id,request_id:child.request_id,present:!!job,created_at:job?.created_at??null,updated_at:job?.updated_at??null,status:job?.status??null,authenticated_actor_present:ACTOR.test(job?.submitted_by||""),items:(job?.items||[]).filter(i=>ALL.has(i.id)).map(targetItem)});
      }
      reports.push({request_id:id,kind:"group",created_at:parent.created_at,updated_at:parent.updated_at,authenticated_actor_present:ACTOR.test(parent.submitted_by||""),selection_size:parent.records.length,target_ids:parent.records.filter(r=>ALL.has(r.id)).map(r=>({n:ALL.get(r.id),id:r.id,profile_id:r.profile_id})),children});
    }else{
      for(const profile of Object.keys(TARGETS)){
        const job=await read(bucket,ROOT+"jobs/"+profile+"/"+id+".json");
        if(!job)continue;
        if(job.profile_id!==profile||job.request_id!==id)throw Error("local_job_identity_mismatch");
        const items=(job.items||[]).filter(i=>ALL.has(i.id)).map(targetItem);
        if(items.length)reports.push({request_id:id,kind:"local",profile_id:profile,created_at:job.created_at,updated_at:job.updated_at,authenticated_actor_present:ACTOR.test(job.submitted_by||""),status:job.status,items});
      }
    }
  }
  return {schema:"issue2959.factory-exact-19-audit.v1",read_only:true,claims,groups:reports,recent_scan:{since:new Date(SINCE).toISOString(),metadata_complete:complete,candidates:candidates.length,checked:Math.min(30,candidates.length),complete:complete&&candidates.length<=30}};
}
export default {async fetch(request,env){
  if(request.method!=="GET"||new URL(request.url).pathname!=="/report")return new Response("Not found",{status:404});
  if(!env.AUDIT_TOKEN||request.headers.get("Authorization")!=="Bearer "+env.AUDIT_TOKEN)return new Response("Unauthorized",{status:401});
  try{return Response.json(await audit(env.STUDIO_MEDIA),{headers:{"Cache-Control":"no-store"}});}
  catch{return Response.json({ok:false,error:"exact_intent_read_failed"},{status:503});}
}};
