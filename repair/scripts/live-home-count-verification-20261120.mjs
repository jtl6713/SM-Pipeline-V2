// 2026-11-20 18:25 Chicago: recount after five provider-confirmed expired Instagram Story status repairs.
// 2026-11-20 evening publication recovery: exact latest four-profile snapshot verification; no Studio writes.
import crypto from "node:crypto";
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
   const path=paths[url.pathname];if(!path)return new Response("Not found",{status:404});
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
}finally{
 if(created){await cf("/workers/scripts/"+bridge,{method:"DELETE"});console.log("temporary_bridge_deleted=PASS");}
}
