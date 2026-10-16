/**
 * Non-publishing Factory Batch acceptance harness.
 * Intentionally isolated: NO production Worker import, Airtable, credentials,
 * social platform API, or publishing dispatch. Bind an ephemeral local R2.
 */
import {
  factoryBatchEnqueue, factoryBatchRead, factoryBatchSummary,
  factoryBatchDrain, factoryBatchRetry,
} from "./factory-approval-queue.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";

const PROFILE = "recFactorySmokeOnly";
const COUNT = 20;
const PREFIX = "ci/factory-batch-acceptance/v1";
const idFor = i => "recFactorySmoke" + String(i).padStart(4, "0");
const json = (obj, code = 200) => new Response(JSON.stringify(obj), {
  status: code, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
async function read(env, key) {
  const row = await env.STUDIO_MEDIA.get(key);
  return row ? JSON.parse(await row.text()) : null;
}
function requestId(url) {
  const id = String(url.searchParams.get("request_id") || "acceptance_20261016_test");
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(id)) throw Error("Invalid test request ID");
  return id;
}
async function approve(env, id, job) {
  return withOutputApprovalLock(env.STUDIO_MEDIA, id, async () => {
    const committedKey = PREFIX + "/" + job.request_id + "/committed/" + id + ".json";
    if (await read(env, committedKey)) return { already_approved: true };
    const six = idFor(6);
    if (id === six && !(await read(env, PREFIX + "/" + job.request_id + "/allow-failed.json"))) {
      const error = new Error("Controlled acceptance failure. Retry Failed must recover this item.");
      error.status = 409;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 60));
    const response = await env.STUDIO_MEDIA.put(committedKey, JSON.stringify({
      id, committed_at: new Date().toISOString(),
    }), { onlyIf: new Headers({ "If-None-Match": "*" }) });
    if (!response) return { already_approved: true };
    return { id };
  });
}
async function drain(env, req) {
  const rid = requestId(req);
  return factoryBatchDrain(env.STUDIO_MEDIA, {
    profileId: PROFILE, requestId: rid, maxItems: COUNT,
    approve: (id, job) => approve(env, id, job),
  });
}
export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);
      const rid = requestId(url);
      if (req.method === "POST" && url.pathname === "/api/start") {
        const records = Array.from({ length: COUNT }, (_, i) => ({
          id: idFor(i), platform: "Instagram", format: i % 3 === 0 ? "Story" : "Reel",
        }));
        const submitted = await factoryBatchEnqueue(env.STUDIO_MEDIA, {
          profileId: PROFILE, requestId: rid, records, note: "non-publishing-acceptance",
        });
        if (!submitted.already_submitted) ctx.waitUntil(drain(env, req));
        return json({ ...factoryBatchSummary(submitted.job), accepted: true,
          already_submitted: submitted.already_submitted });
      }
      if (req.method === "POST" && url.pathname === "/api/retry") {
        await env.STUDIO_MEDIA.put(PREFIX + "/" + rid + "/allow-failed.json", JSON.stringify({ allow: true }));
        const job = await factoryBatchRetry(env.STUDIO_MEDIA, PROFILE, rid);
        ctx.waitUntil(drain(env, req));
        return json({ ...factoryBatchSummary(job), accepted: true });
      }
      if (req.method === "POST" && url.pathname === "/api/resume") {
        ctx.waitUntil(drain(env, req));
        return json({ accepted: true, resumed: true });
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        const job = await factoryBatchRead(env.STUDIO_MEDIA, PROFILE, rid);
        if (!job) return json({ error: "not found" }, 404);
        const rows = await env.STUDIO_MEDIA.list({ prefix: PREFIX + "/" + rid + "/committed/" });
        return json({ ...factoryBatchSummary(job), stored_commits: rows.objects.length });
      }
      return json({ error: "unsupported" }, 404);
    } catch (error) {
      return json({ error: error?.message || String(error) }, 500);
    }
  },
};
