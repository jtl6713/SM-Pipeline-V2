/**
 * One incident-only ledger; exact NYC 2026-11-21 Ideas and single-parent PRs.
 * This is NOT a generic production promoter. One per existing minute cron,
 * at most one attempt per ID via R2 receipts; neither scheduling nor publishing.
 */
export const NYC_20261121_EXACT_HANDOFF = Object.freeze([
  Object.freeze({ request: "rec0np6YuzVN966hP", idea: "recy5nk7d19K6cJh1", content: "recIBIsOABXPV2zcw", expected: 3 }),
  Object.freeze({ request: "rec8JA6CPgUMS0xKS", idea: "recXieJINYGG0TRLo", content: "reccjvhzkerIYOlCG", expected: 4 }),
  Object.freeze({ request: "recAbkOm30VUXSzA4", idea: "recqk4g2HH4cUfLEy", content: "recm0Y1MupKWQlUxr", expected: 4 }),
  Object.freeze({ request: "recbD8PLtJpez8Oz0", idea: "recXt6kZlYQ0qnpnB", content: "recAdmlLzSJPnhoMf", expected: 2 }),
  Object.freeze({ request: "recBiDsEj1JVat2pR", idea: "recGxXMTqn5n3RMe9", content: "rectp0jb1zdYGoKgw", expected: 2 }),
  Object.freeze({ request: "recD5yjZGttX2azkM", idea: "recg9QAwgSZ1NKvFw", content: "reclHHAP4oFodMt91", expected: 4 }),
  Object.freeze({ request: "recEoEZL4BZJRBzgf", idea: "rec9S0oobyCEMaP6z", content: "rec5wl5rIVgUjeO78", expected: 3 }),
  Object.freeze({ request: "recF11iJFCPcRbGsk", idea: "recLEGNOsaJH3uIQQ", content: "recejuTtsQB10tO6I", expected: 2 }),
  Object.freeze({ request: "recfcYT3Oo3DQEdgh", idea: "recxqiRiPncdZZLCx", content: "recL3fos4nfi728us", expected: 2 }),
  Object.freeze({ request: "recibgbtE7UgU4xha", idea: "recfSXtO4tBZrLFF8", content: "recv4NVg3vTlvFAfx", expected: 2 }),
  Object.freeze({ request: "reciVKyYkqdLmGHYw", idea: "recNHXEVPQfJiSFeh", content: "recpstbICLRh8xruR", expected: 4 }),
  Object.freeze({ request: "recNGPEWX3rZ4nNRB", idea: "receYKSp43CSMlP9M", content: "recEEDufXY55Moe9X", expected: 2 }),
  Object.freeze({ request: "recNHXsBTfgfuagts", idea: "rec26d2EGwBKihoiU", content: "recxYxvXnQHO9MYZX", expected: 4 }),
  Object.freeze({ request: "recT1GaqAjEg9iBLt", idea: "recTmBPv8Y6iGqgn6", content: "recIa2KVpVQ3roI87", expected: 4 }),
  Object.freeze({ request: "rectEE56Kf81ZSOFC", idea: "recvSZHJNWCYFggRy", content: "recpibwUvpH8vM2Xx", expected: 4 }),
  Object.freeze({ request: "recW2MYD8BFrElIB9", idea: "recvZGKBrIKLOOCZi", content: "recw5TsPlTyPQ90wH", expected: 4 }),
  Object.freeze({ request: "recYAuVSnDghuTS87", idea: "recb24Dd45Fc0iUvR", content: "recPR0zMv6j27MZJz", expected: 4 }),
  Object.freeze({ request: "recz5rJXf59lA6RFv", idea: "reck8u9jYzBdLEjDS", content: "recJgmW9FuGHUFAjC", expected: 3 }),
  Object.freeze({ request: "recZaLHvoyR4oOcTb", idea: "recmoIH4OhPhZJcdK", content: "recJjI3RZqUlIKw54", expected: 4 }),
]);

export const NYC_HANDOFF_PROFILE_ID = "recgtK8Z7eNADNtVy";
export const NYC_HANDOFF_MIN_UTC = "2026-11-21T08:00:00.000Z";
export const NYC_HANDOFF_EXPIRES_UTC = "2026-11-24T00:00:00.000Z";

export function selectExactNycHandoffSlot(atMs) {
  const time = Number(atMs);
  if (!Number.isFinite(time)
      || time < Date.parse(NYC_HANDOFF_MIN_UTC)
      || time >= Date.parse(NYC_HANDOFF_EXPIRES_UTC)) return null;
  const minute = Math.floor((time - Date.parse(NYC_HANDOFF_MIN_UTC)) / 60000);
  return NYC_20261121_EXACT_HANDOFF[minute % NYC_20261121_EXACT_HANDOFF.length];
}

export function exactNycHandoffPreflight({ target, request, idea, parent, rows }) {
  if (!target || !request || !idea || !parent || !Array.isArray(rows)) return "incomplete_read";
  const reqFields = request.fields || {};
  const ideaFields = idea.fields || {};
  const parentFields = parent.fields || {};
  if (request.id !== target.request || idea.id !== target.idea || parent.id !== target.content) return "id_mismatch";
  if (String(reqFields.Request_Status || "") !== "Submitted") return "not_submitted";
  if (String(ideaFields.Candidate_Status || "") !== "Promoted") return "idea_not_promoted";
  if (String(ideaFields.Promoted_Content_Record_ID || "") !== target.content) return "idea_parent_mismatch";
  if (String(reqFields.Studio_Master_Asset_Status || "") !== "Ready"
      || String(reqFields.Studio_Output_Plan_Status || "") !== "Ready"
      || String(reqFields.Studio_Variant_Status || "") !== "Ready") return "assets_not_ready";
  const parentRequest = Array.isArray(parentFields.Production_Request) ? parentFields.Production_Request : [];
  if (parentRequest.length !== 1 || parentRequest[0] !== target.request) return "parent_request_mismatch";
  if (!Array.isArray(parentFields.Content_Profile)
      || !parentFields.Content_Profile.includes(NYC_HANDOFF_PROFILE_ID)) return "wrong_profile";
  const job = (()=>{try{return JSON.parse(reqFields.Studio_Production_Job_JSON || "{}")}catch{return {}}})();
  if (job.step !== "escalated" || job.error !== "No Platform Outputs found for this Production Request")
    return "non_matching_production_job";
  if (rows.length !== target.expected) return "output_plan_count_changed";
  if (rows.some(row => row.fields?.Enabled !== true)) return "disabled_output";
  if (rows.some(row => Array.isArray(row.fields?.Platform_Output) && row.fields.Platform_Output.length))
    return "already_partly_routed";
  return null;
}
