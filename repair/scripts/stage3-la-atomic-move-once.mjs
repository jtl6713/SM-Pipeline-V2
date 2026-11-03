import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID, TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const SCRIPT='chicagoshining-studio-api';
const BRIDGE='stage3-la-atomic-'+process.env.GITHUB_RUN_ID;
const LANE='recF7UAn0LkMZZrWZ::instagram';
const REC='rec6viJf8fDV0nxgo';
const OTHER='recwCLxBKTQfEDSZU';
const STORY='recfUFn4lTzZ4yrEX';
const OLD='2027-01-02T00:30:00.000Z';
const NEW='2027-01-02T22:00:00.000Z';
const STORY_DATE='2027-01-02T00:40:00.000Z';
const report={schema:'stage3.la-atomic-mae.1',target_output_id:2566,conflicting_output_id:8434,no_provider_writes:true,production_patched:false,atomic_move_verified:false,bridge_deleted:false,steps:[]};
let bridgeCreated=false, productionPatched=false, oldBindings, oldAllowlist, originalVersion, gateOpened=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(condition,why){if(!condition)throw Error(why)}
async function cf(path,options={}){
  const r=await fetch(ROOT+path,{...options,headers:{Authorization:'Bearer '+TOKEN,...(options.headers||{})},signal:AbortSignal.timeout(45000)});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||body.success!==true)throw Error('cloudflare_http_'+r.status+'_'+path.split('/').slice(-1)[0]);
  return body.result;
}
async function settingsPatch(bindings){
  const form=new FormData();
  form.append('settings',new Blob([JSON.stringify({bindings})],{type:'application/json'}),'settings.json');
  return cf('/workers/scripts/'+SCRIPT+'/settings',{method:'PATCH',body:form});
}
function byName(rows){return new Map(rows.map(x=>[x.name,x]));}
function inheritedWithAllowlist(rows,value){
  return rows.map(x=>x.name==='STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST'?
    {name:x.name,type:'plain_text',text:value}:
    {name:x.name,type:'inherit'});
}
function assertBindingParity(before,after,expectedAllowlist){
  const previous=byName(before),now=byName(after);
  assert(previous.size===before.length&&now.size===after.length,'duplicate_binding_names');
  assert(before.length===after.length,'binding_count_changed');
  for(const [name,b] of previous){
    const a=now.get(name);
    assert(a&&a.type===b.type,'binding_missing_or_type_changed_'+name);
    if(b.type==='plain_text')
      assert(String(a.text||'')===(name==='STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST'?expectedAllowlist:String(b.text||'')),
        'plain_value_changed_'+name);
    if(b.type==='r2_bucket')assert((a.bucket_name||a.bucket)===(b.bucket_name||b.bucket),'r2_bucket_changed_'+name);
    if(b.type==='durable_object_namespace')
      assert(a.class_name===b.class_name,'durable_class_changed_'+name);
  }
}
const bridgeToken=crypto.randomBytes(32).toString('hex');
let origin='';
async function bridge(op){
  for(let attempt=1;attempt<=12;attempt++){
    const r=await fetch(origin+'/'+bridgeToken+'/'+op,{
      method:op==='move'?'POST':'GET',
      headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(op==='move'?100000:65000),redirect:'error'
    });
    const txt=await r.text();
    if((txt.includes('error code: 1042')||(r.status===404&&!txt.trim().startsWith('{'))) && attempt<12){
      await sleep(3000);continue;
    }
    let payload;try{payload=JSON.parse(txt)}catch{throw Error('bridge_non_json_'+op+'_'+r.status)}
    return {http:r.status,...payload};
  }
  throw Error('bridge_not_ready_'+op);
}
function checkRow(r,id,num,expected,story=false){
  assert(r?.id===id&&Number(r.output_id)===num,'source_identity_changed_'+num);
  assert(r.platform==='Instagram','platform_changed_'+num);
  assert(r.output_status==='Approved for Publishing'&&r.review_status==='Approved'&&r.publish_status==='Ready to Schedule',
    'source_approval_or_publish_status_changed_'+num);
  assert(r.do_not_publish!==true&&!r.published_at&&!r.platform_post_id&&!r.platform_post_url&&!r.platform_media_id,
    'source_hold_or_provider_identity_present_'+num);
  assert(!r.publish_locked_by&&!r.publish_locked_at,'source_publish_lease_present_'+num);
  assert(Date.parse(r.scheduled_post_date)===Date.parse(expected),'source_schedule_changed_'+num);
  if(story) assert(/story/i.test(r.studio_output_type||''),'story_companion_type_changed');
  else assert(/reel/i.test(r.studio_output_type||''),'reel_type_changed_'+num);
}
function validateOutputState(snapshot,after=false){
  assert(snapshot?.ok===true&&snapshot?.lane===LANE,'bridge_preflight_failed');
  checkRow(snapshot.rows?.target,REC,2566,after?NEW:OLD);
  checkRow(snapshot.rows?.other,OTHER,8434,OLD);
  checkRow(snapshot.rows?.story,STORY,8437,STORY_DATE,true);
  assert(snapshot.do?.ok===true,'do_status_missing');
  if(!after){
    assert(snapshot.do.generation===0&&snapshot.do.lock==null&&snapshot.do.quarantine==null&&
      (snapshot.do.recent_reservations||[]).length===0,'do_lane_was_not_empty');
  }else{
    const entry=(snapshot.do.recent_reservations||[]).find(x=>x.platform_output_record_id===REC);
    assert(entry&&Date.parse(entry.scheduled_iso)===Date.parse(NEW),'atomic_ledger_commit_not_found');
    assert(snapshot.do.quarantine==null,'do_quarantine_after_move');
    assert(Date.parse(snapshot.rows.target.scheduled_at)===Date.parse(NEW),'studio_scheduled_marker_missing_after_move');
    assert(Date.parse(snapshot.rows.other.scheduled_post_date)===Date.parse(OLD),'other_output_moved');
  }
}
const bridgeSource=[
  'const KEY='+JSON.stringify(bridgeToken)+';',
  'const LANE='+JSON.stringify(LANE)+';',
  'const IDS='+JSON.stringify({target:REC,other:OTHER,story:STORY})+';',
  'const NEW='+JSON.stringify(NEW)+';',
  'const EMAIL='+JSON.stringify('joseph.t.logan@gmail.com')+';',
  'const fields={Accept:"application/json",Origin:"https://studio.chicagoshining.com","Cf-Access-Authenticated-User-Email":EMAIL};',
  'async function getOutput(env,id){let r=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com/api/outputs/"+id,{headers:fields}));let j=await r.json().catch(()=>({}));if(r.status!==200||j.ok!==true||!j.record)throw Error("source_read_"+id+"_"+r.status);return j.record}',
  'async function inspect(env){const rows={};for(const [name,id] of Object.entries(IDS))rows[name]=await getOutput(env,id);const ns=env.STUDIO_SCHEDULE_RESERVATIONS;const doReply=await ns.get(ns.idFromName(LANE)).fetch(new Request("https://schedule-reservation/status"));const state=await doReply.json();if(!doReply.ok||state.ok!==true)throw Error("do_status_failed");return {ok:true,lane:LANE,rows,do:state}}',
  'export default {async fetch(request,env){const u=new URL(request.url);const p=u.pathname.split("/");if(p.length!==3||p[1]!==KEY||!["read","move"].includes(p[2])||request.method!==(p[2]==="read"?"GET":"POST"))return new Response("Not found",{status:404});try{if(p[2]==="read")return Response.json(await inspect(env),{headers:{"cache-control":"no-store"}});const before=await inspect(env);const a=before.rows.target,b=before.rows.other,s=before.rows.story;',
  'if(before.lane!==LANE||Number(a.output_id)!==2566||Number(b.output_id)!==8434||Number(s.output_id)!==8437||a.platform!=="Instagram"||a.studio_output_type!=="Reel"||Date.parse(a.scheduled_post_date)!==Date.parse("'+OLD+'")||Date.parse(b.scheduled_post_date)!==Date.parse("'+OLD+'")||Date.parse(s.scheduled_post_date)!==Date.parse("'+STORY_DATE+'")||before.do.quarantine||before.do.lock||before.do.generation!==0||before.do.recent_reservations.length!==0)return Response.json({ok:false,error:"atomic_preconditions_changed"},{status:409});',
  'for(const r of [a,b,s]){if(r.output_status!=="Approved for Publishing"||r.review_status!=="Approved"||r.publish_status!=="Ready to Schedule"||r.do_not_publish||r.published_at||r.platform_post_id||r.platform_post_url||r.platform_media_id||r.publish_locked_by||r.publish_locked_at)return Response.json({ok:false,error:"safety_guard_changed"},{status:409})}',
  'const resp=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com/api/operations/outputs/"+IDS.target+"/schedule",{method:"POST",headers:{...fields,"Content-Type":"application/json"},body:JSON.stringify({scheduled_post_date:NEW,manual_schedule_override:true,schedule_operation_id:"stage3-la-exact-collision-"+IDS.target})}));const result=await resp.json().catch(()=>({}));return Response.json({ok:resp.status===200&&result.ok===true,code:resp.status,record:result.record?{id:result.record.id,output_id:result.record.output_id,scheduled_post_date:result.record.scheduled_post_date,scheduled_at:result.record.scheduled_at}:null,error:result.error||null},{status:resp.status});',
  '}catch(e){return Response.json({ok:false,error:String(e.message||e).slice(0,220)},{status:502})}}};'
].join('\n');

