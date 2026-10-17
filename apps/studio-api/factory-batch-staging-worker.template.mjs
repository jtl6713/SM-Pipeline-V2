/**
 * Isolated, non-publishing HTTP Worker for Factory Batch V2 acceptance.
 * Build with generate-factory-batch-staging-worker.mjs. Do not deploy this
 * template directly. This module cannot load any production transport code.
 */
import {
  factoryBatchDrain, factoryBatchEnqueue, factoryBatchRetry,
  factoryBatchRead, factoryBatchList, factoryBatchSummary,
  factoryBatchQualitySignals, factoryBatchKey, factoryBatchLockKey,
} from "./factory-approval-queue.mjs";
import { withOutputApprovalLock, OUTPUT_APPROVAL_LOCK_PREFIX } from "./output-approval-lease.mjs";
import {
  maeNormalizeTimeZone, maeScheduleNextSlot, maeScheduleLaneKey,
  maeScheduleConflicts, maeIsBlackoutLocalTime, maeIsPriorityLocalTime,
  maeAdvancePastBlackout, maePickBalancedSuggestedIso,
  maeNextOpenScheduleIso, MAE_SUGGEST_HORIZON_DAYS,
  MAE_PRIORITY_SCHEDULE_WINDOWS, MAE_SCHEDULE_GAP_MS,
} from "./mae-schedule.mjs";

const BASE = "appJ0ox62OMfZuE1v";
const PROFILE = "rect1wQB9BeUSEimn";
const CONTENTS = "tblszaHkgn51wajDV";
const OUTPUTS = "tbl5sA6Mwiz9pGNOi";
const PROFILES = "tbllz6Y0mvMTgPYup";
const ZONE = "America/Los_Angeles";
class HttpError extends Error {
  constructor(status,message) {super(message);this.status=status;}
}
const f = (row,name) => row?.fields?.[name];
const studioFirstLinkedId = value => Array.isArray(value) ? value[0] : null;
const studioIsFinishedPassthrough = () => false;
const studioFinishedOriginKind = () => "";
const studioOutputIsNativePhoto = () => false;
const item4PulseLetterPython = async () => {throw Error("Staging native-photo transport prohibited");};
const item4ProductionProfileRecord = async () => ({id:PROFILE,fields:{Timezone:ZONE}});
const studioScheduleHorizonDays = async () => MAE_SUGGEST_HORIZON_DAYS;
const studioOccupiedSchedulesOrEmpty = async () => [];
const studioOccupiedForLane = () => [];
const studioScheduleTimeZoneForRecord = async () => ZONE;
const studioResolveStoryPublishIso = async () => {throw new HttpError(409,"Staging Story handoff prohibited");};
const studioInvalidateOccupiedScheduleCache = () => {};
const studioNextOpenScheduleIso = maeNextOpenScheduleIso;
const STUDIO_SCHEDULE_GAP_MS = MAE_SCHEDULE_GAP_MS;
const studioTikTokArmedDraftStatus = () => "Waiting for Schedule";
const studioPublishHandoffFields = () => ({});
const studioEnsureNativePublishSlides = async (_env,record) => record;
const studioSupabaseWriteThroughOutput = async () => ({intercepted:true});
const studioPublishCanDispatchNow = () => false;
const studioDispatchApprovedPublishAndSchedule = async () => ({intercepted:true,external_calls:0});

