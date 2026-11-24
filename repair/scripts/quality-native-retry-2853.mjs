// Temporary protected service-binding bridge for the exact #10857 test.
// No direct data bindings, secrets from production, arbitrary paths or approval.
const target="rec8I104V9gQmiOxf";
const safeReason=new Set(["shared_admission_denied","no_matching_canary_candidate","source_or_factory_claim_unverified",
  "repair_requires_reconciliation","exact_rebuild_revision_already_attempted","media_rebuilt_review_required",
  "no_documented_safe_media_rebuild","no_public_blocker_code","exact_canary_lookup_unavailable"]);
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(!env.AUDIT_TOKEN||request.headers.get("Authorization")!=="Bearer "+env.AUDIT_TOKEN)
    return new Response("Unauthorized",{status:401});
  const operation=url.pathname;
  const routes={"/workload":"/api/admin/qa/workload","/run":"/api/admin/qa/quality-native-repair/run","/factory":"/api/factory/desk"};
  if(!Object.hasOwn(routes,operation)||url.search||request.method!==(operation==="/run"?"POST":"GET"))
    return new Response("Not found",{status:404});
  const response=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com"+routes[operation],{
    method:request.method,headers:{"Cf-Access-Authenticated-User-Email":"joseph.t.logan@gmail.com",
      "Origin":"https://studio.chicagoshining.com","Accept":"application/json","Content-Type":"application/json"},
    body:operation==="/run"?JSON.stringify({record_id:target}):undefined,
  }));
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result)return Response.json({ok:false,http:response.status},{status:response.ok?502:response.status});
  if(operation==="/workload"){
    const r=result.runner||{},w=result.worker||{};
    const num=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
    return Response.json({ok:result.ok===true,scope:result.scope==="single_windows_host"?"single_windows_host":"unknown",
      runner:{active_jobs:num(r.active_jobs),queued_jobs:num(r.queued_jobs),paused_jobs:num(r.paused_jobs),
        active_worker_heavy:num(r.active_worker_heavy),combined_heavy_active:num(r.combined_heavy_active),max_jobs:num(r.max_jobs),
        admission_paused:r.admission_paused===true,recovery_read_only:r.recovery_read_only===true,
        database_circuit_phase:["closed","open","half_open"].includes(r.database_circuit_phase)?r.database_circuit_phase:"unknown"},
      worker:{circuit_open:w.circuit_open===true}});
  }
  if(operation==="/run"){
    const r=result.repair||{};
    return Response.json({status:result.status==="checked"?"checked":"unverified",repair:{
      output_id:r.output_id===10857?10857:null,status:["repaired","skipped","unverified"].includes(r.status)?r.status:"unverified",
      reason:safeReason.has(r.reason)?r.reason:"unknown",approval_actions:r.approval_actions===0?0:null,
      schedule_actions:r.schedule_actions===0?0:null,publish_actions:r.publish_actions===0?0:null},
      requires_human_approval:result.requires_human_approval===true});
  }
  const lanes=result.lanes||{};
  const cards=Object.entries(lanes).flatMap(([lane,items])=>Array.isArray(items)?items.filter(x=>x.output_id===10857).map(x=>({
    lane:["needs_eyes","needs_assets","needs_approval","scheduled","failed","held","manual_repair"].includes(lane)?lane:"other",
    output_id:10857,review_package_ready:x.review_package_ready===true,review_status:x.review_status==="Review Sent"?"Review Sent":"other",
    publish_status:x.publish_status==="Not Ready"?"Not Ready":"other",auto_publish_enabled:x.auto_publish_enabled===false?false:null,
  })):[]);
  return Response.json({ok:result.ok===true,cards});
}};
