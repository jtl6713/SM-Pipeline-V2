import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const api='https://api.cloudflare.com/client/v4/accounts/'+account;
const target='chicagoshining-studio-api';
// Exact known already-published IG canary; no bulk scanning or Graph mutations.
const instagramCanaryRecord='recfTqaYB0h5FCUVi';
const rollout=JSON.parse(await fs.readFile(new URL('../../deploy/publication-reconciliation-production-rollout.json',import.meta.url),'utf8'));
if(!/^rec[A-Za-z0-9]{14}$/.test(String(rollout.canary_record_id)) ||
   !/^[A-Za-z0-9_-]{11}$/.test(String(rollout.canary_video_id)) ||
   !/^UC[A-Za-z0-9_-]{22}$/.test(String(rollout.canary_channel_id)) ||
   !Number.isInteger(rollout.canary_output_id)) throw new Error('invalid_canary_manifest');
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
 const expectedFlags={
  PUBLICATION_RECONCILIATION_SCAN_ENABLED:rollout.stage==='read_only'?'false':'true',
  PUBLICATION_RECONCILIATION_ENABLED:rollout.stage==='read_only'?'false':'true',
  PUBLICATION_RECONCILIATION_BOUNDED_ENABLED:rollout.stage==='bounded'?'true':'false',
  PUBLICATION_RECONCILIATION_CANARY_RECORD:rollout.canary_record_id,
 };
 for(const [name,value] of Object.entries(expectedFlags)){
   const bound=bindings.find(b=>b.name===name);
   // Older read-only deployments can omit dormant flags entirely.
   if(!bound && rollout.stage==='read_only')continue; // prior live read-only deployment lacks staged bindings
   if(bound?.type!=='plain_text'||bound?.text!==value)throw new Error('publication_recovery_flag_mismatch_'+name);
 }
 report.rollout_stage=rollout.stage;
 // Reuses the production deployment's service-binding verification pattern.
 // The bridge exposes only exact read-only routes behind a random, short-lived path.
 const source=`export default {async fetch(request,env){
   const url=new URL(request.url);
   if(request.method!=='GET')return new Response('Method not allowed',{status:405});
   const routes={
    '/${token}/health':'/api/health',
    '/${token}/receipt':'/api/admin/exception-recovery/${rollout.canary_record_id}/receipt?authenticated=1',
    '/${token}/instagram':'/api/admin/exception-recovery/${instagramCanaryRecord}/receipt?authenticated=1',
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
 // Validate the actual protected recovery endpoints below, not a mutable release-name substring.
 if(health.status!==200 || typeof health.body?.version !== 'string')throw new Error('deployed_worker_health_unavailable');
 const denied=await probe('denied');report.unauthenticated_history_status=denied.status;
 if(![401,403].includes(denied.status))throw new Error('history_admin_boundary_failed');
 const history=await probe('history');report.history={status:history.status,source:history.body.source,events:history.body.items?.length};
 if(history.status!==200||history.body.source!=='airtable_exception_recovery_audit')throw new Error('durable_history_unavailable');
 const receipt=await probe('receipt');report.inspected=1;report.receipt=receipt.body;
 const data=receipt.body;
 if(receipt.status!==200||Number(data.output_id)!==rollout.canary_output_id||data.remote_id!==rollout.canary_video_id||data.channel_id!==rollout.canary_channel_id)throw new Error('canary_exact_identity_not_verified');
 if(data.verified_delivery!==true||data.ownership_verified!==true||data.read_only!==true)throw new Error('authenticated_delivery_unverified');
 report.verified=1;report.public_visibility_verified=data.verified_public===true;
 if(data.verification?.authoritative_state_unchanged!==true||data.verification?.no_output_write!==true)throw new Error('authoritative_readback_failed');
 report.eligible=data.verification.eligible===true;
 report.blocked_reason=data.verification.blocked_reason;
 report.canary_status=report.eligible?'verified_eligible':'provider_verified_not_currently_eligible';
 if(!report.eligible && rollout.stage==='read_only')process.exitCode=1;
 // The same deployed authenticated GET-only adapter also checks the original
 // Instagram media under its profile-linked Meta Business account. Never
 // POST, finalize or write Airtable as part of this diagnostic.
 const ig=await probe('instagram');
 const post=ig.body||{};
 report.instagram_canary={
  record_id:instagramCanaryRecord,http_status:ig.status,output_id:post.output_id||null,
  platform:post.platform||null,remote_id:post.remote_id||null,
  verified_public:post.verified_public===true,
  ownership_verified:post.ownership_verified===true,
  read_only:post.read_only===true,
  no_output_write:post.verification?.no_output_write===true,
  eligible:post.verification?.eligible===true,
  blocked_reason:post.verification?.blocked_reason||null,
  evidence:post.evidence||post.error||null,
 };
 if(ig.status!==200 || Number(post.output_id)!==7864 || post.platform!=='Instagram' ||
    post.read_only!==true || post.verification?.no_output_write!==true)
   throw new Error('instagram_canary_response_integrity_failed');
 if(post.remote_id!=='18041644475837071' || post.verified_public!==true ||
    post.ownership_verified!==true) {
   report.instagram_canary_status='provider_publication_unverified';
   throw new Error('instagram_canary_authenticated_publication_unverified');
 }
 report.instagram_canary_status='verified_account_owned_publication';
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
