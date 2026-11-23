/**
 * Incident #2670: Cloudflare -> Windows runner shared heavy-work admission.
 *
 * The Windows runner's durable SQLite governor is the SINGLE lease authority
 * for both Worker ready-production and Python producers. This path issues no
 * Supabase requests; failure to reach the broker NEVER permits heavy work.
 * Existing R2 ready-production entries are retained when admission is denied.
 */
const IDEA_ID = /^rec[A-Za-z0-9]{14}$/;
const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEARTBEAT_MS = 30_000;
const LEASE_CALL_TIMEOUT_MS = 7_000;

export async function runnerWorkerLease(
  env, action, ideaId, token,
  { transport = fetch } = {},
) {
  if (!["claim", "renew", "release"].includes(action)
    || !IDEA_ID.test(String(ideaId || ""))
    || !OWNER_ID.test(String(token || ""))) {
    return { admitted: false, reason: "invalid_lease_identity" };
  }
  const runnerUrl = String(env?.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  const secret = String(env?.PIPELINE_RUNNER_SHARED_SECRET || "").trim();
  if (!/^https:\/\//.test(runnerUrl) || !secret) {
    return { admitted: false, reason: "shared_admission_not_configured" };
  }
  try {
    const response = await transport(`${runnerUrl}/internal/workload/worker-lease`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pipeline-Secret": secret },
      body: JSON.stringify({ action, idea_id: ideaId, token }),
      signal: typeof AbortSignal?.timeout === "function"
        ? AbortSignal.timeout(LEASE_CALL_TIMEOUT_MS) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (action === "release") {
      return { released: response.ok && result?.released === true };
    }
    if (!response.ok || result?.ok !== true || result?.admitted !== true) {
      return { admitted: false, reason: response.status === 429 ? "capacity_or_circuit" : "broker_unavailable" };
    }
    return { admitted: true };
  } catch {
    // A timeout, 502, invalid JSON or uncertain claim outcome must not
    // start new work; token-only release can be attempted by the caller.
    return { admitted: false, reason: "broker_unavailable" };
  }
}

export function startRunnerWorkerLeaseHeartbeat(
  env, ideaId, token, { transport = fetch, heartbeatMs = HEARTBEAT_MS } = {},
) {
  let lost = false;
  let stopped = false;
  let inFlight = Promise.resolve();
  const timer = setInterval(() => {
    if (stopped || lost) return;
    inFlight = inFlight.then(async () => {
      if (stopped || lost) return;
      const result = await runnerWorkerLease(env, "renew", ideaId, token, { transport });
      if (!result.admitted) lost = true;
    }).catch(() => { lost = true; });
  }, heartbeatMs);
  return {
    assertOwned() {
      if (lost) throw new Error("shared_workload_lease_lost");
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
