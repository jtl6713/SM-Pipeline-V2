// Temporary fixed-scope recovery of an already authenticated owner submission.
// No creation of approvals, owner impersonation, global scheduler or provider calls.
import {factoryApprovalGroupRead,factoryApprovalGroupStatus} from "./factory-approval-groups.mjs";
import {factoryBatchRead} from "./factory-approval-queue.mjs";
import {originalFactoryIntent} from "./factory-original-intent.mjs";
import {factorySupabaseApprovalRows} from "./factory-supabase-approval.mjs";
import {studioWriteSource,studioSupabaseConfigured} from "./supabase-pipeline-reads.mjs";
import {windowsOutageState} from "./windows-outage-control.mjs";

export const ZOO_REQUEST="e3aff4f8-a9c4-4333-876d-e0523144f293";
const PROFILE="recpNlNn6U6eq0M9r", PARENT="recQ12ZNaNvUCFHUZ", ACTOR="recaKAksAFrEv21RO";
const TARGETS=Object.freeze({recRL0ElgmiMeCrCB:11366,reckgKjanErnF0fu6:11367,recCOqBl4WBgm9gDV:11368,recMNRgOhg55kroN2:11369,rec9dNkjjXVczL2cv:11370,rece3pyxERb3K2pOj:11371});
const IDS=Object.keys(TARGETS);
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const check=(v,m)=>{if(!v)fail(m);};
const exactRows=rows=>Array.isArray(rows)&&rows.length===6&&new Set(rows.map(r=>r.id)).size===6&&rows.every(r=>TARGETS[r.id]===Number(r.output_id)&&(!r.profile_id||r.profile_id===PROFILE));
const receipt=row=>{let value=row.error_messages?.SM_Factory_Supabase_Approval_Receipt; if(typeof value==="string"){try{value=JSON.parse(value)}catch{return null}}return value;};
async function authorize(request,env){
 const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"");
 const supplied=String(request.headers.get("X-Pipeline-Secret")||"");
 if(secret.length<24||supplied.length!==secret.length)fail("Invalid pipeline secret",401);
 const hash=async x=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x)));
 const [a,b]=await Promise.all([hash(secret),hash(supplied)]);
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 if(mismatch)fail("Invalid pipeline secret",401);
}
export async function exactZooFactoryDrain(request,env,process,{
 now=()=>Date.now(), outage=windowsOutageState, source=studioWriteSource, configured=studioSupabaseConfigured,
 readGroup=factoryApprovalGroupRead, readChild=factoryBatchRead, readStatus=factoryApprovalGroupStatus,
 readRows=factorySupabaseApprovalRows,
}={}){
 if(request.method!=="POST"||new URL(request.url).search)fail("Exact POST required",405);
 await authorize(request,env);
 if(now()>Date.parse("2026-11-29T07:00:00Z"))fail("Exact incident recovery expired",410);
 if((await request.text())!=="")fail("No caller-controlled scope",400);
 check(outage().active===true&&source(env)==="supabase"&&configured(env),"Outage or canonical authority changed");
 const read=async()=>{
  const group=await readGroup(env.STUDIO_MEDIA,ZOO_REQUEST);
  check(group?.request_id===ZOO_REQUEST&&group.submitted_by===ACTOR&&exactRows(group.records)&&group.children?.length===1,"Original group identity unverified");
  const child=group.children[0];
  check(child.profile_id===PROFILE&&exactRows(child.records),"Child scope changed");
  const job=await readChild(env.STUDIO_MEDIA,PROFILE,child.request_id);
  const intent=originalFactoryIntent(job,group);
  check(intent?.requestId===ZOO_REQUEST&&intent.approvedByUserRecordId===ACTOR&&exactRows(job.items),"Original owner consent unverified");
  const entries=await readRows(env,IDS);
  let approved=0;
  for(const id of IDS){
   const e=entries.get(id),r=e?.row;
   check(e?.profileId===PROFILE&&r?.airtable_record_id===id&&Number(r.output_number)===TARGETS[id]&&r.content_item_airtable_id===PARENT&&r.render_status==="Rendered"&&r.do_not_publish===false&&!r.published_at&&!r.platform_post_url&&!r.platform_publish_response&&r.final_file_url&&r.studio_preview_url,"Canonical Zoo scope or media changed");
   if(r.review_status==="Approved"){
    const rec=receipt(r);
    check(r.output_status==="Approved for Publishing"&&r.auto_publish_enabled===true&&r.scheduled_post_date&&r.studio_scheduled_at&&rec?.request_id===ZOO_REQUEST&&rec.approval_actor_record_id===ACTOR&&rec.actor_provenance==="authenticated_factory_submission"&&rec.published===false&&Date.parse(rec.scheduled_for)===Date.parse(r.scheduled_post_date),"Existing approval receipt changed");
    approved++;
   }else{
    check(r.review_status==="Review Sent"&&r.output_status==="Ready for Review"&&r.publish_status==="Not Ready"&&r.auto_publish_enabled===false&&!r.scheduled_post_date&&!r.studio_scheduled_at&&!r.youtube_scheduled_publish_at&&!receipt(r)&&Date.parse(r.updated_at)<=Date.parse(intent.submittedAt),"Pending approval revision changed");
   }
  }
  check(approved>=1,"Original accepted approval anchor missing");
  const status=await readStatus(env.STUDIO_MEDIA,ZOO_REQUEST);
  check(status?.total===6&&status.failed_count===0&&status.request_id===ZOO_REQUEST,"Original group failure or identity changed");
  return {child,approved,pending:status.pending_count};
 };
 let before=await read();
 for(let i=0;i<4&&before.pending>0;i++){
  // continueSlice=8 disables the generic sibling continuation path. Each
  // invocation retains the existing profile/output/MAE locks and owner ledger.
  await process(env,PROFILE,before.child.request_id,null,{scheduled:true,inline:true,continueSlice:8,deadlineMs:now()+25000});
  const after=await read();
  if(after.approved===before.approved&&after.pending===before.pending){before=after;break;}
  before=after;
 }
 return {ok:true,request_id:ZOO_REQUEST,approved:before.approved,pending:before.pending,complete:before.approved===6&&before.pending===0,publication_authorized:false};
}