function assertIsolation(env) {
  if (env?.AIRTABLE_BASE_ID !== BASE ||
      env?.AIRTABLE_CONTENT_TABLE_ID !== CONTENTS ||
      env?.AIRTABLE_OUTPUT_TABLE_ID !== OUTPUTS)
    throw new HttpError(503,"Staging Airtable binding mismatch");
  if (!env?.AIRTABLE_PAT || !env?.STAGING_TEST_AUTH ||
      String(env.STAGING_TEST_AUTH).length < 24 ||
      !env?.STUDIO_MEDIA?.get || !env?.STUDIO_MEDIA?.put || !env?.STUDIO_MEDIA?.list)
    throw new HttpError(503,"Staging secrets or isolated R2 missing");
}
function respond(_req,_env,obj) {
  return new Response(JSON.stringify(obj),{status:200,headers:{
    "content-type":"application/json","cache-control":"no-store"}});
}
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function airtableFetch(env,table,id,options={}) {
  assertIsolation(env);
  if (![CONTENTS,OUTPUTS,PROFILES].includes(table) ||
      !/^rec[A-Za-z0-9]+$/.test(String(id||"")))
    throw new HttpError(400,"Unexpected staging Airtable table or record");
  const method = options?.method || "GET";
  if (method !== "GET" && !(method === "PATCH" && table === OUTPUTS))
    throw new HttpError(405,"Stage Airtable operation denied");
  const body = options?.body || null;
  const endpoint = "https://api.airtable.com/v0/" + BASE + "/" + table + "/" + id;
  for (let attempt=0;attempt<7;attempt++) {
    const res=await fetch(endpoint,{method,headers:{
      "Authorization":"Bearer "+env.AIRTABLE_PAT,
      ...(body?{"Content-Type":"application/json"}:{})
    },...(body?{body}:{})});
    if (res.status===429 || res.status>=500) {
      if (attempt===6) throw new HttpError(503,"Stage Airtable temporarily unavailable");
      await sleep(Math.min(4000,300*2**attempt));continue;
    }
    const result=await res.json().catch(()=>({}));
    if (!res.ok) throw new HttpError(res.status,
      "Stage Airtable "+method+" HTTP "+res.status+" "+String(result?.error?.type||""));
    return result;
  }
  throw new HttpError(503,"Staging Airtable retries exhausted");
}
async function resolveWorkingContentProfile(_env,_authorization,profileId) {
  if (String(profileId)!==PROFILE) throw new HttpError(403,"Only staging profile is allowed");
  return {id:PROFILE,fields:{Timezone:ZONE}};
}
function requestedProfileId(url,body) {
  return body?.profile_id || body?.content_profile_id
      || url?.searchParams?.get("profile_id") || url?.searchParams?.get("profile");
}

/*__STAGING_CANONICAL_FACTORY_HANDLERS__*/

async function cleanup(request,env) {
  if (String(env.FACTORY_BATCH_APPROVALS_ENABLED).toLowerCase()!=="false")
    throw new HttpError(409,"Disable staging approval before cleanup");
  const body=await request.json().catch(()=>({}));
  const rid=String(body?.request_id||"");
  if (!/^factory_stage_http_[A-Za-z0-9_-]{12,90}$/.test(rid))
    throw new HttpError(400,"Unrecognized staging test request ID");
  const job=await factoryBatchRead(env.STUDIO_MEDIA,PROFILE,rid);
  if (!job) return {ok:true,deleted:0};
  if (!["completed","failed"].includes(job.status))
    throw new HttpError(409,"Cannot remove active staging batch");
  const keys=[factoryBatchKey(PROFILE,rid),factoryBatchLockKey(PROFILE),
    ...job.items.map(item=>OUTPUT_APPROVAL_LOCK_PREFIX+"/"+item.id+".json")];
  for (const key of keys) await env.STUDIO_MEDIA.delete(key);
  return {ok:true,deleted:keys.length};
}
export default {
  async fetch(request,env,ctx) {
    try {
      assertIsolation(env);
      const url=new URL(request.url);
      if (request.headers.get("Authorization")!=="Bearer "+env.STAGING_TEST_AUTH)
        throw new HttpError(401,"Staging test authorization required");
      if (request.method==="GET" && url.pathname==="/__staging/health")
        return respond(request,env,{ok:true,staging:true,
          approvals_enabled:String(env.FACTORY_BATCH_APPROVALS_ENABLED).toLowerCase()==="true",
          airtable_base:BASE,transport:"intercepted"});
      if (url.pathname==="/api/factory/approval-batches") {
        if (request.method==="GET") return factoryBatchStatusRoute(request,env,null);
        if (request.method==="POST") return factoryBatchSubmitRoute(request,env,null,ctx);
      }
      if (url.pathname==="/__staging/cleanup" && request.method==="POST")
        return respond(request,env,await cleanup(request,env));
      return new Response("Not found",{status:404});
    } catch(error) {
      const status=Number(error?.status);
      const code=status>=400 && status<600 ? status : 500;
      if(code===500) console.error("Factory staging Worker",String(error?.message||"unknown"));
      return new Response(JSON.stringify({ok:false,error:String(error?.message||"Error")}),{
        status:code,headers:{"content-type":"application/json","cache-control":"no-store"}});
    }
  },
  async scheduled(_event,env,ctx) {
    if(String(env?.FACTORY_BATCH_APPROVALS_ENABLED).toLowerCase()!=="true") return;
    assertIsolation(env);
    const jobs=await factoryBatchList(env.STUDIO_MEDIA,PROFILE,{limit:40});
    for (const job of jobs.filter(j=>["queued","running"].includes(j.status)))
      await factoryBatchProcess(env,PROFILE,job.request_id,ctx);
  },
};
