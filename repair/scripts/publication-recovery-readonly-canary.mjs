import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const api='https://api.cloudflare.com/client/v4/accounts/'+account;
const target='chicagoshining-studio-api';
const bridge='studio-publication-readonly-'+String(process.env.GITHUB_RUN_ID||Date.now());
const token=crypto.randomBytes(32).toString('hex');
const report={read_only:true,inspected:0,verified:0,corrected:0,remote_writes:0,started_at:new Date().toISOString()};
let bridgeCreated=false;
async function cf(path,options={}) {
 const response=await fetch(api+path,{...options,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...options.headers},signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok||result.success!==true)throw new Error('cloudflare_verification_http_'+response.status);
 return result.result;
}
try {
 if(!account||!process.env.CLOUDFLARE_API_TOKEN)throw new Error('cloudflare_verification_credentials_missing');
 const deployments=await cf('/workers/scripts/'+target+'/deployments');
 const version=deployments.deployments[0].versions.sort((a,b)=>b.percentage-a.percentage)[0].version_id;
 const live=await cf('/workers/scripts/'+target+'/versions/'+version);
 report.worker_version_id=version;
 const bindings=live.resources?.bindings||[];
 report.flags={};
 for(const name of ['EXCEPTION_RECOVERY_ACTIONS_ENABLED','PUBLICATION_RECONCILIATION_SCAN_ENABLED','PUBLICATION_RECONCILIATION_ENABLED','PUBLICATION_RECONCILIATION_BOUNDED_ENABLED']) {
  const binding=bindings.find(b=>b.name===name);
  report.flags[name]=binding?binding.type==='plain_text'?binding.text:'non_plain_binding':'absent';
 }
 for(const name of ['PUBLICATION_RECONCILIATION_ENABLED','PUBLICATION_RECONCILIATION_BOUNDED_ENABLED'])
  if(!['false','absent'].includes(report.flags[name]))throw new Error('autonomous_mutation_gate_not_off');
 // Reuses the production deployment's service-binding verification pattern.
 // The bridge exposes only four fixed GETs behind a random, short-lived path.
 const source=`export default {async fetch(request,env){
   const url=new URL(request.url);
   if(request.method!=='GET')return new Response('Method not allowed',{status:405});
   const routes={
    '/${token}/health':'/api/health',
    '/${token}/receipt':'/api/admin/exception-recovery/recjpnbFd5SqbrGNM/receipt?authenticated=1',
    '/${token}/history':'/api/admin/exception-recovery/history',
    '/${token}/denied':'/api/admin/exception-recovery/history'
   };
   const path=routes[url.pathname];if(!path)return new Response('Not found',{status:404});
   const headers={'Accept':'application/json','Origin':'https://studio.chicagoshining.com'};
   if(!url.pathname.endsWith('/denied'))headers['Cf-Access-Authenticated-User-Email']='joseph.t.logan@gmail.com';
   const response=await env.STUDIO_API.fetch(new Request('https://studio.chicagoshining.com'+path,{method:'GET',headers}));
   return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }};`;
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify({main_module:'worker.js',compatibility_date:'2026-08-02',bindings:[{type:'service',name:'STUDIO_API',service:target}]})],{type:'application/json'}),'metadata.json');
 form.append('worker.js',new Blob([source],{type:'application/javascript+module'}),'worker.js');
 await cf('/workers/scripts/'+bridge+'/content',{method:'PUT',body:form});bridgeCreated=true;
 await cf('/workers/scripts/'+bridge+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 const {subdomain}=await cf('/workers/subdomain');
 async function probe(route) {
  for(let attempt=0;attempt<30;attempt++) {
   const res=await fetch('https://'+bridge+'.'+subdomain+'.workers.dev/'+token+'/'+route,{method:'GET',redirect:'error',signal:AbortSignal.timeout(60000)});
   const text=await res.text();
   if(text.includes('error code: 1042') || (res.status===404 && !text.trim().startsWith('{'))){await new Promise(r=>setTimeout(r,3000));continue;}
   let body;try{body=JSON.parse(text);}catch{throw new Error('verification_bridge_non_json_'+res.status);}
   return {status:res.status,body};
  }
  throw new Error('verification_bridge_routing_unavailable');
 }
 const health=await probe('health');report.worker_health=health.body.version;
 if(health.status!==200||!String(health.body.version).includes('publication-recovery'))throw new Error('new_recovery_worker_not_deployed');
 const denied=await probe('denied');report.unauthenticated_history_status=denied.status;
 if(![401,403].includes(denied.status))throw new Error('history_admin_boundary_failed');
 const history=await probe('history');report.history={status:history.status,source:history.body.source,events:history.body.items?.length};
 if(history.status!==200||history.body.source!=='airtable_exception_recovery_audit')throw new Error('durable_history_unavailable');
 const receipt=await probe('receipt');report.inspected=1;report.receipt=receipt.body;
 const data=receipt.body;
 if(receipt.status!==200||String(data.output_id)!=='4092'||data.remote_id!=='hc1heQnfn6k'||data.channel_id!=='UCVt3nBxRfPuuxxduuxmz9sw')throw new Error('canary_exact_identity_not_verified');
 if(data.verified_delivery!==true||data.ownership_verified!==true||data.read_only!==true)throw new Error('authenticated_delivery_unverified');
 report.verified=1;report.public_visibility_verified=data.verified_public===true;
 if(data.verification?.authoritative_state_unchanged!==true||data.verification?.no_output_write!==true)throw new Error('authoritative_readback_failed');
 report.eligible=data.verification.eligible===true;
 report.blocked_reason=data.verification.blocked_reason;
 report.canary_status=report.eligible?'verified_eligible_pending_explicit_approval':'blocked';
 if(!report.eligible)process.exitCode=1;
} catch(error) {
 report.canary_status='unavailable';report.error=String(error.message).slice(0,160);process.exitCode=1;
} finally {
 if(bridgeCreated) {
  try {await cf('/workers/scripts/'+bridge,{method:'DELETE'});report.temporary_bridge_deleted=true;}
  catch {report.temporary_bridge_deleted=false;process.exitCode=1;}
 }
 report.completed_at=new Date().toISOString();
 await fs.writeFile('/tmp/publication-recovery-canary.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
