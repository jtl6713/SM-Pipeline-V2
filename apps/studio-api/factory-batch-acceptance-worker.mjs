/**
 * Non-publishing Factory Batch acceptance harness.
 * Intentionally isolated: NO production Worker import, Airtable, credentials,
 * social platform API, or publishing dispatch. Bind an ephemeral local R2.
 */
import {
  factoryBatchEnqueue, factoryBatchRead, factoryBatchSummary,
  factoryBatchDrain, factoryBatchRetry, factoryBatchList, factoryBatchCronSelectJobs,
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
  const rid = requestId(new URL(req.url));
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
        if (!submitted.already_submitted) ctx.waitUntil(drain(env, req).catch(async error => {
          const message = String(error?.stack || error?.message || error);
          console.error("FACTORY_SMOKE_BACKGROUND_FAILURE", message);
          await env.STUDIO_MEDIA.put(PREFIX + "/" + rid + "/failure-diagnostics.json", JSON.stringify({ message }));
        }));
        return json({ ...factoryBatchSummary(submitted.job), accepted: true,
          already_submitted: submitted.already_submitted });
      }
      if (req.method === "POST" && url.pathname === "/api/retry") {
        await env.STUDIO_MEDIA.put(PREFIX + "/" + rid + "/allow-failed.json", JSON.stringify({ allow: true }));
        const job = await factoryBatchRetry(env.STUDIO_MEDIA, PROFILE, rid);
        ctx.waitUntil(drain(env, req));
        return json({ ...factoryBatchSummary(job), accepted: true });
      }
      if (req.method === "POST" && url.pathname === "/api/simultaneous-profile") {
        // Launch two distinct same-profile drains in the same Worker turn.
        // A barrier holds the winning approval long enough for the rival to
        // attempt the profile lock. Never publish or call Airtable.
        const ids = [rid + "_sim_a", rid + "_sim_b"];
        for (let i = 0; i < 2; i++) {
          await factoryBatchEnqueue(env.STUDIO_MEDIA, {
            profileId: PROFILE, requestId: ids[i],
            records: Array.from({ length: 10 }, (_, j) => ({
              id: idFor(i * 10 + j), platform: "Instagram", format: "Reel",
            })), note: "simultaneous-profile-contention",
          });
        }
        const approveSynthetic = async id => {
          const key = PREFIX + "/" + rid + "/simultaneous/" + id + ".json";
          return withOutputApprovalLock(env.STUDIO_MEDIA, id, async () => {
            if (await read(env, key)) return { already_approved: true };
            await new Promise(resolve => setTimeout(resolve, 60));
            await env.STUDIO_MEDIA.put(key, JSON.stringify({ id }), {
              onlyIf: new Headers({ "If-None-Match": "*" }),
            });
            return { id };
          });
        };
        const [a, b] = await Promise.all(ids.map(requestId => factoryBatchDrain(env.STUDIO_MEDIA, {
          profileId: PROFILE, requestId, maxItems: 10,
          approve: approveSynthetic,
        })));
        const claimedCount = Number(Boolean(a.claimed)) + Number(Boolean(b.claimed));
        if (claimedCount !== 1) throw Error("Expected exactly one simultaneous profile-lock winner");
        const siblings = await factoryBatchList(env.STUDIO_MEDIA, PROFILE, { limit: 40 });
        const next = factoryBatchCronSelectJobs(siblings.map(job => ({
          profileId: PROFILE, requestId: job.request_id, job,
        })), { maxProfiles: 1 })[0];
        const loserId = a.claimed ? ids[1] : ids[0];
        if (next?.requestId !== loserId) throw Error("Profile handoff did not select lock loser");
        const resumed = await factoryBatchDrain(env.STUDIO_MEDIA, {
          profileId: PROFILE, requestId: loserId, maxItems: 10,
          approve: approveSynthetic,
        });
        const commits = await env.STUDIO_MEDIA.list({ prefix: PREFIX + "/" + rid + "/simultaneous/" });
        const first = await factoryBatchRead(env.STUDIO_MEDIA, PROFILE, ids[0]);
        const second = await factoryBatchRead(env.STUDIO_MEDIA, PROFILE, ids[1]);
        const passed = claimedCount === 1 && resumed.claimed &&
          first?.status === "completed" && second?.status === "completed" && commits.objects.length === 20;
        if (!passed) throw Error("Simultaneous profile contention did not complete exactly once");
        return json({ passed, claimed_count: claimedCount, lock_loser: loserId,
          handoff_to: next.requestId, unique_commits: commits.objects.length });
      }
      if (req.method === "POST" && url.pathname === "/api/competing-profile") {
        // Synthetic same-profile contention: two distinct child ledgers, no publishing.
        const firstId = rid + "_a";
        const secondId = rid + "_b";
        const children = [firstId, secondId];
        for (let i = 0; i < children.length; i++) {
          const offset = i * 10;
          await factoryBatchEnqueue(env.STUDIO_MEDIA, {
            profileId: PROFILE, requestId: children[i],
            records: Array.from({ length: 10 }, (_, j) => ({
              id: idFor(offset + j), platform: "Instagram", format: "Reel",
            })), note: "same-profile-contention-acceptance",
          });
        }
        const first = await factoryBatchDrain(env.STUDIO_MEDIA, {
          profileId: PROFILE, requestId: firstId, maxItems: 10,
          approve: (id, job) => withOutputApprovalLock(env.STUDIO_MEDIA, id, async () => {
            const key = PREFIX + "/" + rid + "/contention/" + id + ".json";
            if (await read(env, key)) return { already_approved: true };
            await new Promise(resolve => setTimeout(resolve, 20));
            await env.STUDIO_MEDIA.put(key, JSON.stringify({ id }));
            return { id };
          }),
        });
        const siblings = await factoryBatchList(env.STUDIO_MEDIA, PROFILE, { limit: 40 });
        const next = factoryBatchCronSelectJobs(siblings.map(job => ({
          profileId: PROFILE, requestId: job.request_id, job,
        })), { maxProfiles: 1 })[0];
        if (next?.requestId !== secondId) throw Error("Fair handoff did not select pending sibling");
        const second = await factoryBatchDrain(env.STUDIO_MEDIA, {
          profileId: PROFILE, requestId: next.requestId, maxItems: 10,
          approve: async id => {
            const key = PREFIX + "/" + rid + "/contention/" + id + ".json";
            if (await read(env, key)) return { already_approved: true };
            await env.STUDIO_MEDIA.put(key, JSON.stringify({ id }));
            return { id };
          },
        });
        const committed = await env.STUDIO_MEDIA.list({ prefix: PREFIX + "/" + rid + "/contention/" });
        return json({ first_completed: first.job.status === "completed",
          second_completed: second.job.status === "completed",
          handoff_to: next.requestId, unique_commits: committed.objects.length,
          passed: first.job.status === "completed" && second.job.status === "completed"
            && committed.objects.length === 20 });
      }
      if (req.method === "POST" && url.pathname === "/api/cleanup") {
        // Even if a live Cloudflare R2 bucket is bound by a staging test,
        // delete ONLY this fixed synthetic profile's test ledger and locks.
        // Never list/delete a whole shared production bucket.
        const prefixes = [
          "studio/state/factory-approvals/v2/jobs/" + PROFILE + "/",
          "studio/state/factory-approvals/v2/locks/" + PROFILE + ".json",
          "studio/state/output-approval-locks/v1/recFactorySmoke",
          PREFIX + "/" + rid + "/",
        ];
        let deleted = 0;
        for (const prefix of prefixes) {
          for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
            const listing = await env.STUDIO_MEDIA.list({ prefix, limit: 1000 });
            const keys = listing.objects.map(item => item.key);
            if (!keys.length) break;
            await env.STUDIO_MEDIA.delete(keys);
            deleted += keys.length;
          }
        }
        const counts = await Promise.all(prefixes.map(async prefix =>
          (await env.STUDIO_MEDIA.list({ prefix, limit: 1 })).objects.length));
        return json({ cleanup: true, deleted, test_prefixes_empty: counts.every(n => n === 0) });
      }
      if (req.method === "POST" && url.pathname === "/api/diagnose") {
        const result = await drain(env, req);
        return json({ ...factoryBatchSummary(result.job), claimed: result.claimed, processed: result.processed });
      }
      if (req.method === "POST" && url.pathname === "/api/resume") {
        ctx.waitUntil(drain(env, req));
        return json({ accepted: true, resumed: true });
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        const job = await factoryBatchRead(env.STUDIO_MEDIA, PROFILE, rid);
        if (!job) return json({ error: "not found" }, 404);
        const rows = await env.STUDIO_MEDIA.list({ prefix: PREFIX + "/" + rid + "/committed/" });
        const diagnostics = await read(env, PREFIX + "/" + rid + "/failure-diagnostics.json");
        return json({ ...factoryBatchSummary(job), stored_commits: rows.objects.length,
          background_error: diagnostics?.message || null });
      }
      return json({ error: "unsupported" }, 404);
    } catch (error) {
      return json({ error: error?.message || String(error) }, 500);
    }
  },
};
