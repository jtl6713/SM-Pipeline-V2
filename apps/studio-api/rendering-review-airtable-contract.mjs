/**
 * Rendering Review Phase 1 Airtable storage / publisher boundary.
 * NOT wired into production. Platform Outputs remain the hold authority.
 * Sessions + Events persist context and audit, not an alternate approval truth.
 */
import { CHICAGO_PROFILE_ID, REVIEW_SCHEMA, reviewDispatchGate } from "./rendering-review-policy.mjs";

export const REVIEW_SESSION_TABLE = "Rendering Review Sessions";
export const REVIEW_EVENT_TABLE = "Rendering Review Events";
export const REVIEW_HOLD_FIELDS = Object.freeze([
  "Studio_Review_Hold_ID", "Studio_Review_Hold_Owner",
  "Studio_Review_Current_Attempt_ID", "Studio_Review_Approved_Attempt_ID",
  "Studio_Review_Current_Artifact_ID",
]);
export const REVIEW_STAGING_TABLES = Object.freeze({
  sessions: "tbl2usbCpJNWCAAcL",
  events: "tblyxIPTWx4aGpRf6",
});
const text = v => String(v ?? "").trim();
const fail = (code, message, status=409) => {
  const e = new Error(message); e.code=code; e.status=status; throw e;
};
const validId = x => /^[A-Za-z0-9_-]{8,120}$/.test(text(x));
const recId = x => /^rec[A-Za-z0-9]{14}$/.test(text(x));

export function prepareAuthoritativeReviewHoldPatch({
  output_id, session_id, hold_id, current_attempt_id, artifact_id,
}) {
  if (!recId(output_id) ||
      ![session_id, hold_id, current_attempt_id, artifact_id].every(validId))
    fail("INVALID_HOLD_IDENTITY", "Server-scoped hold identifiers required", 400);
  return Object.freeze({
    Do_Not_Publish: true,
    Studio_Review_Hold_ID: text(hold_id),
    Studio_Review_Hold_Owner: text(session_id),
    Studio_Review_Current_Attempt_ID: text(current_attempt_id),
    Studio_Review_Approved_Attempt_ID: "",
    Studio_Review_Current_Artifact_ID: text(artifact_id),
  });
}

/** A verified hold receipt is constructed only after fresh Airtable readback. */
export function verifyAuthoritativeReviewHold({
  output, output_id, session_id, hold_id,
}) {
  if (text(output?.id) !== text(output_id))
    fail("OUTPUT_READBACK_MISMATCH", "Output identity changed");
  const f=output?.fields;
  if (!f || f.Do_Not_Publish !== true ||
      text(f.Studio_Review_Hold_ID)!==text(hold_id) ||
      text(f.Studio_Review_Hold_Owner)!==text(session_id) ||
      !validId(f.Studio_Review_Current_Attempt_ID) ||
      !validId(f.Studio_Review_Current_Artifact_ID))
    fail("REVIEW_HOLD_NOT_AUTHORITATIVE", "Review hold is absent or changed");
  if (f.Publish_Started_At || f.Publish_Locked_At || f.Published_At || f.Platform_Post_ID ||
      f.Platform_Post_URL || /^(published|publishing|dispatched)$/i.test(text(f.Publish_Status)) ||
      /^(published|publishing|dispatched)$/i.test(text(f.Output_Status)))
    fail("DISPATCH_OWNED", "Publication dispatch has already begun");
  return {
    id:text(hold_id), owner:text(session_id), output_id:text(output_id),
    verified:true, active:true,
  };
}

/** Map serializable review state to additive authoritative session columns. */
export function encodeReviewSessionForAirtable(session, timestamp) {
  if (session?.schema!==REVIEW_SCHEMA || !validId(session.id) ||
      !recId(session.output_id) || !Number.isSafeInteger(session.version) ||
      session.version<1 || !Array.isArray(session.attempts) ||
      !Array.isArray(session.messages))
    fail("INVALID_SESSION_DATA", "Session failed schema validation",400);
  const json=JSON.stringify(session);
  if (json.length>80000) fail("SESSION_TOO_LARGE",
    "Large conversations require separate durable message/event records",413);
  return {
    Review_Session_ID:session.id,
    Platform_Output_Record_ID:session.output_id,
    Profile_Record_ID:session.profile_id,
    Platform_Output_Type:session.output_type,
    Review_State:session.state,
    Session_Version:session.version,
    Review_Hold_ID:session.review_hold?.id || "",
    Review_Hold_Active:session.review_hold?.active === true,
    Current_Attempt_ID:session.current_attempt_id,
    Approved_Attempt_ID:session.approved_attempt_id || "",
    Enrollment_Request_ID:session.enrollment_request_id || "",
    Session_JSON:json,
    Updated_At_ISO:text(timestamp),
  };
}

