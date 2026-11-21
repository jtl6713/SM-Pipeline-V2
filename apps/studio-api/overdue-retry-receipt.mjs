/**
 * Prevent overdue rescue skip receipts from silently lifting explicit retry
 * restrictions or shortening an existing platform backoff.
 *
 * Only the governed publisher or a deliberate recovery decision may change
 * Publish_Retry_Eligible. Receipt stamping is diagnostic, never authorization.
 */
export function overdueSkipReceiptFields({ note, retryEligible, retryAt, errorStage, nowMs = Date.now() } = {}) {
  const message = String(note || "");
  if (!/skipped:/i.test(message) || /RATE_LIMIT|FACEBOOK_STORY_RATE_LIMIT_368/i.test(String(errorStage || ""))) {
    return {};
  }
  const fields = {
    Publish_Error_Stage: "RESCUE_SKIP",
    Publish_Error_Message: message.slice(0, 900),
  };
  // No override of any negative retry authority.
  if (retryEligible === false || retryEligible === "false" || retryEligible === 0) return fields;
  const priorMs = Date.parse(String(retryAt || ""));
  const nextMs = Number(nowMs) + 30 * 60 * 1000;
  if (!Number.isFinite(priorMs) || priorMs < nextMs) {
    fields.Publish_Next_Retry_At = new Date(nextMs).toISOString();
  }
  return fields;
}

/**
 * A dispatch receipt and a provider attempt are not equivalent. A skipped
 * candidate can be recorded diagnostically without burning the eight-attempt
 * publisher budget or moving the last-attempt cooldown clock.
 *
 * Count ambiguous exceptions conservatively; this helper only excludes a
 * concrete, explicit skipped/held receipt.
 */
/** A future scheduled hold is not a remote provider dispatch. */
export function preDispatchScheduledHold(note) {
  const message = String(note || "").trim();
  return /^(?:(?:overdue-rescue|reconcile):\s*)*held until\b/i.test(message)
    || /^(?:(?:overdue-rescue|reconcile):\s*)*skipped:\s*scheduled-hold(?:\s|$)/i.test(message);
}

export function publishDispatchAttemptStampFields({ note, priorCount = 0, nowIso = new Date().toISOString() } = {}) {
  const message = String(note || "").trim();
  // Only proven *pre-dispatch* refusals are safe to exempt. Unknown skipped
  // outcomes might have reached a remote provider and must retain the budget.
  const skippedReason = /(?:^|\s)skipped:\s*([a-z0-9_-]+)/i.exec(message)?.[1]?.toLowerCase() || "";
  const noProviderCall = ["scheduled-hold", "no-dispatch", "missing-ai-caption"].includes(skippedReason);
  if (noProviderCall || preDispatchScheduledHold(message)) return {};
  return {
    Studio_Publish_Dispatch_At: nowIso,
    Studio_Publish_Dispatch_Count: Math.max(0, Number(priorCount) || 0) + 1,
  };
}
