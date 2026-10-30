/**
 * Dormant Phase 3B foundation for global Factory submissions.
 *
 * Parent ledger is durable BEFORE any profile-scoped child is enqueued. A
 * repeated submit or cron recovery uses the parent snapshot; nothing depends
 * on browser state. The production HTTP approval route is NOT wired here:
 * callers must resolve and validate authoritative profile ownership, duplicate
 * status, media, and rollout eligibility for EVERY output before calling start.
 */
import {
  factoryBatchEnqueue, factoryBatchRead, factoryBatchCounts, factoryBatchRetry,
  factoryBatchQualitySignals, factoryBatchNeedsAttention, factoryBatchRetryEligible,
} from "./factory-approval-queue.mjs";
import { factoryApprovalItemTiming, factoryApprovalTimingReport } from "./factory-approval-timings.mjs";

export const FACTORY_GROUP_PREFIX = "studio/state/factory-approvals/v2/groups";
export const FACTORY_GROUP_SCHEMA = "studio.factory-approval-group.1";
const ID = /^rec[A-Za-z0-9]+$/;
const RID = /^[A-Za-z0-9_-]{12,128}$/;

function assertBucket(bucket) {
  if (!bucket?.put || !bucket?.get) throw Error("Durable R2 group storage required");
}
function groupKey(requestId) {
  if (!RID.test(String(requestId || ""))) throw Error("Invalid group request identity");
  return FACTORY_GROUP_PREFIX + "/" + requestId + ".json";
}
async function load(bucket, key) {
  const found = await bucket.get(key);
  return found ? { value: JSON.parse(await found.text()), etag: found.etag } : null;
}
async function absent(bucket, key, obj) {
  return bucket.put(key, JSON.stringify(obj), {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json" },
  });
}
async function matched(bucket, key, obj, etag) {
  return bucket.put(key, JSON.stringify(obj), {
    onlyIf: { etagMatches: etag },
    httpMetadata: { contentType: "application/json" },
  });
}
async function mutate(bucket, key, callback) {
  for (let i=0;i<8;i++) {
    const old=await load(bucket,key);
    if (!old) throw Error("Approval group record disappeared");
    const next=callback(old.value);
    if (!next) return old.value;
    if (await matched(bucket,key,next,old.etag)) return next;
  }
  throw Error("Concurrent approval group update; reread and retry");
}
function clean(row) {
  const id=String(row?.id||"").trim();
  const profile_id=String(row?.profile_id||"").trim();
  if (!ID.test(id)||!ID.test(profile_id)) throw Error("Unverified output/profile identity");
  return {
    id, profile_id,
    output_id: row.output_id ?? null,
    platform: String(row.platform||"").slice(0,50),
    format: String(row.format||"").slice(0,60),
    title: String(row.title||"").slice(0,180),
    content_id: ID.test(String(row.content_id||"")) ? row.content_id : null,
  };
}
/** Deduplicate canonical output IDs, not content IDs. Require resolved ownership. */
export function factoryApprovalGroupPlan({
  requestId, records, maxTotal=20, maxPerProfile=10,
} = {}) {
  groupKey(requestId);
  if (!Array.isArray(records)||!records.length) throw Error("Select at least one output");
  if (!Number.isSafeInteger(maxTotal)||maxTotal<1||maxTotal>100 ||
      !Number.isSafeInteger(maxPerProfile)||maxPerProfile<1||maxPerProfile>100) {
    throw Error("Invalid group size policy");
  }
  const seen=new Map();
  for (const raw of records) {
    const row=clean(raw);
    const prior=seen.get(row.id);
    if (prior&&prior.profile_id!==row.profile_id) {
      throw Error("Conflicting authoritative profile ownership for " + row.id);
    }
    if (!prior) seen.set(row.id,row);
  }
  if (seen.size>maxTotal) throw Error("Global batch size exceeds authorized maximum");
  const ordered=[...seen.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const byProfile=new Map();
  for (const row of ordered) {
    const list=byProfile.get(row.profile_id)||[];
    list.push(row);
    if (list.length>maxPerProfile) {
      throw Error("Profile child batch size exceeds authorized maximum");
    }
    byProfile.set(row.profile_id,list);
  }
  const children=[...byProfile].sort(([a],[b])=>a.localeCompare(b))
    .map(([profile_id,items])=>({profile_id,items}));
  return { request_id:requestId, records:ordered, children };
}
async function childRequestId(requestId, profileId) {
  // Collision-resistant, deterministic, bounded length independent of external
  // request ID length. Works in Cloudflare Workers and Node Web Crypto.
  const bytes=new TextEncoder().encode("factory-group-child-v1:"+requestId+":"+profileId);
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return "fgc_"+[...digest].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function factoryApprovalGroupBuild(options) {
  const plan=factoryApprovalGroupPlan(options);
  const children=await Promise.all(plan.children.map(async ({profile_id,items})=>({
    profile_id, request_id: await childRequestId(plan.request_id,profile_id),
    records:items,
  })));
  const now=new Date().toISOString();
  return {
    schema:FACTORY_GROUP_SCHEMA, id:"fg_"+plan.request_id,
    request_id:plan.request_id, status:"enqueuing",
    created_at:now, updated_at:now,
    notes:String(options.note||"").slice(0,3000),
    records:plan.records, children,
  };
}
function identical(parent, proposed) {
  return JSON.stringify(parent.records?.map(x=>[x.id,x.profile_id])) ===
    JSON.stringify(proposed.records.map(x=>[x.id,x.profile_id]));
}
export async function factoryApprovalGroupRead(bucket,requestId) {
  assertBucket(bucket);
  return (await load(bucket,groupKey(requestId)))?.value||null;
}
/** Recover idempotently after a mid-group crash without the browser payload. */
export async function factoryApprovalGroupResume(bucket, requestId) {
  assertBucket(bucket);
  const key=groupKey(requestId);
  const parent=await factoryApprovalGroupRead(bucket,requestId);
  if (!parent||parent.schema!==FACTORY_GROUP_SCHEMA) throw Error("Missing approval group");
  for (const child of parent.children) {
    await factoryBatchEnqueue(bucket,{
      profileId:child.profile_id, requestId:child.request_id,
      groupRequestId:parent.request_id, records:child.records, note:parent.notes,
    });
  }
  await mutate(bucket,key,old => old.status === "enqueuing"
    ? {...old,status:"queued",updated_at:new Date().toISOString()} : null);
  return factoryApprovalGroupStatus(bucket,requestId);
}
export async function factoryApprovalGroupEnqueue(bucket,options) {
  assertBucket(bucket);
  const planned=await factoryApprovalGroupBuild(options);
  const key=groupKey(planned.request_id);
  const written=await absent(bucket,key,planned);
  if (!written) {
    const prior=await factoryApprovalGroupRead(bucket,planned.request_id);
    if (!prior||prior.schema!==FACTORY_GROUP_SCHEMA) throw Error("Group ledger still committing");
    if (!identical(prior,planned)) throw Error("Group request ID already bound to different outputs");
  }
  const status=await factoryApprovalGroupResume(bucket,planned.request_id);
  return {...status,already_submitted:!written};
}
export async function factoryApprovalGroupStatus(bucket,requestId) {
  assertBucket(bucket);
  const parent=await factoryApprovalGroupRead(bucket,requestId);
  if (!parent||parent.schema!==FACTORY_GROUP_SCHEMA) return null;
  const totals={
    total:0, approved_count:0, skipped_count:0,
    failed_count:0, pending_count:0,
  };
  const children=[];
  const items=[];
  const observedTimings=[];
  const qualitySignals=[];
  for (const child of parent.children) {
    const job=await factoryBatchRead(bucket,child.profile_id,child.request_id);
    const counts=job ? factoryBatchCounts(job) : {
      total:child.records.length,approved_count:0,skipped_count:0,
      failed_count:0,pending_count:child.records.length,
    };
    for (const key of Object.keys(totals)) totals[key]+=counts[key];
    if (job) observedTimings.push(...(job.items || []));
    if (job) qualitySignals.push(...factoryBatchQualitySignals(job).map(signal=>({
      ...signal,profile_id:child.profile_id,job_id:job.id,
      output_ids:job.items.map(item=>item.output_id).filter(Boolean),
    })));
    children.push({
      profile_id:child.profile_id,request_id:child.request_id,
      status:job?.status||"missing",...counts,
    });
    for (const entry of child.records) {
      const item = job?.items?.find(row => row.id === entry.id);
      items.push({ id:entry.id, output_id:entry.output_id,
        profile_id:child.profile_id, platform:entry.platform, format:entry.format,
        title:entry.title, content_id:entry.content_id,
        status:item?.status||"pending", error:item?.error||null,
        exception_recovery: item?.exception_recovery || null,
        manual_retry_count: Number(item?.manual_retry_count || 0),
        auto_retry_count: Number(item?.auto_retry_count || 0),
        failure_history: item?.failure_history || [],
        removed_original_error: item?.removed_original_error || null,
        previous_failure_error: item?.previous_failure_error || null,
        timing: item ? factoryApprovalItemTiming(item) : null });
    }
  }
  const allEnqueued=children.every(x=>x.status!=="missing");
  const status=parent.status==="enqueuing"||!allEnqueued?"enqueuing"
    : totals.pending_count?"running"
    : totals.failed_count && totals.failed_count===totals.total?"failed":"completed";
  return {
    ok:true, batch:true, group:true, group_id:parent.id, job_id:parent.id,
    request_id:parent.request_id, profile_id:null,
    profile_ids:parent.children.map(x=>x.profile_id), items,
    quality_signals:qualitySignals,
    created_at:parent.created_at,updated_at:parent.updated_at,
    status,...totals,done_count:totals.total-totals.pending_count,
    timing_report:factoryApprovalTimingReport(observedTimings),
    can_retry:!totals.pending_count && items.some(factoryBatchRetryEligible),
    children,
  };
}
/** Reset only terminal failed output entries within their own child ledger. */
export async function factoryApprovalGroupRetryFailures(bucket,requestId) {
  const status=await factoryApprovalGroupStatus(bucket,requestId);
  if (!status) throw Error("Group not found");
  if (!status.can_retry) throw Error("No terminal failed group items eligible for retry");
  for (const child of status.children) {
    if (child.failed_count&&!child.pending_count) {
      await factoryBatchRetry(bucket,child.profile_id,child.request_id);
    }
  }
  return factoryApprovalGroupStatus(bucket,requestId);
}

/** Bounded global parent activity; child jobs are separately stored. */
export async function factoryApprovalGroupList(bucket, {
  profileId = "", limit = 40, maxScan = 2000, mode = "all", offset = 0,
} = {}) {
  assertBucket(bucket);
  if (profileId && !ID.test(profileId)) throw Error("Invalid Factory profile filter");
  if (!["all", "active", "completed"].includes(mode)) throw Error("Invalid Factory activity mode");
  const take = Math.max(1, Math.min(500, Math.floor(Number(limit) || 40)));
  const skip = Math.max(0, Math.min(1000, Math.floor(Number(offset) || 0)));
  const objects = [];
  let cursor = null;
  const budget = Math.max(1, Math.min(3000, Math.floor(maxScan)));
  let complete = true;
  do {
    const count = Math.min(1000, budget - objects.length);
    if (count <= 0) { complete = false; break; }
    const page = await bucket.list({prefix: FACTORY_GROUP_PREFIX + "/", limit: count,
      ...(cursor ? {cursor} : {})});
    objects.push(...(page.objects || []));
    if (!page.truncated) { cursor = null; break; }
    if (!page.cursor || page.cursor === cursor) throw Error("Factory group history cursor stalled");
    cursor = page.cursor;
  } while (cursor);
  if (cursor) complete = false;
  objects.sort((a,b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0));
  const groups = [];
  for (const object of objects) {
    if (groups.length >= skip + take + 1) break;
    const match = String(object.key).match(/\/groups\/([A-Za-z0-9_-]{12,128})[.]json$/);
    if (!match) continue;
    const status = await factoryApprovalGroupStatus(bucket, match[1]);
    if (!status || (profileId && !status.profile_ids.includes(profileId))) continue;
    if (mode === "active" && !factoryBatchNeedsAttention(status)) continue;
    if (mode === "completed" && factoryBatchNeedsAttention(status)) continue;
    groups.push(status);
  }
  return { groups: groups.slice(skip, skip + take),
    has_more: groups.length > skip + take,
    complete: complete && objects.length <= take && mode === "all",
    scanned: objects.length };
}

/** Cursor-backed cron discovery prevents lexicographic parent starvation. */
export const FACTORY_GROUP_CRON_CURSOR_KEY="studio/state/factory-approvals/v2/cron/groups-v1.json";
export async function factoryApprovalGroupCronScan(bucket,{maxScan=50}={}) {
  assertBucket(bucket);
  const checkpoint=await load(bucket,FACTORY_GROUP_CRON_CURSOR_KEY);
  let cursor=checkpoint?.value?.cursor||undefined;
  const objects=[];
  let remaining=Math.max(1,Math.min(500,Math.floor(maxScan)));
  while (remaining>0) {
    const page=await bucket.list({prefix:FACTORY_GROUP_PREFIX+"/",limit:Math.min(remaining,100),
      ...(cursor?{cursor}:{})});
    const found=page.objects||[];
    objects.push(...found);remaining-=found.length;
    if (!page.truncated) {cursor=undefined;break;}
    if (!page.cursor||page.cursor===cursor) throw Error("Factory group scan cursor stalled");
    cursor=page.cursor;
  }
  const next={cursor:cursor||null,updated_at:new Date().toISOString()};
  if (checkpoint) await mutate(bucket,FACTORY_GROUP_CRON_CURSOR_KEY,()=>next);
  else await absent(bucket,FACTORY_GROUP_CRON_CURSOR_KEY,next);
  return objects.map(row=>String(row.key).match(new RegExp("/groups/([A-Za-z0-9_-]{12,128})[.]json$"))?.[1]).filter(Boolean);
}
