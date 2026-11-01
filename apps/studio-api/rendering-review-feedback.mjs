/**
 * Server-only Chicago Rendering Review feedback intake.
 *
 * Inert integration boundary: no Worker POST route imports this module, and
 * review admission / mutation deployment flags remain OFF. A future route
 * must supply authenticated, server-owned operations (never request-body
 * actor, role, fingerprint, timestamps, or permission assertions).
 *
 * The coordinator owns shared output locking, durable hold readback,
 * expected-version persistence and independent post-write verification.
 */
import { mutateReviewSessionCommand } from "./rendering-review-coordinator.mjs";

function deny(status, code, detail) {
  const e = new Error(detail);
  e.status = status;
  e.code = code;
  throw e;
}
const outputRe = /^rec[A-Za-z0-9]{14}$/;
const requestRe = /^[A-Za-z0-9_-]{8,120}$/;
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))));
}

/**
 * Turn an authenticated person's literal feedback into one durable user
 * message. No Producer message, plan, render job, hold release, approval or
 * publishing action can be requested through this command.
 *
 * operations.getAuthenticatedActor() must derive identity and permissions
 * from existing Studio session/membership middleware, not the HTTP body.
 * operations.authorizeReview() and authorizeEvent() remain server-owned.
 * Caller must bind all operations to the same authenticated principal.
 */
export async function submitManualReviewFeedback({
  output_id, content, expected_version, client_request_id,
  timestamp_seconds = null, in_flight_only = false, operations, now = () => new Date(),
}) {
  if (typeof operations?.getAuthenticatedActor !== "function")
    deny(503, "AUTH_INTEGRATION_MISSING", "Trusted Studio authentication adapter is required");
  const actor = await operations.getAuthenticatedActor();
  if (!actor?.authenticated || !actor?.authorized ||
      actor?.permissions?.outputs_review !== true ||
      typeof actor?.id !== "string" || !actor.id.trim() || actor.id.length > 256)
    deny(403, "REVIEW_PERMISSION_REQUIRED", "Authenticated review permission is required");
  if (!outputRe.test(output_id))
    deny(400, "INVALID_OUTPUT_ID", "Exact Platform Output ID required");
  if (typeof content !== "string" || !content.trim() || content.trim().length > 3000)
    deny(400, "INVALID_FEEDBACK", "Feedback must be 1 to 3000 characters");
  if (!Number.isSafeInteger(expected_version) || expected_version < 1)
    deny(400, "INVALID_VERSION", "A positive expected session version is required");
  if (typeof client_request_id !== "string" || !requestRe.test(client_request_id))
    deny(400, "INVALID_REQUEST_ID", "A stable client request ID is required");
  if (timestamp_seconds !== null &&
      (typeof timestamp_seconds !== "number" || !Number.isFinite(timestamp_seconds) ||
       timestamp_seconds < 0 || timestamp_seconds > 86400))
    deny(400, "INVALID_TIMESTAMP", "Video timestamp is outside the supported range");
  const contentText = content.trim();
  const principal = actor.id.trim();
  // A client-supplied request key is namespaced by the authenticated
  // identity and output. It is never accepted as an event credential.
  const requestDigest = await digest(["render-review-feedback-v1", principal, output_id, client_request_id]);
  const payloadDigest = await digest(["render-review-feedback-v1", principal, output_id, contentText, timestamp_seconds]);
  const event = {
    type: "MESSAGE",
    role: "user",
    content: contentText,
    message_id: "rrm_" + requestDigest.slice(0, 48),
    idempotency_key: "rrmsg_" + requestDigest.slice(0, 64),
    fingerprint: "rrfp_" + payloadDigest,
    expected_version,
    timestamp_seconds,
    ...(in_flight_only === true ? {in_flight_only:true} : {}),
    at: now().toISOString(),
  };
  // This uses the existing server-only serialized coordinator. The input
  // cannot elevate itself to a Producer event or grant render authorization.
  return mutateReviewSessionCommand({ output_id, event, operations });
}
