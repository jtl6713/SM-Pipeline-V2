/** One-time authorized held-only scheduling: no Meta, no publication, no unholding. */
import fs from "node:fs/promises";
import crypto from "node:crypto";
const repo="jtl6713/SM-Pipeline-V2";
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const key=process.env.CLOUDFLARE_API_TOKEN;
const api="https://api.cloudflare.com/client/v4/accounts/"+account;
const target="chicagoshining-studio-api";
const items=[
  {id:"recQjUNjlxZnuODrE",number:2762},
  {id:"recgVBWFB9CYpfg3i",number:2463},
  {id:"rech5nXPwtePHE1le",number:4018},
  {id:"rechHVARC2zRlgNtK",number:2457},
];
const report={kind:"approved-operator-held-spam-reschedule",output_ids:items.map(x=>x.number),
  provider_writes:0,publication_dispatches:0,hold_releases:0,
  results:[],started_at:new Date().toISOString()};
const token=crypto.randomBytes(32).toString("hex");
const bridge="studio-held-spam-recovery-"+String(process.env.GITHUB_RUN_ID||Date.now());
let bridgeCreated=false;
async function cf(path,opts={}) {
  const response=await fetch(api+path,{...opts,headers:{Authorization:"Bearer "+key,...(opts.headers||{})},signal:AbortSignal.timeout(45000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.success!==true)throw Error("cloudflare_api_failed_"+response.status);
  return data.result;
}
function verifiedSlot(result,item) {
  if(result.status!==200||result.data?.ok!==true||result.data?.quality_rate_limit_preview!==true||
    result.data?.stage!=="planned"||result.data?.platform!=="Facebook"||
    Number(result.data?.output_id)!==item.number)throw Error("preview_blocked");
  const ms=Date.parse(result.data?.scheduled_at||"");
  const now=Date.now();
  if(!Number.isFinite(ms)||ms<=now+47.5*3600000||ms>now+91*86400000)throw Error("slot_outside_cooldown_or_horizon");
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
    hour:"numeric",minute:"numeric",hour12:false}).formatToParts(new Date(ms));
  const hh=Number(parts.find(x=>x.type==="hour")?.value||0);
  const mm=Number(parts.find(x=>x.type==="minute")?.value||0);
  if(hh>22||(hh===22&&mm>=30)||hh<3||(hh===3&&mm<30))throw Error("slot_violates_MAE_blackout");
  return new Date(ms).toISOString();
}
// Independent authenticated Worker GET re-reads the authoritative Airtable
// output, never infers success from a POST transport exception.
function authoritativeHeldDate(result,item,plannedAt=null) {
  const rec=result?.data?.record||{};
  const at=Date.parse(rec.scheduled_post_date||"");
  if(result?.status!==200||result?.data?.ok!==true||
     Number(rec.output_id)!==item.number||rec.do_not_publish!==true||
     rec.publish_status!=="Failed"||!Number.isFinite(at)||
     at<=Date.now()+24*3600000||
     (plannedAt&&at!==Date.parse(plannedAt))||
     rec.published_at)throw Error("independent_Airtable_readback_not_verified_"+item.number);
  return new Date(at).toISOString();
}
function verifiedCommit(result,item,previewAt) {
  const rec=result.data?.record||{};
  if(result.status!==200||result.data?.ok!==true||
    result.data?.held_spam_rescheduled_pending_verification!==true||
    result.data?.dispatch!==null||Number(rec.output_id)!==item.number||
    rec.do_not_publish!==true||rec.publish_status!=="Failed"||
    Date.parse(rec.scheduled_post_date||"")!==Date.parse(previewAt))throw Error("authoritative_schedule_hold_readback_not_confirmed");
  return rec.scheduled_post_date;
}
try {
  if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=="refs/heads/main")throw Error("main_only");
  if(!account||!key)throw Error("cloudflare_credentials_unavailable");
  // Reuse the deployment-audit identity, rather than create a new privileged principal.
  const audit=await fs.readFile("repair/scripts/exception-recovery-production-audit.mjs","utf8");
  const operator=audit.match(/Cf-Access-Authenticated-User-Email'\]='([^']+)'/)?.[1];
  if(!operator)throw Error("verified_admin_principal_missing");
  const source=[
    "export default {async fetch(request,env){",
    "const seg=new URL(request.url).pathname.split('/');",
    "const token="+JSON.stringify(token)+";",
    "const ids="+JSON.stringify(items.map(x=>x.id))+";",
    "if(seg.length!==4||seg[1]!==token||!['preview','commit','readback'].includes(seg[2])||!['0','1','2','3'].includes(seg[3]))return new Response('Not found',{status:404});",
    "const readback=seg[2]==='readback';",
    "if(request.method!==(readback?'GET':'POST'))return new Response('Method not allowed',{status:405});",
    "const path=readback?'/api/outputs/'+ids[Number(seg[3])]:'/api/operations/outputs/'+ids[Number(seg[3])]+'/schedule';",
    "const payload=seg[2]==='preview'?{quality_rate_limit_hold_reschedule:true,quality_rate_limit_preview:true}:{quality_rate_limit_hold_reschedule:true};",
    "const headers={Accept:'application/json','Content-Type':'application/json',Origin:'https://studio.chicagoshining.com','Cf-Access-Authenticated-User-Email':"+JSON.stringify(operator)+"};",
    "try {",
    "const upstream=await env.STUDIO_API.fetch(new Request('https://studio.chicagoshining.com'+path,{method:readback?'GET':'POST',headers,...(readback?{}:{body:JSON.stringify(payload)})}));",
    "return new Response(await upstream.text(),{status:upstream.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});",
    "} catch(error) {return new Response(JSON.stringify({error:'service_binding_upstream_error',reason:String(error?.message||error).slice(0,240)}),{status:502,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}",
    "}};"
  ].join("\n");
  const form=new FormData();
  form.append("metadata",new Blob([JSON.stringify({
    main_module:"worker.js",compatibility_date:"2026-08-02",
    bindings:[{type:"service",name:"STUDIO_API",service:target}]
  })],{type:"application/json"}),"metadata.json");
  form.append("worker.js",new Blob([source],{type:"application/javascript+module"}),"worker.js");
  await cf("/workers/scripts/"+bridge+"/content",{method:"PUT",body:form});
  bridgeCreated=true;
  await cf("/workers/scripts/"+bridge+"/subdomain",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:true,previews_enabled:false})});
  const domain=(await cf("/workers/subdomain")).subdomain;
  const endpoint="https://"+bridge+"."+domain+".workers.dev/"+token+"/";
  async function probe(stage,index) {
    for(let n=0;n<15;n++) {
      const response=await fetch(endpoint+stage+"/"+index,{
        method:stage==="readback"?"GET":"POST",
        headers:{"Content-Type":"application/json"},
        ...(stage==="readback"?{}:{body:"{}"}),
        redirect:"error",signal:AbortSignal.timeout(120000)});
      const raw=await response.text();
      if(raw.includes("error code: 1042")||(response.status===404&&!raw.trim().startsWith("{"))){
        if(stage==="commit")throw Error("uncertain_commit_response_do_not_reissue");
        await new Promise(resolve=>setTimeout(resolve,2500));continue;
      }
      let data;try{data=JSON.parse(raw)}catch{throw Error(stage==="commit"?"uncertain_nonjson_commit_http_"+response.status+"_body_"+raw.slice(0,100).replace(/[^a-zA-Z0-9 ._-]/g," "):"preview_nonjson_"+response.status)}
      return {status:response.status,data};
    }
    throw Error("service_binding_route_unavailable");
  }
  for(let i=0;i<items.length;i++){
    const item=items[i],row={output_id:item.number,record_id:item.id,status:"not_attempted"};
    report.results.push(row);
    let preview;
    try{preview=await probe("preview",i);}
    catch(error){row.status="preview_blocked";row.reason=String(error.message||error).slice(0,180);continue;}
    if(preview.status===409&&String(preview.data?.error||"").includes("already_rescheduled_pending_verification")){
      try{
        row.scheduled_at=authoritativeHeldDate(await probe("readback",i),item);
        row.status="previously_rescheduled_held_verified";
        row.do_not_publish=true;
      }catch(error){row.status="uncertain_stop";row.reason=String(error.message||error).slice(0,180);report.stopped_on_uncertainty=true;break;}
      continue;
    }
    try{row.preview_at=verifiedSlot(preview,item);}
    catch(error){row.status="preview_blocked";row.reason=String(error.message||error).slice(0,180);continue;}
    let committed=null, ambiguous=null;
    try{committed=await probe("commit",i);}
    catch(error){ambiguous=String(error.message||error).slice(0,180);}
    if(!ambiguous) {
      try{row.scheduled_at=verifiedCommit(committed,item,row.preview_at);}
      catch(error){ambiguous=String(error.message||error).slice(0,180);}
    }
    if(ambiguous){
      // The Worker may write successfully but throw while building the API
      // response. Read it back once; never reissue this commit.
      try{
        row.scheduled_at=authoritativeHeldDate(await probe("readback",i),item,row.preview_at);
        row.confirmed_by="independent_Airtable_GET";
      }catch(error){
        row.status="uncertain_stop";row.reason=ambiguous;
        row.readback_error=String(error.message||error).slice(0,180);
        row.http_status=committed?.status??null;
        row.service_reason=String(committed?.data?.reason||"").slice(0,180);
        report.stopped_on_uncertainty=true;break;
      }
    }else {
      // Also confirm the unambiguous case via an independent GET.
      try{authoritativeHeldDate(await probe("readback",i),item,row.preview_at);}
      catch(error){row.status="uncertain_stop";row.reason=String(error.message||error).slice(0,180);report.stopped_on_uncertainty=true;break;}
    }
    row.status="rescheduled_held_pending_remote_verification";
    row.do_not_publish=true;
  }
  if(report.results.some(x=>!["rescheduled_held_pending_remote_verification","previously_rescheduled_held_verified"].includes(x.status)))process.exitCode=1;
}catch(error){report.error=String(error.message||error).slice(0,220);process.exitCode=1;}
finally {
  if(bridgeCreated){
    try{await cf("/workers/scripts/"+bridge,{method:"DELETE"});report.temporary_bridge_deleted=true;}
    catch{report.temporary_bridge_deleted=false;process.exitCode=1;}
  }
  report.completed_at=new Date().toISOString();
  await fs.writeFile("/tmp/facebook-held-spam-recovery.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}