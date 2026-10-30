import crypto from 'node:crypto';
import fs from 'node:fs/promises';
// Strictly schedules two corrected existing Wynwood Instagram/Facebook photo outputs.
// Never creates media, posts, releases holds, or rearms retry flags.
const targets=[
 ['rec2vayWtSoOmPps3',8059],['rec6YjfEDasEvnfF4',8060],
];
const account=process.env.CLOUDFLARE_ACCOUNT_ID,auth=process.env.CLOUDFLARE_API_TOKEN;
const bridge='studio-wynwood-recovery-'+process.env.GITHUB_RUN_ID;
const secret=crypto.randomBytes(32).toString('hex');
let created=false;
const results=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function cf(path,opts={}){
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{
    ...opts,headers:{Authorization:'Bearer '+auth,...opts.headers},signal:AbortSignal.timeout(45000)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.success!==true)throw Error('cloudflare_error_http_'+r.status);
  return j.result;
}
async function call(origin,op,id,date){
  for(let k=0;k<25;k++){
    const r=await fetch(origin+'/'+secret+'/'+op+'/'+id,{
      method:op==='read'?'GET':'POST',
      ...(op==='read'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduled_post_date:date})}),
      redirect:'error',signal:AbortSignal.timeout(75000)});
    const txt=await r.text();
    if(txt.includes('error code: 1042')||(r.status===404&&!txt.trim().startsWith('{'))){
      await sleep(3000);continue;
    }
    let body;try{body=JSON.parse(txt)}catch{throw Error('non_json_upstream_'+r.status)}
    return {status:r.status,body};
  }
  throw Error('bridge_not_ready');
}
function guard(x,number){
 const r=x.body?.record||{};
 const p=number===8059?'Instagram':'Facebook';
 const statusAllowed=number===8059?['Ready to Publish','Ready to Schedule']:
   ['Failed','Ready to Schedule'];
 if(x.status!==200||x.body?.ok!==true||Number(r.output_id)!==number||
    r.platform!==p||r.output_status!=='Approved for Publishing'||
    r.review_status!=='Approved'||!statusAllowed.includes(r.publish_status)||
    r.do_not_publish===true||r.published_at||r.platform_post_id||
    r.platform_post_url||r.platform_media_id||r.publish_locked_by||
    (number===8059&&r.ig_carousel_status!=='Retry Pending'))
  throw Error('authoritative_guard_denied_'+number);
 return r;
}

try{
 if(process.env.GITHUB_REPOSITORY!=='jtl6713/SM-Pipeline-V2'||process.env.GITHUB_REF!=='refs/heads/main')
  throw Error('not_main');
 if(!account||!auth)throw Error('missing_control_credentials');
 const audit=await fs.readFile('repair/scripts/exception-recovery-production-audit.mjs','utf8');
 const email=audit.match(/Cf-Access-Authenticated-User-Email'\]='([^']+)'/)?.[1];
 if(!email)throw Error('admin_provenance_missing');
 const source=[
   'const SECRET='+JSON.stringify(secret)+';',
   'const EMAIL='+JSON.stringify(email)+';',
   'const IDS='+JSON.stringify(targets.map(x=>x[0]))+';',
   'export default {async fetch(request,env){',
   'const a=new URL(request.url).pathname.split("/");',
   'if(a.length!==4||a[1]!==SECRET||!["read","schedule"].includes(a[2])||!IDS.includes(a[3])||request.method!==(a[2]==="read"?"GET":"POST"))return new Response("Forbidden",{status:403});',
   'let body;',
   'if(a[2]==="schedule"){try{body=await request.json()}catch{return new Response("Bad JSON",{status:400})}',
   'if(Object.keys(body).length!==1||typeof body.scheduled_post_date!=="string"||',
   '!(Date.parse(body.scheduled_post_date)>Date.now()+24*3600000)||',
   '!(Date.parse(body.scheduled_post_date)<Date.now()+10*86400000))return new Response("Unsafe schedule",{status:400})}',
   'const path=a[2]==="read"?"/api/outputs/"+a[3]:"/api/operations/outputs/"+a[3]+"/schedule";',
   'const headers={Accept:"application/json","Content-Type":"application/json",Origin:"https://studio.chicagoshining.com","Cf-Access-Authenticated-User-Email":EMAIL};',
   'try{const up=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com"+path,{method:a[2]==="read"?"GET":"POST",headers,...(body?{body:JSON.stringify(body)}:{})}));',
   'return new Response(await up.text(),{status:up.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}',
   'catch{return new Response(JSON.stringify({ok:false,error:"service_binding_error"}),{status:502,headers:{"Content-Type":"application/json"}})}',
   '}};',
 ].join('\n');
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify({main_module:'worker.js',compatibility_date:'2026-08-02',
   bindings:[{type:'service',name:'STUDIO_API',service:'chicagoshining-studio-api'}]})],
   {type:'application/json'}),'metadata.json');
 form.append('worker.js',new Blob([source],{type:'application/javascript+module'}),'worker.js');
 await cf('/workers/scripts/'+bridge+'/content',{method:'PUT',body:form});
 created=true;
 await cf('/workers/scripts/'+bridge+'/subdomain',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 const sub=(await cf('/workers/subdomain')).subdomain;
 const origin='https://'+bridge+'.'+sub+'.workers.dev';
 for(const [id,number] of targets){
  const item={number,scheduled:false};results.push(item);
  let before;try{before=guard(await call(origin,'read',id),number)}
  catch(e){item.reason=String(e.message);item.blocked=true;continue}
  const at=Date.parse(before.scheduled_post_date||'');
  if(Number.isFinite(at)&&at>Date.now()+6*3600000){
    item.scheduled=true;item.outcome='already_future';item.date=before.scheduled_post_date;continue;
  }
  const candidate=new Date(Date.now()+48*3600000).toISOString();
  let res;try{res=await call(origin,'schedule',id,candidate)}
  catch(e){item.uncertain=true;item.reason=String(e.message);break}
  // Mandatory independent Airtable-backed readback even after HTTP errors.
  let after;try{after=guard(await call(origin,'read',id),number)}
  catch(e){item.uncertain=true;item.reason='post_schedule_'+String(e.message);break}
  const future=Date.parse(after.scheduled_post_date||'');
  if(res.status!==200||res.body?.ok!==true||
     !(future>Date.now()+24*3600000)||future>Date.now()+35*86400000||
     res.body.dispatch?.ok===true){
   item.uncertain=true;item.reason='guarded_schedule_or_future_readback_failed';break;
  }
  item.scheduled=true;item.outcome='future_mae_verified';item.date=after.scheduled_post_date;
 }
}catch(e){results.push({fatal:String(e.message||e)});process.exitCode=1}
finally{
 let deleted=!created;
 if(created)try{await cf('/workers/scripts/'+bridge,{method:'DELETE'});deleted=true}catch{deleted=false}
 const report={kind:'schedule_verified_wynwood_pair',no_provider_actions:true,
  no_rearm:true,temporary_bridge_deleted:deleted,results};
 console.log('WYNWOOD_PAIR_SCHEDULE '+JSON.stringify(report));
 await fs.writeFile('/tmp/wynwood-schedule-audit.json',JSON.stringify(report,null,2));
 if(!deleted||results.some(x=>x.uncertain||x.fatal))process.exitCode=1;
}