async function createBridge(){
  const name='/workers/scripts/'+BRIDGE;
  let status=404;
  try{await cf(name+'/settings');status=200}catch(e){if(!String(e.message).includes('cloudflare_http_404_'))throw e}
  assert(status===404,'bridge_preexisting');
  // Use the same pinned Wrangler service-binding deployment proven by live
  // Stage 3 GET + Durable Object verification (run 41685151152).
  const dir='/tmp/stage3-la-atomic-wrangler-'+String(process.env.GITHUB_RUN_ID||'local');
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(dir+'/worker.mjs',bridgeSource);
  await fs.writeFile(dir+'/wrangler.jsonc',JSON.stringify({
    name:BRIDGE,main:'worker.mjs',compatibility_date:'2026-10-01',workers_dev:true,
    services:[{binding:'STUDIO_API',service:SCRIPT}],
    durable_objects:{bindings:[{
      name:'STUDIO_SCHEDULE_RESERVATIONS',
      class_name:'ScheduleReservationLane',script_name:SCRIPT,
    }]}
  },null,2));
  const wrangler=process.env.GITHUB_WORKSPACE+'/node_modules/.bin/wrangler';
  assert(process.env.GITHUB_WORKSPACE,'missing_github_workspace');
  execFileSync(wrangler,['deploy','--config',dir+'/wrangler.jsonc','--name',BRIDGE],{
    cwd:dir,env:process.env,timeout:120000,stdio:'pipe',
  });
  bridgeCreated=true;
  const sub=(await cf('/workers/subdomain')).subdomain;
  assert(sub,'workers_subdomain_unavailable');
  origin='https://'+BRIDGE+'.'+sub+'.workers.dev';
}
async function tearBridge(){
  if(!bridgeCreated){report.bridge_deleted=true;return}
  try{await cf('/workers/scripts/'+BRIDGE,{method:'DELETE'});report.bridge_deleted=true}
  catch(e){report.errors=(report.errors||[]).concat('bridge_cleanup_failed');process.exitCode=1}
}
async function verifyBindingState(allowlist){
  const settings=await cf('/workers/scripts/'+SCRIPT+'/settings');
  const bindings=settings.bindings||[];
  assertBindingParity(oldBindings,bindings,allowlist);
  const deployments=await cf('/workers/scripts/'+SCRIPT+'/deployments');
  assert(deployments.deployments[0].versions.length===1&&
    deployments.deployments[0].versions[0].percentage===100,'partial_production_deployment');
  const versionId=deployments.deployments[0].versions[0].version_id;
  const active=(await cf('/workers/scripts/'+SCRIPT+'/versions/'+versionId)).resources.bindings||[];
  assertBindingParity(oldBindings,active,allowlist);
  return versionId;
}
async function revertAllowlist(){
  if(!productionPatched||!oldBindings)return;
  const current=(await cf('/workers/scripts/'+SCRIPT+'/settings')).bindings||[];
  const currentNames=byName(current);
  assert(currentNames.size===oldBindings.length,'cannot_safely_revert_missing_bindings');
  await settingsPatch(inheritedWithAllowlist(current,oldAllowlist));
  await verifyBindingState(oldAllowlist);
  report.allowlist_restored=true;
}
try{
  assert(process.env.GITHUB_REPOSITORY==='jtl6713/SM-Pipeline-V2'&&process.env.GITHUB_REF==='refs/heads/main','not_main');
  assert(ACCOUNT&&TOKEN,'cloudflare_secrets_missing');
  const deployments=await cf('/workers/scripts/'+SCRIPT+'/deployments');
  assert(deployments.deployments[0].versions.length===1&&deployments.deployments[0].versions[0].percentage===100,'multiple_active_versions');
  originalVersion=deployments.deployments[0].versions[0].version_id;
  const activeVersion=await cf('/workers/scripts/'+SCRIPT+'/versions/'+originalVersion);
  const live=await cf('/workers/scripts/'+SCRIPT+'/settings');
  oldBindings=activeVersion.resources.bindings||[];
  assert(oldBindings.length>10,'production_binding_inventory_incomplete');
  assertBindingParity(oldBindings,live.bindings||[],String(byName(oldBindings).get('STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST')?.text||''));
  const mapped=byName(oldBindings);
  assert(mapped.get('STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED')?.text==='true','authority_not_enabled');
  assert(mapped.get('STUDIO_SCHEDULE_RESERVATIONS')?.type==='durable_object_namespace','do_binding_missing');
  assert(mapped.get('AIRTABLE_PAT')?.type==='secret_text','airtable_secret_missing');
  assert(mapped.get('STUDIO_MEDIA')?.type==='r2_bucket','r2_binding_missing');
  oldAllowlist=String(mapped.get('STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST')?.text||'');
  assert(oldAllowlist==='recT2rbKX3MF7cVFU::instagram','unexpected_existing_allowlist');
  report.steps.push('production_binding_anchor_verified');
  await createBridge();
  const before=await bridge('read');
  report.bridge_preflight={http:before.http,ok:before.ok,error:before.error||null,has_rows:Boolean(before.rows),do_ok:before.do?.ok||false};
  validateOutputState(before);
  report.steps.push('authenticated_source_and_exact_do_preflight_passed');
  const latestDeploy=await cf('/workers/scripts/'+SCRIPT+'/deployments');
  assert(latestDeploy.deployments[0].versions[0].version_id===originalVersion,'production_changed_during_preflight');
  const expanded=oldAllowlist+','+LANE;
  await settingsPatch(inheritedWithAllowlist(oldBindings,expanded));
  productionPatched=true;report.production_patched=true;
  const addedVersion=await verifyBindingState(expanded);
  assert(addedVersion!==originalVersion,'settings_update_was_not_deployed');
  report.steps.push('la_allowlist_enabled_with_all_bindings_preserved');
  // New Worker settings may need edge propagation: enforce postpatch preflight from the bridge.
  const refreshed=await bridge('read');validateOutputState(refreshed);
  // The public Studio Worker must route through its atomic branch when LA allowlist is active.
  const moved=await bridge('move');
  report.move_http=moved.http;
  assert(moved.http===200&&moved.ok===true&&
    Date.parse(moved.record?.scheduled_post_date)===Date.parse(NEW),'atomic_schedule_endpoint_refused_or_ambiguous');
  report.steps.push('protected_atomic_move_accepted');
  const after=await bridge('read');
  validateOutputState(after,true);
  report.atomic_move_verified=true;
  report.steps.push('airtable_and_do_reservation_verified');
  await revertAllowlist(); // Restore original rollout scope after committed repair; committed reservation persists in DO.
  report.steps.push('original_allowlist_restored');
}catch(e){
  report.error=String(e.message||e).slice(0,300);
  process.exitCode=1;
  // Do not auto-revert if an external write may have occurred and its status is ambiguous.
  // If no scheduling call started, restoring prior allowlist does not affect an in-flight transaction.
  if(productionPatched&&!report.steps.includes('protected_atomic_move_accepted')&&
    !['atomic_schedule_endpoint_refused_or_ambiguous'].includes(report.error)){
    try{await revertAllowlist()}catch(err){report.rollback_error=String(err.message||err).slice(0,200)}
  }
}finally{
  await tearBridge();
  await fs.writeFile('/tmp/stage3-la-mae-result.json',JSON.stringify(report,null,2));
  console.log('STAGE3_LA_ATOMIC '+JSON.stringify(report));
  if(!report.bridge_deleted||!report.atomic_move_verified||!report.allowlist_restored)process.exitCode=1;
}
