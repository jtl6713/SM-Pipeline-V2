import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { compareIndependentQaCensus } from '../../apps/studio-api/exception-recovery-qa-parity.mjs';
import { summarizeStage3ExceptionDispositions } from './exception-recovery-disposition.mjs';
import { assessHomeRefresh, verifyHomeOverviewGeneration } from './exception-recovery-home-freshness.mjs';
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
const bridge='studio-exception-admin-audit-'+String(process.env.GITHUB_RUN_ID||Date.now());
const token=crypto.randomBytes(32).toString('hex');
const report={source:'deployed_studio_service_binding',provider_operations:'GET only',conversation_write_only:true,output_writes:0,remote_writes:0,started_at:new Date().toISOString()};
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
 // The bridge exposes only exact diagnostic routes behind a random, short-lived path.
 // The only new POST is a bounded Home cache rebuild; never output/provider writes.
 const source=`export default {async fetch(request,env){
   const url=new URL(request.url);
   if(request.method!=='GET' && !(request.method==='POST' && (url.pathname==='/${token}/conversation' || url.pathname==='/${token}/home-refresh')))return new Response('Method not allowed',{status:405});
   const routes={
    '/${token}/health':'/api/health',
    '/${token}/receipt':'/api/admin/exception-recovery/${rollout.canary_record_id}/receipt?authenticated=1',
    '/${token}/instagram':'/api/admin/exception-recovery/${instagramCanaryRecord}/receipt?authenticated=1',
    '/${token}/history':'/api/admin/exception-recovery/history',
    '/${token}/denied':'/api/admin/exception-recovery/history',
    '/${token}/conversation':'/api/admin/exception-recovery/${instagramCanaryRecord}/conversation',
    '/${token}/conversation-denied':'/api/admin/exception-recovery/${instagramCanaryRecord}/conversation',
    '/${token}/preflight':'/api/admin/exception-recovery/${instagramCanaryRecord}/preflight',
    '/${token}/counts':'/api/admin/exception-recovery/counts?fresh=1',
    '/${token}/quality':'/api/admin/exception-recovery',
    '/${token}/home-refresh':'/api/profiles/overview/refresh',
    '/${token}/home-refresh-status':'/api/profiles/overview/refresh-status',
    '/${token}/home-overview':'/api/profiles/overview',
    '/${token}/yt3374':'/api/admin/exception-recovery/rec9uw6xfRJGXpqz1/receipt?authenticated=1',
    '/${token}/yt3241':'/api/admin/exception-recovery/recJOW1OsfNeNhRW4/receipt?authenticated=1',
    '/${token}/yt9308':'/api/admin/exception-recovery/rec4R88s8mlZLE6UO/receipt?authenticated=1'
   };
   const path=routes[url.pathname];if(!path)return new Response('Not found',{status:404});
   const headers={'Accept':'application/json','Origin':'https://studio.chicagoshining.com'};
   if(!url.pathname.endsWith('/denied')&&!url.pathname.endsWith('/conversation-denied'))headers['Cf-Access-Authenticated-User-Email']='joseph.t.logan@gmail.com';
   if(request.method==='POST')headers['Content-Type']='application/json';
   const postBody=request.method==='POST'?await request.text():undefined;
   const response=await env.STUDIO_API.fetch(new Request('https://studio.chicagoshining.com'+path,{method:request.method,headers,...(postBody?{body:postBody}:{})}));
   return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }};`;
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify({main_module:'worker.js',compatibility_date:'2026-08-02',bindings:[{type:'service',name:'STUDIO_API',service:target}]})],{type:'application/json'}),'metadata.json');
 form.append('worker.js',new Blob([source],{type:'application/javascript+module'}),'worker.js');
 await cf('/workers/scripts/'+bridge+'/content',{method:'PUT',body:form});bridgeCreated=true;
 await cf('/workers/scripts/'+bridge+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
 const {subdomain}=await cf('/workers/subdomain');
 async function probe(route, options={}) {
  for(let attempt=0;attempt<30;attempt++) {
   const res=await fetch('https://'+bridge+'.'+subdomain+'.workers.dev/'+token+'/'+route,{method:options.body?'POST':'GET',headers:options.body?{'Content-Type':'application/json'}:{},...(options.body?{body:JSON.stringify(options.body)}:{}),redirect:'error',signal:AbortSignal.timeout(route==='counts'?150000:route==='quality'?120000:60000)});
   const text=await res.text();
   if(text.includes('error code: 1042') || (res.status===404 && !text.trim().startsWith('{'))){await new Promise(r=>setTimeout(r,3000));continue;}
   let body;try{body=JSON.parse(text);}catch{throw new Error('verification_bridge_non_json_'+res.status);}
   return {status:res.status,body};
  }
  throw new Error('verification_bridge_routing_unavailable');
 }
 const health=await probe('health');report.worker_health=health.body.version;
 if(report.flags.EXCEPTION_RECOVERY_ACTIONS_ENABLED==='true')throw new Error('administrator_recovery_mutations_unexpectedly_enabled');
 // Validate the actual protected recovery endpoints below, not a mutable release-name substring.
 if(health.status!==200 || typeof health.body?.version !== 'string')throw new Error('deployed_worker_health_unavailable');
 const denied=await probe('denied');report.unauthenticated_history_status=denied.status;
 if(![401,403].includes(denied.status))throw new Error('history_admin_boundary_failed');
 const deniedConversation=await probe('conversation-denied');report.unauthenticated_conversation_status=deniedConversation.status;
 if(![401,403].includes(deniedConversation.status))throw new Error('conversation_admin_boundary_failed');
 const preflight=await probe('preflight');
 report.administrator_preflight={http_status:preflight.status,mutations_enabled:preflight.body?.administrator_recovery_actions_enabled};
 if(preflight.status!==200||preflight.body?.administrator_recovery_actions_enabled!==false)
   throw new Error('administrator_recovery_mutation_gate_not_proven_off');
 const history=await probe('history');report.history={status:history.status,source:history.body.source,events:history.body.items?.length};
 if(history.status!==200||history.body.source!=='airtable_exception_recovery_audit')throw new Error('durable_history_unavailable');
 // The live status is R2-backed, not inferred from deployment manifest.
 // Verify effective policy and show the last persisted sweep. Never require
 // a nonzero correction count: already-posted / ineligible / held items can
 // legitimately yield zero and must not be re-dispatched to boost a metric.
 const livePolicy=history.body.automation?.policy||{};
 const liveRuntime=history.body.automation?.runtime||null;
 report.publication_recovery_runtime={
   policy:{inspect:livePolicy.inspect===true,mutate:livePolicy.mutate===true,
     broad:livePolicy.broad===true,batch:livePolicy.batch??null,
     interval_ms:livePolicy.intervalMs??null,cooldown_ms:livePolicy.cooldownMs??null,
     max_attempts:livePolicy.maxAttempts??null},
   last_sweep:liveRuntime?.heartbeat||null,
   priority_cursor:liveRuntime?.priority_cursor??null,
   next_at:liveRuntime?.next_at?new Date(liveRuntime.next_at).toISOString():null,
   status:liveRuntime?.heartbeat?.status||'unavailable'
 };
 if(rollout.stage==='bounded'&&(
    livePolicy.inspect!==true||livePolicy.mutate!==true||livePolicy.broad!==true||
    livePolicy.batch!==rollout.batch_size||
    livePolicy.intervalMs!==rollout.scan_interval_minutes*60000))
   throw new Error('effective_publication_recovery_throughput_policy_mismatch');
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

 // One authorized, persistence-only conversation POST. Never touch output or provider.
 // Re-GET twice via distinct requests: the same route the Studio reload uses.
 let conversationError=null;
 try {
 const conversationBefore=await probe('conversation');
 if(conversationBefore.status!==200||!Array.isArray(conversationBefore.body?.messages))
   throw new Error('conversation_initial_admin_get_failed');
 const clientId='verification'+String(process.env.GITHUB_RUN_ID||'oneoff').padStart(16,'0');
 const key='erc:'+instagramCanaryRecord+':'+clientId;
 const message='Please verify the existing Instagram receipt for output 7864. This tests durable administrator conversations only; make no output changes.';
 const written=await probe('conversation',{body:{client_request_id:clientId,message}});
 report.conversation_post_status=written.status;
 if(written.status!==200||written.body?.status!=='ok')
   throw new Error('conversation_admin_write_or_server_readback_failed_'+written.status);
 const afterOne=await probe('conversation'),afterTwo=await probe('conversation');
 const validateConversation=(result)=>result.status===200
   &&Array.isArray(result.body?.messages)
   &&result.body.messages.some(m=>m.event_key===key+':administrator'&&m.role==='administrator'&&m.message===message)
   &&result.body.messages.some(m=>m.event_key===key+':quality_agent'&&m.role==='quality_agent'
      &&m.reply_to===key+':administrator'&&String(m.message||'').includes('verification request'));
 if(!validateConversation(afterOne)||!validateConversation(afterTwo))
   throw new Error('persisted_conversation_reload_readback_failed');
 report.conversation={target_output:7864,created_new:written.body.replay!==true,
   administrator_message_persisted:true,quality_agent_reply_persisted:true,
   independent_reads:2,ids_reused_across_reads:true,output_state_unchanged_not_yet_verified:true};
 const recheck=await probe('conversation',{body:{client_request_id:clientId,message}});
 if(recheck.status!==200||recheck.body?.replay!==true)
   throw new Error('conversation_idempotent_replay_failed');
 report.conversation.idempotent_replay=true;
 } catch(error){conversationError=String(error?.message||error).slice(0,140);report.conversation_error=conversationError;}
 // Inspect each exact outstanding existing YouTube video using only GET.
 const candidates=[
  {route:'yt3374',id:3374,record:'rec9uw6xfRJGXpqz1',video:'BV72YCPUvEg'},
  {route:'yt3241',id:3241,record:'recJOW1OsfNeNhRW4',video:'1H4A-8pey78'},
  {route:'yt9308',id:9308,record:'rec4R88s8mlZLE6UO',video:'xu3c4I_PCTI'},
 ];
 report.youtube_candidates=[];
 for(const candidate of candidates){
  let response;
  try{response=await probe(candidate.route);}catch(error){report.youtube_candidates.push({output_id:candidate.id,status:'unavailable',reason:String(error?.message||error).slice(0,130)});continue;}
  const body=response.body||{};
  report.youtube_candidates.push({
   output_id:candidate.id,http_status:response.status,
   identity_match:Number(body.output_id)===candidate.id && body.remote_id===candidate.video,
   remote_id:body.remote_id||null,
   verified_delivery:body.verified_delivery===true,
   ownership_verified:body.ownership_verified===true,
   verified_public:body.verified_public===true,
   no_output_write:body.verification?.no_output_write===true,
   eligible:body.verification?.eligible===true,
   blocked_reason:body.verification?.blocked_reason||body.evidence||body.error||null,
  });
 }
 // Home must be rebuilt BEFORE the canonical census, not several minutes
 // earlier at deployment time. Respect refresh cooldown and component-budget
 // gates; this POST updates only an existing Home cache, never output records.
 try {
   const before=await probe('home-refresh-status');
   if(before.status!==200)throw new Error('home_refresh_status_http_'+before.status);
   const initial=assessHomeRefresh(before.body,Date.now());
   let started=false;
   if(initial.status!=='fresh' && initial.status!=='building'){
     if(initial.status==='cooling_down')throw new Error('home_refresh_cooling_down');
     const trigger=await probe('home-refresh',{body:{}});
     const code=String(trigger.body?.refresh?.status||trigger.body?.status||'');
     if(![200,202].includes(trigger.status) || !['refreshing','completed'].includes(code))
       throw new Error('home_refresh_not_accepted_http_'+trigger.status+'_state_'+code);
     started=true;
   }
   let fresh=null;
   for(let attempt=0;attempt<90;attempt++) {
     const status=await probe('home-refresh-status');
     if(status.status!==200)throw new Error('home_refresh_poll_http_'+status.status);
     const assessment=assessHomeRefresh(status.body,Date.now());
     if(assessment.status==='fresh'){fresh=assessment;break;}
     if(assessment.status==='failed'||assessment.status==='cooling_down')
       throw new Error('home_refresh_'+assessment.status+'_'+String(assessment.reason||''));
     if(assessment.status==='needs_refresh' && started && attempt>=3)
       throw new Error('home_refresh_returned_incomplete_or_stale_generation');
     await new Promise(resolve=>setTimeout(resolve,1500));
   }
   if(!fresh)throw new Error('home_refresh_timeout');
   const snapshot=await probe('home-overview');
   if(snapshot.status!==200 || !verifyHomeOverviewGeneration(snapshot.body,fresh))
     throw new Error('home_refresh_generation_readback_mismatch');
   report.home_refresh={status:'fresh_complete_generation',triggered:started,
     generation:fresh.generation,snapshot_at:fresh.snapshot_at,
     age_ms_at_readback:Date.now()-fresh.snapshot_at,profiles:snapshot.body.records.length};
 }catch(error){
   report.home_refresh={status:'unavailable',reason:String(error?.message||error).slice(0,160)};
 }
 // Explicit expensive full-source census requested by the administrator.
 // Count parity requires a pinned, stable, fresh Home generation; report honestly.
 let census;
 try{census=await probe('counts');}catch(error){report.counts={status:'unavailable',reason:String(error?.message||error).slice(0,130)};}
 const c=census?.body||{};
 if(census)report.counts={http_status:census.status,status:c.status||null,source_rows:c.source_row_count??null,
  totals:c.totals||null,quality_agent_disagreements:c.comparisons||null,
  home_snapshot_comparison:c.home_snapshot_comparison||null,cache_status:c.census_cache_status||null,
  scanned_at:c.scan_completed_at||null};
 if(census&&(census.status!==200||c.status!=='complete_census'))report.counts.warning='authoritative_complete_census_not_proven';
 // Separate, authenticated, GET-only Quality Agent formula scan. Never force
 // this independent scan inside the 8k-record census: doing so caused 500s.
 // Full source exception-ID coverage, snapshot skew and QA scope must all pass.
 let qualitySnapshot=null;
 try{
  const quality=await probe('quality');
  if(quality.status===200) qualitySnapshot=quality.body;
  report.quality_agent_parity=quality.status===200
    ?compareIndependentQaCensus(c,quality.body)
    :{status:'unavailable',reason:'quality_agent_http_'+quality.status};
  report.quality_agent_parity.http_status=quality.status;
 }catch(error){
  report.quality_agent_parity={status:'unavailable',
    reason:String(error?.message||error).slice(0,160)};
 }
 // This is a read-only disposition manifest, not provider or Airtable recovery.
 // Fail closed when the canonical census is truncated or a case is unclassified.
 report.exception_disposition=summarizeStage3ExceptionDispositions(c,qualitySnapshot);
 if(report.exception_disposition.status!=='classified_read_only')
   throw new Error('complete_exception_disposition_unavailable_'+report.exception_disposition.reason);

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
 if(conversationError)throw new Error('conversation_persistence_unverified_'+conversationError);
 if(!census||census.status!==200||c.status!=='complete_census')throw new Error('authoritative_census_unverified');
 const failures=[];
 if(report.home_refresh?.status!=='fresh_complete_generation')failures.push('home_refresh_unverified');
 if(c.home_snapshot_comparison?.status!=='counts_match_stable_generation')failures.push('home_counts_not_fresh_and_equal');
 if(report.quality_agent_parity?.status!=='complete'
     || report.quality_agent_parity?.failed?.status!=='matched'
     || report.quality_agent_parity?.approved_past_due?.status!=='matched')
   failures.push('quality_agent_exact_id_parity_not_verified');
 if(report.exception_disposition?.status!=='classified_read_only')
   failures.push('exception_disposition_unavailable');
 report.stage3_quality_home_acceptance={
   status:failures.length?'blocked':'passed',
   reasons:failures,source_rows:c.source_row_count??null,
   scan_skew_ms:report.quality_agent_parity?.scan_skew_ms??null,
   note:'Strict independent source/QA exact-ID and fresh Home generation; no count fudging during active publication.'
 };
 if(failures.length)process.exitCode=1;
} catch(error) {
 report.canary_status='unavailable';report.error=String(error.message).slice(0,160);process.exitCode=1;
} finally {
 if(bridgeCreated) {
  try {await cf('/workers/scripts/'+bridge,{method:'DELETE'});report.temporary_bridge_deleted=true;}
  catch {report.temporary_bridge_deleted=false;process.exitCode=1;}
 }
 report.completed_at=new Date().toISOString();
 await fs.writeFile('/tmp/exception-recovery-production-audit.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
