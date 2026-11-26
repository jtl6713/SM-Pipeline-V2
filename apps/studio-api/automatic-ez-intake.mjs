// #3094: ordinary EZ draft intake is separate from photo-wait acceptance.
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
import { productionModeRoutingEnabled } from "./manual-production-list.mjs";
import { editorGuardEnabled, assertEditorGuardReady } from "./production-editor-boundary.mjs";

export const automaticEzIntakeEnabled = env => productionModeCaptureEnabled(env) &&
  productionModeRoutingEnabled(env) && editorGuardEnabled(env) &&
  env?.STUDIO_AUTOMATIC_EZ_INTAKE === "true";
const kinds = new Set(["single-photo","multiple-photos","single-ai","multiple-ai","mixed",
  "video-clips","photos-and-clips"]);
const rec = /^rec[A-Za-z0-9]{14}$/;
const marker = "[automatic-ez-intake.1] ";
const authorityNotes = /origin\s*=\s*(?:az-finished-video|prepare-to-review|autonomous|scripted-short|story-first)|ez-input\s*=\s*(?:finished-video|vibe-cut)|az-publish-mode\s*=|\[story-first(?:-production)?\.1\]|\[factory-revision-open\]/i;
export function automaticEzCreateEnabled(env, auth) {
  return automaticEzIntakeEnabled(env) && auth?.permissions?.ideas_create === true &&
    auth?.permissions?.production_configure === true;
}
export function automaticEzIdeaFields(env, auth, payload, { source, mode, profileId } = {}) {
  if (!automaticEzCreateEnabled(env, auth)) throw new Error("Automatic EZ intake is not enabled");
  assertEditorGuardReady(env);
  const kind = payload?.input_kind;
  if (payload?.automatic_ez_intake !== true || source !== "idea" || mode !== "automatic" ||
      payload.production_mode !== "automatic" || !kinds.has(kind) ||
      !rec.test(profileId || "") || payload.content_profile_id !== profileId ||
      Object.prototype.hasOwnProperty.call(payload, "automatic_photo_wait") ||
      authorityNotes.test(String(payload.summary || "")))
    throw new Error("Exact ordinary automatic EZ intake and profile required");
  // No acceptance, no schedule, no library matching while explicit originals
  // or AI masters are still being collected.
  return { Studio_Photo_Wait_Status: "Not Needed", Production_Config_Notes: marker + kind };
}
export function automaticEzIdeaKind(idea) {
  const f = idea?.fields || {};
  const lines = String(f.Production_Config_Notes || "").split(/\r?\n/).filter(x=>x.startsWith(marker));
  const kind = lines.length === 1 ? lines[0].slice(marker.length) : "";
  return kinds.has(kind) ? kind : null;
}
// Future draft transport must check the typed canonical source and exact
// owner again, not accept the request's origin text as authority.
export function verifiedAutomaticEzDraftInput(idea, body) {
  const f = idea?.fields || {};
  const kind = automaticEzIdeaKind(idea);
  const notes = String(body?.production_notes || "");
  const profile = body?.content_profile_id;
  const origins = [...notes.matchAll(/\borigin\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  const inputs = [...notes.matchAll(/\bez-input\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  return Boolean(kind && rec.test(idea?.id || "") && body?.idea_record_id === idea.id &&
    rec.test(profile || "") && Array.isArray(f.Content_Profile) && f.Content_Profile.length === 1 &&
    f.Content_Profile[0] === profile && f.Studio_Production_Mode === "automatic" &&
    f.Studio_Production_Source === "idea" && f.Candidate_Status === "Generated" &&
    f.Studio_Photo_Wait_Status === "Not Needed" && !String(f.Test_Run_ID || "").trim() &&
    !f.Promoted_Content_Record_ID && !(f["Content Items"] || []).length &&
    origins.length === 1 && origins[0] === "ez-wizard" &&
    inputs.length === 1 && inputs[0] === kind &&
    !authorityNotes.test(notes) && !authorityNotes.test(String(f.Idea_Summary || "")) &&
    !/\b(?:origin|ez-input)\s*=/i.test(String(f.Idea_Summary || "")) &&
    !Object.keys(body).some(key=>/^(?:publish|schedule|approval|approve|status|hold|test_run)/i.test(key)));
}

/** A replay never replaces an existing draft or accepts a different owner. */
export function verifiedAutomaticEzDraftReceipt(record, idea, body) {
  const f = record?.fields || {};
  const kind = automaticEzIdeaKind(idea);
  const notes = String(f.Production_Notes || "");
  const origins = [...notes.matchAll(/\borigin\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  const inputs = [...notes.matchAll(/\bez-input\s*=\s*([a-z0-9_-]+)/gi)].map(x=>x[1].toLowerCase());
  return Boolean(verifiedAutomaticEzDraftInput(idea,body) && rec.test(record?.id || "") &&
    f.Request_Status === "Draft" && f.Active === true &&
    Array.isArray(f.Idea_Candidate) && f.Idea_Candidate.length === 1 &&
    f.Idea_Candidate[0] === idea.id && origins.length === 1 && origins[0] === "ez-wizard" &&
    inputs.length === 1 && inputs[0] === kind && !authorityNotes.test(notes) &&
    !String(f.Test_Run_ID || "").trim() && !(f.Promoted_Content_Item || []).length &&
    !f.Studio_Publish_Batch_ID && !f.Studio_Publish_Requested_At);
}
// A canonical lookup failure or multiple open requests requires reconciliation;
// never treat a failed read as permission to create another draft.
export function automaticEzExistingDraftId(rows, idea) {
  if (!Array.isArray(rows) || rows.length > 1 ||
      rows.some(row=>!rec.test(row?.id || "")))
    throw new Error("Automatic EZ draft ownership requires reconciliation");
  const linked = idea?.fields?.["Production Requests"] || [];
  if (!Array.isArray(linked) || linked.some(id=>!rec.test(id)) ||
      linked.some(id=>id!==rows[0]?.id))
    throw new Error("Automatic EZ reciprocal draft linkage requires reconciliation");
  return rows[0]?.id || null;
}
