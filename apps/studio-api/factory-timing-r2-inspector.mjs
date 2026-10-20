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

export default {
  async fetch(request, env) {
    if (!env.REPORT_TOKEN ||
        request.headers.get("Authorization") !== "Bearer " + env.REPORT_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
    const path = new URL(request.url).pathname;
    if (request.method !== "GET" || path !== "/report") return new Response("Not found", { status: 404 });
    try {
      const result = await readFactoryTimingReport(env.STUDIO_MEDIA);
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