/** Readback rejects disagreement between redundant columns and JSON. */
export function decodeReviewSessionFromAirtable(record) {
  const f=record?.fields;
  if (!f || !text(f.Session_JSON))
    fail("SESSION_NOT_FOUND","No authoritative session JSON",404);
  let s;
  try {s=JSON.parse(f.Session_JSON)}catch {fail("CORRUPT_SESSION","Session JSON is invalid")}
  if (s.schema!==REVIEW_SCHEMA ||
      text(f.Review_Session_ID)!==text(s.id) ||
      text(f.Platform_Output_Record_ID)!==text(s.output_id) ||
      text(f.Profile_Record_ID)!==text(s.profile_id) ||
      text(f.Platform_Output_Type)!==text(s.output_type) ||
      text(f.Review_State)!==text(s.state) ||
      Number(f.Session_Version)!==s.version ||
      text(f.Review_Hold_ID)!==text(s.review_hold?.id) ||
      Boolean(f.Review_Hold_Active)!==(s.review_hold?.active===true) ||
      text(f.Current_Attempt_ID)!==text(s.current_attempt_id) ||
      text(f.Approved_Attempt_ID)!==text(s.approved_attempt_id))
    fail("SESSION_FIELD_DRIFT","Session columns disagree with JSON");
  return s;
}

/**
 * Apply immediately before irreversible dispatch inside the same output lease.
 * Once Chicago review enforcement is enabled, it must remain enabled until
 * all sessions have drained, even if new admissions are switched off.
 *
 * The caller MUST use current, complete Airtable output fields. If scoped,
 * it must provide a session resolution of not_found or found; unavailable
 * lookups, partial field sets and inconsistent state always deny dispatch.
 */
export function checkRenderingReviewBeforeDispatch({
  output, candidate, enforcement_enabled=false,
  sessionResolution, hold_field_fetched=false,
}) {
  const f=output?.fields;
  if (!f || !output?.id) return {allowed:false,reason:"OUTPUT_NOT_AUTHORITATIVE"};
  if (text(f.Studio_Review_Hold_ID))
    return {allowed:false,reason:"REVIEW_HOLD_ACTIVE"};
  // No live sessions yet. The separate enforcement flag cannot be disabled
  // after pilot activation while any session survives.
  if (!enforcement_enabled) return {allowed:true,reason:"LEGACY_UNENROLLED"};
  const platform=text(f.Platform).toLowerCase();
  const outputType=text(f.Platform_Output_Type);
  if (platform!=="instagram" || outputType!=="Instagram Reel")
    return {allowed:true,reason:"OUTSIDE_PILOT_SCOPE"};
  // Airtable provides a linked Content_Profile field. Projections are allowed
  // but must be verified; an absent/ambiguous profile may never bypass gate.
  const rawProfile=f.Content_Profile_Record_ID || f.Content_Profile;
  const ids=Array.isArray(rawProfile)
    ? rawProfile.map(x=>text(typeof x==="string" ? x : x?.id)).filter(Boolean)
    : [text(rawProfile)].filter(Boolean);
  if (ids.length!==1 || !/^rec[A-Za-z0-9]{14}$/.test(ids[0]))
    return {allowed:false,reason:"PROFILE_UNRESOLVED"};
  if (ids[0]!==CHICAGO_PROFILE_ID)
    return {allowed:true,reason:"OUTSIDE_PILOT_SCOPE"};
  if (!hold_field_fetched) return {allowed:false,reason:"HOLD_FIELD_NOT_FETCHED"};
  if (sessionResolution?.kind==="not_found")
    return {allowed:true,reason:"UNENROLLED"};
  if (sessionResolution?.kind!=="found")
    return {allowed:false,reason:"REVIEW_LOOKUP_UNAVAILABLE"};
  const s=sessionResolution.session;
  if (!s || s.output_id!==output.id || s.profile_id!==CHICAGO_PROFILE_ID)
    return {allowed:false,reason:"SESSION_IDENTITY_MISMATCH"};
  return reviewDispatchGate(s,{
    output_status:f.Output_Status, publish_status:f.Publish_Status,
    published_at:f.Published_At, post_id:f.Platform_Post_ID,
    platform_post_url:f.Platform_Post_URL,
    publish_started_at:f.Publish_Started_At,publish_locked_at:f.Publish_Locked_At,
    unrelated_hold_active:f.Do_Not_Publish===true,
  },candidate);
}
