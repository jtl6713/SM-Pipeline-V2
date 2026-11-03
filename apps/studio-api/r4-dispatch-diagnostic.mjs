/** Sanitized last R4 launch result. No URLs, creative payload, tokens, or credentials. */
export const R4_DISPATCH_LAST_KEY = "ops/r4-dispatch-last-v1";

export function sanitizeR4DispatchAttempt({ head, started = null, error = null, outcome, at = new Date().toISOString() }) {
  const reason = String(started?.details?.run?.reason || started?.details?.reason || "").trim();
  const status = Number(error?.status || error?.statusCode || 0);
  return {
    at,
    record_id: /^rec[A-Za-z0-9]{14}$/.test(String(head?.id || "")) ? head.id : null,
    outcome: String(outcome || "unknown").slice(0,80),
    stage: String(started?.stage || "").slice(0,20) || null,
    stage_status: String(started?.status || "").slice(0,30) || null,
    runner_reason: reason.slice(0,120) || null,
    http_status: Number.isInteger(status) && status >= 100 && status < 600 ? status : null,
    error_class: error?.name ? String(error.name).slice(0,80) : null,
    job_receipt_present: Boolean(String(started?.details?.run?.job_id || "").trim()),
    processed: started?.details?.run?.processed === true,
  };
}

export async function recordR4DispatchAttempt(bucket, input) {
  if (!bucket?.put) return null;
  const receipt = sanitizeR4DispatchAttempt(input);
  try {
    await bucket.put(R4_DISPATCH_LAST_KEY, JSON.stringify(receipt), {
      httpMetadata: { contentType: "application/json" },
    });
    return receipt;
  } catch {
    // Observability must never block safe rendering or change dispatch decisions.
    return null;
  }
}

export async function readR4DispatchAttempt(bucket) {
  try {
    const object = await bucket?.get?.(R4_DISPATCH_LAST_KEY);
    if (!object) return null;
    const value = JSON.parse(await object.text());
    return value?.at && value?.outcome ? value : null;
  } catch {
    return null;
  }
}
