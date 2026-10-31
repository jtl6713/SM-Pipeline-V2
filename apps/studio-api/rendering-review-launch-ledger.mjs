/**
 * Protected Remotion launch ledger for one claimed profile-scoped Rendering Review Job.
 *
 * OFF by default. Airtable Job Event_History_JSON is a durable write-once ledger:
 * the launch intent is persisted and read back BEFORE an irreversible POST, and
 * a receipt is recorded only against that same intent. No second launch is ever
 * authorized by an existing intent, including an ambiguous timeout.
 *
 * Every operation uses the canonical R2 output lock and fresh independent
 * session/hold/output/job reads. No browser, model or render result can grant
 * publisher, scheduler, Drive deletion or original-output mutation authority.
 */
import {reviewRendererJobClaimEnabled} from "./rendering-review-job-claim.mjs";
import {protectedReviewRunnerScope} from "./rendering-review-internal-scope.mjs";

const rec=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const digestPattern=/^[a-f0-9]{64}$/;
const txt=x=>String(x??"").trim();
function deny(code,message,status=409){
  const e=new Error(message);e.code=code;e.status=status;throw e;
}
export function reviewLaunchLedgerEnabled(env){
  return reviewRendererJobClaimEnabled(env)&&
    env?.RENDERING_REVIEW_LAUNCH_LEDGER_ENABLED==="true";
}
async function hashed(s){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
async function auth(request,env){
  const expected=txt(env?.RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET);
  const actual=txt(request?.headers?.get("X-Rendering-Review-Job-Secret"));
  if(expected.length<24||actual.length!==expected.length)
    deny("LAUNCH_LEDGER_AUTH_DENIED","Internal render credential required",403);
  const [a,b]=await Promise.all([hashed(expected),hashed(actual)]);
  let different=0;
  for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);
  if(different)deny("LAUNCH_LEDGER_AUTH_DENIED","Internal render credential required",403);
}
function getEvents(job){
  const raw=job?.event_history_json;
  if(typeof raw!=="string"||raw.length>50000)
    deny("LEDGER_HISTORY_UNVERIFIED","Job event history unavailable",503);
  let history;
  try{history=JSON.parse(raw)}catch{
    deny("LEDGER_HISTORY_UNVERIFIED","Job event history is invalid",503);
  }
  if(!Array.isArray(history)||history.length>40)
    deny("LEDGER_HISTORY_UNVERIFIED","Job event history out of bounds",503);
  const intent=history.filter(x=>x?.kind==="review_remotion_launch_intent");
  const receipt=history.filter(x=>x?.kind==="review_remotion_launch_receipt");
  if(intent.length>1||receipt.length>1)
    deny("LEDGER_DUPLICATE_EVENT","Duplicate immutable launch history",503);
  if(receipt.length&&!intent.length)
    deny("LEDGER_ORPHAN_RECEIPT","Remote receipt without reserved intent",503);
  return {history,intent:intent[0]||null,receipt:receipt[0]||null};
}
function validateAuthority(s,h,o,j,b,env){
  if(!j||j.job_id!==b.job_id||j.output_id!==b.output_id||
     j.session_id!==s?.id||j.attempt_id!==s?.current_attempt_id||
     j.plan_hash!==s?.active_job?.plan_hash||
     j.job_id!==s?.active_job?.id||
     j.state!=="claimed"||j.lease_owner!==b.lease_owner||
     j.lease_fence!==b.lease_fence||
     !rec.test(txt(j.record_id))||
     !rec.test(txt(s?.profile_id))||
     !txt(s?.platform||(s?.profile_id==="recT2rbKX3MF7cVFU"&&
       s?.output_type==="Instagram Reel"?"Instagram":null))||
     !txt(s?.output_type)||
     s?.state!=="queued"||s?.output_id!==b.output_id||
     s?.review_hold?.active!==true||
     h?.verified!==true||h.active!==true||
     h.output_id!==b.output_id||h.owner!==s.id||
     h.id!==s.review_hold.id||
     o?.id!==b.output_id||o.profile_id!==s.profile_id||
     o.platform!==(s.platform||(s.profile_id==="recT2rbKX3MF7cVFU"&&
       s.output_type==="Instagram Reel"?"Instagram":null))||
     o.output_type!==s.output_type||
     !protectedReviewRunnerScope(o,b.output_id,env)||
     o.do_not_publish!==true||o.review_hold_active!==true||
     o.publish_started_at||o.publish_locked_at||o.publish_locked_by||
     o.platform_media_id||o.platform_post_id||o.published_at||
     /^(publishing|published|dispatched)$/i.test(txt(o.publish_status)))
    deny("LAUNCH_AUTHORITY_STALE","Exact held profile-scoped job lease no longer valid");
}
function ensureMatching(event,job,b){
  if(!event||event.job_id!==job.job_id||
     event.attempt_id!==job.attempt_id||
     event.plan_hash!==job.plan_hash||
     event.lease_owner!==job.lease_owner||
     event.lease_fence!==job.lease_fence||
     event.payload_hash!==b.payload_hash)
    deny("LAUNCH_INTENT_CONFLICT","Existing launch intent differs from this lease");
}
function trustedStatusUrl(env,remotionId,url){
  const base=txt(env?.RENDERING_REVIEW_REMOTION_BASE_URL);
  if(!base||!url)return false;
  try{
    const a=new URL(url),b=new URL(base);
    return a.protocol==="https:" && b.protocol==="https:" &&
      a.origin===b.origin && b.pathname.replace(/\/$/,"")==="" &&
      !a.username&&!a.password&&!a.search&&!a.hash &&
      a.pathname==="/status/"+remotionId;
  }catch{return false;}
}
async function readVerified(ops,b,env){
  const [s,h,o,j]=await Promise.all([
    ops.readSession(b.output_id),ops.readHold(b.output_id),
    ops.readOutput(b.output_id),ops.readJob(b.job_id),
  ]);
  validateAuthority(s,h,o,j,b,env);
  return {s,h,o,j,...getEvents(j)};
}
function eventReceipt(ev){
  if(!ev)return {verified:false};
  return {verified:true,job_id:ev.job_id,lease_fence:ev.lease_fence,
    payload_hash:ev.payload_hash,...(ev.remotion_job_id?{
      remotion_job_id:ev.remotion_job_id,status_url:ev.status_url,
    }:{})};
}
/**
 * Runner-only JSON API. The caller supplies the exact lease already obtained
 * via claim-render-job; it cannot choose an output, plan, rights or publisher.
 */
