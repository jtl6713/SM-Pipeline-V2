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
} from "./factory-approval-queue.mjs";

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
      records:child.records, note:parent.notes,
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
  for (const child of parent.children) {
    const job=await factoryBatchRead(bucket,child.profile_id,child.request_id);
    const counts=job ? factoryBatchCounts(job) : {
      total:child.records.length,approved_count:0,skipped_count:0,
      failed_count:0,pending_count:child.records.length,
    };
    for (const key of Object.keys(totals)) totals[key]+=counts[key];
    children.push({
      profile_id:child.profile_id,request_id:child.request_id,
      status:job?.status||"missing",...counts,
    });
  }
  const allEnqueued=children.every(x=>x.status!=="missing");
  const status=parent.status==="enqueuing"||!allEnqueued?"enqueuing"
    : totals.pending_count?"running"
    : totals.failed_count && totals.failed_count===totals.total?"failed":"completed";
  return {
    ok:true, group:true, group_id:parent.id, request_id:parent.request_id,
    created_at:parent.created_at,updated_at:parent.updated_at,
    status,...totals,done_count:totals.total-totals.pending_count,
    can_retry:!totals.pending_count && totals.failed_count>0,
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
