/**
 * One-time, read-only production benchmark. No Airtable access, no R2 write,
 * no publishing operation and no Studio authentication substitution.
 *
 * 2026-10-18 Chicago Factory 77 approvals, reported 18:31–19:01 CDT
 * (2026-10-18T23:31Z–2026-10-19T00:01Z).
 */
import { factoryApprovalItemTiming, factoryApprovalTimingReport } from "./factory-approval-timings.mjs";

const PROFILE_ID = "recT2rbKX3MF7cVFU";
const PREFIX = `studio/state/factory-approvals/v2/jobs/${PROFILE_ID}/`;
const START = Date.parse("2026-10-18T23:20:00.000Z");
const END = Date.parse("2026-10-19T00:10:00.000Z");
const TOKEN = "__CHICAGO_READ_TOKEN__";
const STAGES = [
  "queue_wait", "preflight_airtable_fetch", "profile_ownership_check",
  "approval_lease_wait", "schedule_slot_selection", "airtable_schedule_commit",
  "schedule_verification", "supabase_sync", "canonical_approval",
  "worker_processing", "waiting_and_retry", "enqueue_to_terminal",
];

export async function readChicagoTimingReport(bucket) {
  if (!bucket?.list || !bucket?.get) throw new Error("Read-only STUDIO_MEDIA R2 binding is unavailable");
  const objects = [];
  let cursor = null, pages = 0, completedScan = false;
  do {
    const page = await bucket.list({
      prefix: PREFIX, limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    objects.push(...(page.objects || []));
    pages++;
    if (!page.truncated) { completedScan = true; break; }
    if (!page.cursor || page.cursor === cursor) throw new Error("R2 batch cursor did not advance");
    cursor = page.cursor;
  } while (pages < 8);
  // Never claim exhaustive coverage for a capped profile scan.
  if (!completedScan) throw new Error("R2 profile history exceeded bounded scan");
  const recent = objects
    .filter(x => {
      const uploaded = Date.parse(String(x.uploaded || ""));
      return Number.isFinite(uploaded) && uploaded >= START && uploaded <= END + 900000;
    })
    .sort((a,b) => Date.parse(a.uploaded) - Date.parse(b.uploaded));
  if (recent.length > 200) throw new Error("Unexpectedly many Factory batch objects in time window");
  const fetched = await Promise.all(recent.map(async meta => {
    const obj = await bucket.get(meta.key);
    if (!obj) return null;
    const job = await obj.json();
    return job?.schema === "studio.factory-batch.2" && job.profile_id === PROFILE_ID ? job : null;
  }));
  const jobs = fetched.filter(job => {
    const created = Date.parse(job?.created_at || "");
    return Number.isFinite(created) && created >= START && created <= END;
  }).sort((a,b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const selected = jobs.filter(job => Array.isArray(job.items) && job.items.length > 0);
  const items = selected.flatMap(job => (job.items || []).map(item => ({...item, batch_request_id:job.request_id})));
  const combined = factoryApprovalTimingReport(items);
  const measurements = items.map(item => {
    const t = factoryApprovalItemTiming(item);
    return {
      output_id: item.output_id,
      batch_request_id: item.batch_request_id,
      state: item.status,
      attempts: t?.attempts_observed ?? 0,
      complete: t?.complete ?? false,
      durations_ms: t?.durations_ms || {},
      queued_at: t?.events.find(x=>x.state==="queued")?.at || null,
      terminal_at: t?.events.findLast(x=>["approved","already_satisfied","failed"].includes(x.state))?.at || null,
    };
  });
  const stages = {};
  for (const key of STAGES) {
    const values = measurements.map(x=>x.durations_ms[key]).filter(x=>Number.isFinite(x)&&x>=0);
    const metrics = combined.metrics[key]||null;
    stages[key] = metrics ? {...metrics, observed_sum_ms:values.reduce((a,b)=>a+b,0)} : {
      count:0, observed_sum_ms:null, mean_ms:null, p50_ms:null, p95_ms:null, max_ms:null,
    };
  }
  const firstProcessed = measurements.map(x=>Date.parse(x.queued_at||"")).filter(Number.isFinite);
  const lastTerminal = measurements.map(x=>Date.parse(x.terminal_at||"")).filter(Number.isFinite);
  const batchData = selected.map(job => ({
    request_id:job.request_id,
    job_id:job.id,
    group_request_id:job.group_request_id||null,
    created_at:job.created_at,
    updated_at:job.updated_at,
    status:job.status,
    total:job.items.length,
    statuses:job.items.reduce((acc,item)=>{acc[item.status]=(acc[item.status]||0)+1;return acc;},{}),
    timing_report:factoryApprovalTimingReport(job.items),
  }));
  const byStage = stage => measurements.filter(row => Number.isFinite(row.durations_ms[stage]))
    .sort((a,b)=>b.durations_ms[stage]-a.durations_ms[stage])
    .slice(0,8).map(row => ({output_id:row.output_id,batch_request_id:row.batch_request_id,duration_ms:row.durations_ms[stage]}));
  return {
    schema:"studio.factory-chicago-77-timing-readonly.1",
    read_only:true, profile_id:PROFILE_ID,
    requested_window:{start:"2026-10-18T23:31:00.000Z",end:"2026-10-19T00:01:00.000Z",timezone:"America/Chicago"},
    batch_search:{scanned_objects:objects.length,matching_uploads:recent.length,matching_jobs:selected.length,complete:completedScan},
    selected_batch_count:selected.length, selected_item_count:items.length,
    exactly_eight_batches_77_outputs:selected.length===8&&items.length===77,
    status_counts:items.reduce((acc,item)=>{acc[item.status]=(acc[item.status]||0)+1;return acc;},{}),
    earliest_queued: firstProcessed.length?new Date(Math.min(...firstProcessed)).toISOString():null,
    last_terminal: lastTerminal.length?new Date(Math.max(...lastTerminal)).toISOString():null,
    stages, combined_timing_report:combined, batches:batchData,
    most_delayed:{
      queue:byStage("queue_wait"), worker:byStage("worker_processing"),
      airtable_preflight:byStage("preflight_airtable_fetch"),
      approval_lease:byStage("approval_lease_wait"),
      mae_selection:byStage("schedule_slot_selection"),
      airtable_commit:byStage("airtable_schedule_commit"),
      supabase:byStage("supabase_sync"),
    },
    per_output:measurements,
  };
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method!=="GET" || url.pathname!=="/"+TOKEN+"/report")
      return new Response("Not found",{status:404});
    try {
      const report=await readChicagoTimingReport(env.STUDIO_MEDIA);
      return new Response(JSON.stringify(report),{
        headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
      });
    } catch(error) {
      console.warn("Chicago read-only Factory timing audit failed",String(error?.name||"unknown"));
      return new Response(JSON.stringify({ok:false,error:"read_only_timing_unavailable"}),{
        status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
      });
    }
  }
};
