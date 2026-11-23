/**
 * Incident #2670. Cross-host admission client shared with the Windows Runner.
 *
 * OFF by default. Activation requires a reviewed Supabase migration, service
 * role credentials, a two-host lease-fence test and explicit release flag.
 * One bounded RPC per new heavy job, not per DB row or photo.
 */
const SCOPES = new Set(["producer", "idea_generation", "native_gallery", "rendering_review"]);
const SHA64 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DURATIONS = [60, 1800];

export function globalWorkloadEnabled(env) {
  return String(env?.STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED || "") === "true";
}

export async function globalWorkloadKey(identity) {
  if (typeof identity !== "string" || identity.trim().length < 12 || identity.length > 1024) {
    throw new Error("global_workload_identity_invalid");
  }
  const data = new TextEncoder().encode("sm-pipeline-v2-global-2670|" + identity);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function authority(env) {
  const base = String(env?.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const secret = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(base) || secret.length < 32) {
    throw new Error("global_workload_authority_unavailable");
  }
  return { base, secret };
}
function config(env, scope, key, fence, ttl) {
  if (!SCOPES.has(scope) || !SHA64.test(String(key)) ||
      !UUID.test(String(fence)) || !Number.isInteger(ttl) ||
      ttl < DURATIONS[0] || ttl > DURATIONS[1]) {
    throw new Error("global_workload_request_invalid");
  }
  return authority(env);
}

export async function globalWorkloadRpc(env, operation, {
  scope, key, fence, ttlSeconds = 600, verifiedProgress = false, reason,
} = {}, { transport = fetch } = {}) {
  if (!globalWorkloadEnabled(env)) {
    return { enabled: false, accepted: false, reason: "not_enabled" };
  }
  if (!["acquire", "renew", "release", "trip"].includes(operation)) {
    throw new Error("global_workload_operation_invalid");
  }
  const cfg = operation === "trip" ? authority(env) : config(env, scope, key, fence, ttlSeconds);
  const suffix = operation === "acquire" ? "studio_global_workload_acquire"
    : operation === "renew" ? "studio_global_workload_renew"
    : operation === "release" ? "studio_global_workload_release"
    : "studio_global_workload_trip";
  const body = operation === "acquire"
    ? { p_scope: scope, p_claim_key: key, p_fence: fence, p_ttl_seconds: ttlSeconds }
    : operation === "renew"
      ? { p_scope: scope, p_claim_key: key, p_fence: fence, p_ttl_seconds: ttlSeconds }
      : operation === "release"
        ? { p_scope: scope, p_claim_key: key, p_fence: fence, p_verified_progress: verifiedProgress === true }
        : { p_reason: reason, p_cooldown_seconds: Math.min(600, Math.max(60, ttlSeconds)) };
  if (operation === "trip" && !new Set(["overload", "timeout", "http_429", "http_5xx"]).has(reason)) {
    throw new Error("global_workload_trip_reason_invalid");
  }
  let response;
  try {
    response = await transport(cfg.base + "/rest/v1/rpc/" + suffix, {
      method: "POST",
      headers: {
        apikey: cfg.secret, Authorization: "Bearer " + cfg.secret,
        "Content-Type": "application/json", Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    // An ambiguous claim may already exist. Never silently retry; retain the
    // canonical queued job, and let the bounded remote lease expire.
    throw new Error("global_workload_rpc_unconfirmed");
  }
  if (!response || !response.ok) {
    throw new Error("global_workload_rpc_rejected");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("global_workload_rpc_receipt_invalid");
  }
  if (operation === "acquire") {
    if (!payload || typeof payload.accepted !== "boolean") {
      throw new Error("global_workload_acquire_receipt_invalid");
    }
    return { enabled: true, accepted: payload.accepted,
      replay: payload.replay === true, reason: String(payload.reason || "").slice(0, 64) };
  }
  if (typeof payload !== "boolean") {
    throw new Error("global_workload_boolean_receipt_invalid");
  }
  return { enabled: true, accepted: payload };
}

export async function globalWorkloadAdmission(env, scope, identity, options = {}) {
  if (!globalWorkloadEnabled(env)) return { enabled: false, accepted: false };
  const key = await globalWorkloadKey(identity);
  const fence = crypto.randomUUID();
  const receipt = await globalWorkloadRpc(env, "acquire",
    { scope, key, fence, ttlSeconds: options.ttlSeconds || 600 },
    options);
  return { ...receipt, scope, key, fence };
}


/**
 * Renewal guard for one already-admitted heavy Worker job. Call only when
 * `STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED=true`; never from cron polling
 * or asset-row loops. Failed or ambiguous renewals prohibit further work.
 */
export function startGlobalWorkloadHeartbeat(
  env, claim, { heartbeatMs = 90_000, ttlSeconds = 600, transport = fetch } = {},
) {
  if (!claim?.enabled || claim.accepted !== true ||
      !SCOPES.has(claim.scope) || !SHA64.test(claim.key) || !UUID.test(claim.fence)) {
    throw new Error("global_workload_missing_admitted_owner");
  }
  let lost = false;
  let stopped = false;
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    if (lost || stopped) return;
    pending = pending.then(async () => {
      if (lost || stopped) return;
      try {
        const renewed = await globalWorkloadRpc(
          env, "renew", {
            scope: claim.scope, key: claim.key, fence: claim.fence, ttlSeconds,
          }, { transport },
        );
        if (renewed.accepted !== true) lost = true;
      } catch {
        lost = true;
      }
    }).catch(() => { lost = true; });
  }, heartbeatMs);
  return {
    assertOwned() {
      if (lost) throw new Error("global_workload_lease_lost");
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending;
    },
  };
}
