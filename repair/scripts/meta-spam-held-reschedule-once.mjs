import fs from "node:fs/promises";
import crypto from "node:crypto";
// One-shot, user-authorized scheduling-only action. Never posts to Meta,
// releases holds, resets error/attempt counters or declares publication.
const ids=["rechHVARC2zRlgNtK","recgVBWFB9CYpfg3i","recQjUNjlxZnuODrE","rech5nXPwtePHE1le"];
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const api="https://api.cloudflare.com/client/v4/accounts/"+account;
const service="chicagoshining-studio-api";
const bridge="studio-meta-spam-schedule-"+String(process.env.GITHUB_RUN_ID||"manual");
const secret=crypto.randomBytes(32).toString("hex");
const report={kind:"user_authorized_meta_368_held_reschedule",started_at:new Date().toISOString(),
 target_count:ids.length,provider_writes:0,publish_dispatches:0,hold_releases:0,records:[]};
let created=false;
async function cf(path,opts={}){
 const response=await fetch(api+path,{...opts,headers:{Authorization:"Bearer "+token,...opts.headers},
  signal:AbortSignal.timeout(30000)});
 const value=await response.json();
 if(!response.ok||value.success!==true)throw new Error("cloudflare_control_plane_http_"+response.status);
 return value.result;
}
try {
 if(!account||!token)throw new Error("cloudflare_credentials_missing");
 const source="const allowed="+JSON.stringify(ids)+";"+
 "export default {async fetch(request,env){"+
 "const u=new URL(request.url);const pieces=u.pathname.split('/');const id=pieces[pieces.length-1];"+
 "if(request.method!=='POST'||!allowed.includes(id)||pieces[1]!=='"+secret+"')return new Response('Forbidden',{status:403});"+
 "const headers={'Accept':'application/json','Content-Type':'application/json','Origin':'https://studio.chicagoshining.com','Cf-Access-Authenticated-User-Email':'joseph.t.logan@gmail.com'};"+
 "const response=await env.STUDIO_API.fetch(new Request('https://studio.chicagoshining.com/api/operations/outputs/'+id+'/schedule',{method:'POST',headers,body:await request.text()}));"+
 "return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});"+
 "}};";
 const form=new FormData();
 form.append("metadata",new Blob([JSON.stringify({main_module:"worker.js",
  compatibility_date:"2026-08-02",bindings:[{type:"service",name:"STUDIO_API",service}]})],
  {type:"application/json"}),"metadata.json");
 form.append("worker.js",new Blob([source],{type:"application/javascript+module"}),"worker.js");
 await cf("/workers/scripts/"+bridge+"/content",{method:"PUT",body:form});
 created=true;
 await cf("/workers/scripts/"+bridge+"/subdomain",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({enabled:true,previews_enabled:false})});
 const {subdomain}=await cf("/workers/subdomain");
 async function call(id,payload){
  for(let i=0;i<12;i++){
   const res=await fetch("https://"+bridge+"."+subdomain+".workers.dev/"+secret+"/"+id,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),redirect:"error",signal:AbortSignal.timeout(120000)});
   const raw=await res.text();
   if(raw.includes("error code: 1042")||(res.status===404&&!raw.trim().startsWith("{"))){
    await new Promise(r=>setTimeout(r,3000));continue;
   }
   let body;try{body=JSON.parse(raw);}catch{
    throw new Error("uncertain_non_json_worker_response_"+res.status);
   }
   return {status:res.status,body};
  }
  throw new Error("uncertain_bridge_route_unavailable");
 }
 for(const id of ids){
  const item={record_id:id,rescheduled:false};report.records.push(item);
  let preview;
  try{preview=await call(id,{quality_rate_limit_hold_reschedule:true,quality_rate_limit_preview:true});}
  catch(error){item.status="uncertain";item.error=String(error?.message||error);break;}
  item.preview_http=preview.status;
  if(preview.status!==200||preview.body?.ok!==true||preview.body?.quality_rate_limit_preview!==true){
   item.status="blocked";item.reason=String(preview.body?.error||"preview_unavailable").slice(0,220);continue;
  }
  item.planned_at=preview.body.scheduled_at;
  if(!Number.isFinite(Date.parse(item.planned_at))||Date.parse(item.planned_at)<Date.now()+46*3600000){
   item.status="blocked";item.reason="cooldown_or_future_slot_not_verified";continue;
  }
  let applied;
  try{applied=await call(id,{quality_rate_limit_hold_reschedule:true});}
  catch(error){item.status="uncertain";item.error=String(error?.message||error);break;}
  if(applied.status===409){item.status="blocked";item.reason=String(applied.body?.error||"guard_denied").slice(0,220);continue;}
  if(applied.status!==200||applied.body?.ok!==true){
   item.status="uncertain";item.error="write_http_"+applied.status;break;
  }
  const row=applied.body.record||{};
  item.scheduled_at=row.scheduled_post_date||null;
  if(applied.body.held_spam_rescheduled_pending_verification!==true||
     row.do_not_publish!==true||row.publish_status!=="Failed"||
     !Number.isFinite(Date.parse(item.scheduled_at))||
     Date.parse(item.scheduled_at)<Date.now()+46*3600000||
     applied.body.dispatch){
   item.status="uncertain";item.error="future_slot_or_hold_readback_unconfirmed";break;
  }
  item.status="reserved_held_pending_verification";item.rescheduled=true;
 }
} catch(error) {
 report.error=String(error?.message||error).slice(0,350);process.exitCode=1;
} finally {
 if(created){
  try{await cf("/workers/scripts/"+bridge,{method:"DELETE"});report.bridge_deleted=true;}
  catch{report.bridge_deleted=false;process.exitCode=1;}
 }
 report.completed_at=new Date().toISOString();
 report.reserved_count=report.records.filter(x=>x.rescheduled).length;
 report.blocked_count=report.records.filter(x=>x.status==="blocked").length;
 report.uncertain_count=report.records.filter(x=>x.status==="uncertain").length;
 console.log("META_SPAM_RESCHEDULE_REPORT "+JSON.stringify(report));
 await fs.writeFile("/tmp/meta-spam-held-reschedule-report.json",JSON.stringify(report,null,2));
 if(report.uncertain_count)process.exitCode=1;
}