export async function handleReviewLaunchLedger({request,env,operations}){
  if(!reviewLaunchLedgerEnabled(env))
    deny("LAUNCH_LEDGER_DISABLED","Review launch ledger disabled",405);
  if(request?.method!=="POST")deny("METHOD_NOT_ALLOWED","POST required",405);
  await auth(request,env);
  if(!/^application\/json(?:\s*;|$)/i.test(txt(request.headers?.get("Content-Type"))))
    deny("JSON_REQUIRED","JSON request required",415);
  const raw=await request.text();
  if(raw.length>1600)deny("LEDGER_BODY_TOO_LARGE","Launch ledger body too large",413);
  let b;
  try{b=JSON.parse(raw)}catch{deny("BAD_JSON","Invalid launch ledger JSON",400);}
  const actions=["read_authority","reserve_intent","read_intent",
    "persist_receipt","read_receipt"];
  const common=["action","output_id","job_id","lease_owner","lease_fence"];
  const extra={
    read_authority:[],reserve_intent:["payload_hash"],read_intent:[],
    persist_receipt:["payload_hash","remotion_job_id","status_url"],
    read_receipt:[],
  };
  if(!b||typeof b!=="object"||Array.isArray(b)||
     !actions.includes(b.action)||
     Object.keys(b).length!==common.length+extra[b.action].length||
     Object.keys(b).some(k=>![...common,...extra[b.action]].includes(k))||
     !rec.test(txt(b.output_id))||!token.test(txt(b.job_id))||
     !token.test(txt(b.lease_owner))||
     !Number.isSafeInteger(b.lease_fence)||b.lease_fence<1||
     (b.payload_hash!==undefined&&!digestPattern.test(txt(b.payload_hash)))||
     (b.remotion_job_id!==undefined&&!token.test(txt(b.remotion_job_id)))||
     (b.status_url!==undefined&&
       (typeof b.status_url!=="string"||b.status_url.length>300)))
    deny("INVALID_LEDGER_REQUEST","Exact job, lease and action required",400);
  for(const name of ["withOutputLock","readSession","readHold",
    "readOutput","readJob","patchJob"]){
    if(typeof operations?.[name]!=="function")
      deny("LEDGER_ADAPTER_MISSING","Trusted "+name+" unavailable",503);
  }
  return operations.withOutputLock(b.output_id,async()=>{
    const a=await readVerified(operations,b,env);
    if(b.action==="read_authority"){
      return {verified:true,hold_active:true,hold_owner_verified:true,
        output_id:b.output_id,session_id:a.s.id,
        current_attempt_id:a.j.attempt_id,active_job_id:b.job_id,
        active_plan_hash:a.j.plan_hash,job_state:a.j.state,
        lease_fence:b.lease_fence,lease_owner:b.lease_owner,
        published:false,dispatch_started:false,
        unrelated_hold_released:false};
    }
    if(b.action==="read_intent")return eventReceipt(a.intent);
    if(b.action==="read_receipt")return eventReceipt(a.receipt);
    if(b.action==="reserve_intent"){
      if(a.intent){
        ensureMatching(a.intent,a.j,b);
        return {created:false,verified:true};
      }
      if(a.receipt)deny("LEDGER_ORPHAN_RECEIPT","Missing intent",503);
      const event={kind:"review_remotion_launch_intent",
        job_id:b.job_id,attempt_id:a.j.attempt_id,
        plan_hash:a.j.plan_hash,lease_owner:b.lease_owner,
        lease_fence:b.lease_fence,payload_hash:b.payload_hash};
      await operations.patchJob(a.j.record_id,{
        Event_History_JSON:JSON.stringify([...a.history,event]),
        Progress_Stage:"launch_intent_reserved",
      });
      const after=await readVerified(operations,b,env);
      ensureMatching(after.intent,after.j,b);
      if(after.receipt)
        deny("LAUNCH_INTENT_READBACK_FAILED","Unexpected remote receipt",503);
      return {created:true,verified:true};
    }
    // Only a valid exact Remotion /status/ID URL from a protected origin can
    // become a durable receipt. No API response marks a render as ready.
    if(!a.intent||!trustedStatusUrl(env,b.remotion_job_id,b.status_url))
      deny("REMOTION_RECEIPT_UNTRUSTED","Reserved intent and trusted URL required");
    ensureMatching(a.intent,a.j,b);
    if(a.receipt){
      if(a.receipt.remotion_job_id!==b.remotion_job_id||
         a.receipt.status_url!==b.status_url)
        deny("REMOTION_RECEIPT_CONFLICT","A different remote render already recorded");
      return eventReceipt(a.receipt);
    }
    const event={kind:"review_remotion_launch_receipt",
      job_id:b.job_id,attempt_id:a.j.attempt_id,
      plan_hash:a.j.plan_hash,lease_owner:b.lease_owner,
      lease_fence:b.lease_fence,payload_hash:b.payload_hash,
      remotion_job_id:b.remotion_job_id,status_url:b.status_url};
    await operations.patchJob(a.j.record_id,{
      Event_History_JSON:JSON.stringify([...a.history,event]),
      Progress_Stage:"remotion_receipt_persisted",
    });
    const after=await readVerified(operations,b,env);
    if(!after.receipt||after.receipt.remotion_job_id!==b.remotion_job_id||
       after.receipt.status_url!==b.status_url)
      deny("REMOTION_RECEIPT_READBACK_FAILED","Remote receipt not durable",503);
    ensureMatching(after.receipt,after.j,b);
    return eventReceipt(after.receipt);
  });
}
