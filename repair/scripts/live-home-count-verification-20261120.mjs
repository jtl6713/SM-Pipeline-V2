// P0 #2340 post-deploy census: re-read exact four-profile Home buckets ONLY after verified live Worker rollout; no output mutations.
// 2026-11-21: issue #2340 exact 4-profile Home snapshot and live drilldown parity recheck; no output writes.
// Nov 20 evening: recount after one confirmed LA Meta Story publication and six verified terminal-container classifications (Supabase GET only).
// 2026-11-20 18:25 Chicago: recount after five provider-confirmed expired Instagram Story status repairs.
// 2026-11-20 evening publication recovery: exact latest four-profile snapshot verification; no Studio writes.
import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
const apiToken=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,run=process.env.GITHUB_RUN_ID;
if(!apiToken||!account||!/^\d+$/.test(run||""))throw new Error("cloudflare_credentials_or_run_missing");
const root="https://api.cloudflare.com/client/v4/accounts/"+account,target="chicagoshining-studio-api";
const bridge="studio-home-count-readonly-"+run;
const nonce=crypto.randomBytes(24).toString("hex");
let created=false;
async function cf(path, init={}){
 const res=await fetch(root+path,{...init,headers:{"Authorization":"Bearer "+apiToken,...init.headers},signal:AbortSignal.timeout(30000)});
 const data=await res.json();
 if(!res.ok||data.success!==true)throw new Error("cloudflare_http_"+res.status+"_"+path.split("/").slice(-1)[0]);
 return data.result;
}
try{
 const deployments=await cf("/workers/scripts/"+target+"/deployments");
 const selected=deployments.deployments?.[0]?.versions?.slice().sort((a,b)=>b.percentage-a.percentage)?.[0]?.version_id;
 if(!selected)throw new Error("active_version_unknown");
 const version=await cf("/workers/scripts/"+target+"/versions/"+selected);
 const bindings=version.resources?.bindings||[];
 const binding=name=>{const x=bindings.find(x=>x.name===name);return x?.type==="plain_text"?x.text:null;};
 const source=binding("STUDIO_HOME_READ_SOURCE"),write=binding("STUDIO_WRITE_SOURCE");
 const durableSummary=binding("STUDIO_HOME_PROFILE_SUMMARY_READS")==="true";
 console.log("HOME_SOURCE_FLAGS="+JSON.stringify({home_read_source:source||"absent",home_summary_reads:durableSummary,
   studio_write_source:write||"absent",studio_phase6_write_source:binding("STUDIO_PHASE6_WRITE_SOURCE")||"absent"}));
 // Metadata hides secret_text flags. Inspect the deployed health endpoint
 // through the same GET-only service binding before allowing any Home read.
 // Never invoke Home if runtime says it would fall back to Airtable.
 const script=`export default {async fetch(request,env){
   const url=new URL(request.url);
   if(request.method!=="GET")return new Response("Method not allowed",{status:405});
   const paths={"/${nonce}/overview":"/api/profiles/overview","/${nonce}/health":"/api/health"};
   let path=paths[url.pathname];
   const parts=url.pathname.split("/");
   const allowed=new Set(["recT2rbKX3MF7cVFU","recF7UAn0LkMZZrWZ","recpNlNn6U6eq0M9r","recgtK8Z7eNADNtVy"]);
   if(parts.length===4 && parts[1]==="${nonce}"
      && ["past_due","failed"].includes(parts[2]) && allowed.has(parts[3])) {
     const mode=parts[2]==="past_due"?"approved_past_due":"failed";
     path="/api/outputs?mode="+mode+"&profile="+encodeURIComponent(parts[3]);
   }
   if(!path)return new Response("Not found",{status:404});
   const headers={"Accept":"application/json","Origin":"https://studio.chicagoshining.com",
    "Cf-Access-Authenticated-User-Email":"joseph.t.logan@gmail.com"};
   const result=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com"+path,{method:"GET",headers}));
   return new Response(await result.text(),{status:result.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 }};`;
 const form=new FormData();
 form.append("metadata",new Blob([JSON.stringify({main_module:"worker.js",compatibility_date:"2026-08-02",bindings:[{type:"service",name:"STUDIO_API",service:target}]})],{type:"application/json"}),"metadata.json");
 form.append("worker.js",new Blob([script],{type:"application/javascript+module"}),"worker.js");
 await cf("/workers/scripts/"+bridge+"/content",{method:"PUT",body:form});created=true;
 await cf("/workers/scripts/"+bridge+"/subdomain",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true,previews_enabled:false})});
 const {subdomain}=await cf("/workers/subdomain");
 async function read(path){
  for(let i=0;i<20;i++){
   const resp=await fetch("https://"+bridge+"."+subdomain+".workers.dev/"+nonce+"/"+path,{signal:AbortSignal.timeout(30000),redirect:"error"});
   const txt=await resp.text();
   if(txt.includes("error code: 1042")||(resp.status===404&&!txt.trim().startsWith("{"))){await new Promise(resolve=>setTimeout(resolve,2000));continue;}
   if(resp.status!==200)throw Error(path+"_http_"+resp.status);
   try{return JSON.parse(txt);}catch{throw Error(path+"_invalid_json");}
  }
  throw Error(path+"_route_unavailable");
 }
 const health=await read("health");
 console.log("HOME_RUNTIME_SOURCE="+JSON.stringify({studio_home_read_source:health.studio_home_read_source||"unavailable",studio_write_source:health.studio_write_source||"unavailable"}));
 if(health.studio_home_read_source!=="supabase" && !durableSummary)
   throw new Error("refuse_non_supabase_runtime_home_source");
 if(health.studio_write_source!=="supabase")
   throw new Error("refuse_non_supabase_runtime_write_source");
 const overview=await read("overview");
 if(overview.ok!==true||!Array.isArray(overview.records)||overview.records.length!==4)throw Error("incomplete_home_overview");
 const rows=overview.records.map(r=>({profile:r.name||r.city_label||r.id,approved_past_due:r.approved_past_due,approved_no_date:r.approved_missing_date,read_source:r.read_source||null}));
 if(rows.some(r=>!Number.isInteger(r.approved_past_due)))throw Error("invalid_past_due_counts");
 const report={read_only:true,worker_version_id:selected,worker_health:health.version,home_read_source:health.studio_home_read_source,
  home_summary_read_flag:binding("STUDIO_HOME_PROFILE_SUMMARY_READS"),snapshot_generation:overview.snapshot_generation||null,
  snapshot_at:overview.snapshot_at||null,approved_past_due_total:rows.reduce((s,r)=>s+r.approved_past_due,0),profiles:rows,checked_at:new Date().toISOString(),temporary_bridge_deleted:false};
 console.log("HOME_COUNTS_RESULT="+JSON.stringify(report));
 // P1 #2340: enumerate exact Home drill-down identities only after the
 // source-fixed Worker is deployed. Never use date-only SQL to authorize retries.
 const profiles=[
  {id:"recT2rbKX3MF7cVFU",label:"ChicagoShining - Chicago"},
  {id:"recF7UAn0LkMZZrWZ",label:"LA - Los Angeles"},
  {id:"recpNlNn6U6eq0M9r",label:"Miami - Miami"},
  {id:"recgtK8Z7eNADNtVy",label:"NYC - New York City"},
 ];
 const inventories=[];
 for(const profile of profiles){
   const home=overview.records.find(r=>r.id===profile.id
     || r.profile_id===profile.id || r.content_profile_id===profile.id);
   if(!home)throw Error("home_profile_identity_missing_"+profile.label.replace(/[^a-z]/gi,"_"));
   if(!Number.isInteger(home.failed))throw Error("invalid_failed_home_count_"+profile.label);
   const item={profile:profile.label,profile_id:profile.id,home_snapshot:{
     past_due:home.approved_past_due,failed:home.failed
   },past_due:[],failed:[],parity:{}};
   for(const mode of ["past_due","failed"]){
     const reply=await read(mode+"/"+profile.id);
     if(reply.ok!==true || reply.read_source!=="supabase"
        || reply.complete!==true || !Array.isArray(reply.records)
        || reply.count!==reply.records.length)
       throw Error("incomplete_supabase_exact_inventory_"+profile.label+"_"+mode);
     const entries=reply.records.map(row=>{
       if(!/^rec[A-Za-z0-9]{14}$/.test(String(row.id||"")))
         throw Error("invalid_exact_output_identity_"+mode);
       if(mode==="past_due" && row.home_exception_kind!=="approved_past_due")
         throw Error("home_exception_classifier_mismatch_"+row.id);
       if(mode==="failed" && row.home_failed!==true)
         throw Error("home_failed_classifier_mismatch_"+row.id);
       return {record_id:row.id,output_id:row.output_id,platform:row.platform,
         type:row.platform_output_type,publish_status:row.publish_status,
         studio_state:row.studio_state,publish_error_stage:row.publish_error_stage,
         has_external_id:!!row.platform_post_id,
         has_external_url:!!row.platform_post_url};
     });
     if(new Set(entries.map(x=>x.record_id)).size!==entries.length)
       throw Error("repeated_exact_identity_"+mode);
     item[mode]=entries;
     const snapshot=mode==="past_due"?home.approved_past_due:home.failed;
     item.parity[mode]={
       snapshot_count:Number.isInteger(snapshot)?snapshot:null,
       live_count:entries.length,
       matches:Number.isInteger(snapshot)?snapshot===entries.length:null,
     };
   }
   inventories.push(item);
 }
 const exact={
   safety:"READ ONLY; no provider posts, status mutation, Airtable reads, or rearm",
   worker_version_id:selected,
   home_snapshot_generation:overview.snapshot_generation||null,
   observed_at:new Date().toISOString(),
   past_due_total:inventories.reduce((s,x)=>s+x.past_due.length,0),
   failed_total:inventories.reduce((s,x)=>s+x.failed.length,0),
   mismatched_profile_modes:inventories.flatMap(x=>Object.entries(x.parity)
     .filter(([,p])=>p.matches===false)
     .map(([mode,p])=>({profile:x.profile,mode,...p}))),
   inventories,
 };
 await writeFile("/tmp/home-2340-exact-inventory.json",JSON.stringify(exact,null,2));
 console.log("HOME_EXACT_ID_CENSUS="+JSON.stringify(exact));
 if(exact.mismatched_profile_modes.length!==0)throw Error("home_drilldown_snapshot_parity_failed_closed");
}finally{
 if(created){await cf("/workers/scripts/"+bridge,{method:"DELETE"});console.log("temporary_bridge_deleted=PASS");}
}

// #3096: rerun the existing GET-only exact Home census on main for the new overdue recovery owner; no change to bridge scope or provider calls.
