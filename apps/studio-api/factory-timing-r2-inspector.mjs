/**
 * Ephemeral, read-only R2 Factory approval timing inspector. Run only through
 * the existing GitHub Actions / Cloudflare authenticated automation pattern.
 * It does not import any Airtable, publishing, scheduling, or write code.
 */
import { factoryBatchList } from "./factory-approval-queue.mjs";
import { factoryApprovalTimingReport } from "./factory-approval-timings.mjs";

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
  return {
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
