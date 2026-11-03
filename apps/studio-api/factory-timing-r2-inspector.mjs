/**
 * Ephemeral, read-only R2 Factory approval timing inspector. Run only through
 * the existing GitHub Actions / Cloudflare authenticated automation pattern.
 * It does not import any Airtable, publishing, scheduling, or write code.
 */
import { factoryBatchList } from "./factory-approval-queue.mjs";
import { factoryApprovalTimingReport } from "./factory-approval-timings.mjs";
import { factoryApprovalGroupList } from "./factory-approval-groups.mjs";

const NYC_PROFILE_ID = "recgtK8Z7eNADNtVy";
const FROM = "2026-10-18T20:00:00.000Z";
const UNTIL = "2026-10-18T23:59:59.999Z";

export async function readFactoryTimingReport(bucket) {
  if (!bucket?.list || !bucket?.get) throw Error("Read-only Factory R2 bucket is unavailable");
  const jobs = await factoryBatchList(bucket, NYC_PROFILE_ID, { limit: 40, maxScan: 2500 });
  const eligible = jobs.filter(job =>
    job?.schema === "studio.factory-batch.2"
    && job.profile_id === NYC_PROFILE_ID
    && job.created_at >= FROM && job.created_at <= UNTIL
    && (job.items || []).length === 10
    && job.status === "completed"
  ).sort((a,b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const newest = eligible.slice(-10);
  const summaries = newest.map(job => {
    const rows = job.items || [];
    const report = factoryApprovalTimingReport(rows);
    const statusCounts = rows.reduce((acc,row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    const created = Date.parse(job.created_at);
    const updated = Date.parse(job.updated_at);
    return {
      job_id: job.id, request_id: job.request_id,
      created_at: job.created_at, updated_at: job.updated_at,
      total: rows.length, status: job.status, status_counts: statusCounts,
      batch_wall_ms: Number.isFinite(created) && Number.isFinite(updated)
        ? Math.max(0, updated - created) : null,
      timing_report: report,
    };
  });
  // Read parent ledgers as well: active global submissions are hidden from
  // the child-only "active" list. No R2 writes, Airtable access or approvals.
  const active = await factoryApprovalGroupList(bucket, {
    mode: "active", limit: 30, maxScan: 1000,
  });
  const activeGroups = active.groups.map(group => ({
    job_id: group.job_id,
    created_at: group.created_at,
    updated_at: group.updated_at,
    status: group.status,
    total: group.total,
    approved_count: group.approved_count,
    pending_count: group.pending_count,
    failed_count: group.failed_count,
    children: (group.children || []).map(child => ({
      profile_id: child.profile_id,
      request_id: child.request_id,
      status: child.status,
      total: child.total,
      approved_count: child.approved_count,
      pending_count: child.pending_count,
      failed_count: child.failed_count,
      updated_at: child.updated_at || null,
    })),
  }));
  return {
    active_group_scan: { scanned: active.scanned, has_more: active.has_more,
      complete: active.complete, read_at: new Date().toISOString() },
    active_group_totals: {
      batches: activeGroups.length,
      approved: activeGroups.reduce((n, g) => n + Number(g.approved_count || 0), 0),
      pending: activeGroups.reduce((n, g) => n + Number(g.pending_count || 0), 0),
      failed: activeGroups.reduce((n, g) => n + Number(g.failed_count || 0), 0),
    },
    active_groups: activeGroups,
    schema: "studio.factory-nyc-batch-timing-audit.1",
    read_only: true, profile: "NYC",
    jobs_scanned: jobs.length,
    eligible_ten_output_batches: eligible.length,
    shown_bundles: summaries.length,
    combined_timing_report: factoryApprovalTimingReport(newest.flatMap(job => job.items || [])),
    batches: summaries,
  };
}


/**
 * Production Factory claim health. Reads only bounded R2 registry/list/get
 * data; never seeds legacy registries, reserves an output, or enqueues a batch.
 * "No parent" is not automatically an orphan: legacy profile-local jobs own
 * claims too, so both exact keys must be checked before calling it unbacked.
 */
export const FACTORY_CLAIM_AUDIT_PROFILES = Object.freeze({
  Chicago: "recT2rbKX3MF7cVFU",
  NYC: "recgtK8Z7eNADNtVy",
  LA: "recF7UAn0LkMZZrWZ",
  Miami: "recpNlNn6U6eq0M9r",
});
const CLAIMS_PREFIX = "studio/state/factory-approvals/v2/output-claims-v1/";
const GROUPS_PREFIX = "studio/state/factory-approvals/v2/groups/";
const JOBS_PREFIX = "studio/state/factory-approvals/v2/jobs/";
const RECENT_CLAIMS_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export async function readFactoryClaimsDiagnostic(bucket, nowMs = Date.now()) {
  if (!bucket?.get || !bucket?.list) throw Error("Read-only Factory R2 bucket required");
  const groupList = await bucket.list({prefix: GROUPS_PREFIX, limit:1000});
  const profiles = [];
  for (const [name,id] of Object.entries(FACTORY_CLAIM_AUDIT_PROFILES)) {
    const [snapshot, jobsList] = await Promise.all([
      bucket.get(CLAIMS_PREFIX + id + ".json"),
      bucket.list({prefix: JOBS_PREFIX + id + "/",limit:1000}),
    ]);
    const summary = {
      name, profile_id:id, registry_present:!!snapshot,
      historical_jobs_first_page:(jobsList.objects||[]).length,
      historical_jobs_more:jobsList.truncated===true,
      total_claims:null,recent_claims:0,recent_owners:0,
      latest_claim_at:null, recent_unbacked_owners:[],
      registry_error:null,
    };
    if (!snapshot) { profiles.push(summary); continue; }
    let registry;
    try { registry = JSON.parse(await snapshot.text()); }
    catch { summary.registry_error = "invalid_json"; profiles.push(summary); continue; }
    if (registry?.schema !== "studio.factory-output-claims.1" ||
        registry.profile_id !== id || !registry.outputs ||
        typeof registry.outputs !== "object" || Array.isArray(registry.outputs)) {
      summary.registry_error = "invalid_schema"; profiles.push(summary); continue;
    }
    const all = Object.entries(registry.outputs);
    summary.total_claims = all.length;
    const recent = all.filter(([,claim]) => {
      const ms=Date.parse(claim?.at||"");
      return Number.isFinite(ms) && nowMs-ms>=0 && nowMs-ms<=RECENT_CLAIMS_MAX_AGE_MS;
    });
    summary.recent_claims = recent.length;
    summary.latest_claim_at = all.reduce((best,[,claim]) =>
      claim?.at > (best||"") ? claim.at : best, null);
    const ownerMap=new Map();
    for (const [outputId, claim] of recent) {
      const owner=String(claim?.request_id||"");
      if (!/^[A-Za-z0-9_-]{12,128}$/.test(owner)) continue;
      const list=ownerMap.get(owner)||[];
      list.push({output_id:outputId,source:String(claim?.source||""),at:claim.at});
      ownerMap.set(owner,list);
    }
    summary.recent_owners=ownerMap.size;
    const owners=[...ownerMap].sort((a,b) =>
      String(b[1].at(-1)?.at||"").localeCompare(String(a[1].at(-1)?.at||""))).slice(0,24);
    for (const [owner, entries] of owners) {
      const [group, job]=await Promise.all([
        bucket.get(GROUPS_PREFIX+owner+".json"),
        bucket.get(JOBS_PREFIX+id+"/"+owner+".json"),
      ]);
      // Missing exact parent AND local job: a reservation may be stranded
      // between claim and enqueue. No mutation or inferred approval.
      if (!group && !job) summary.recent_unbacked_owners.push({
        request_id:owner, claim_count:entries.length,
        output_ids:entries.map(x=>x.output_id),
        sources:[...new Set(entries.map(x=>x.source))],
        latest_at:entries.reduce((best,x)=>x.at>best?x.at:best,""),
      });
    }
    summary.checked_recent_owners=owners.length;
    profiles.push(summary);
  }
  return {
    schema:"studio.factory-claims-readonly.1",read_only:true,
    observed_at:new Date(nowMs).toISOString(),
    group_objects_first_page:(groupList.objects||[]).length,
    group_objects_more:groupList.truncated===true,
    profiles,
    unbacked_recent_owners:profiles.reduce((n,p)=>n+p.recent_unbacked_owners.length,0),
  };
}

export default {
  async fetch(request, env) {
    if (!env.REPORT_TOKEN ||
        request.headers.get("Authorization") !== "Bearer " + env.REPORT_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
    const path = new URL(request.url).pathname;
    if (request.method !== "GET" || !["/report", "/claims"].includes(path)) return new Response("Not found", { status: 404 });
    try {
      const result = path === "/claims"
        ? await readFactoryClaimsDiagnostic(env.STUDIO_MEDIA)
        : await readFactoryTimingReport(env.STUDIO_MEDIA);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.warn("Read-only Factory timing inspector failed", String(error?.name || "unknown"));
      return new Response(JSON.stringify({ok:false,error:"timing_read_failed"}), {
        status: 503, headers: { "Content-Type": "application/json" },
      });
    }
  },
};
