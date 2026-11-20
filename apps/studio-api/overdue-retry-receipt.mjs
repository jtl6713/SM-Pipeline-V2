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
