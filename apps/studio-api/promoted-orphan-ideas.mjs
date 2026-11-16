/**
 * Promoted Idea Candidates with no Content Item id and no Production Request
 * are orphans (false "In production" in Studio Ideas). Delete them from
 * Supabase; Quality Agent catalogs leftovers for Worker heal.
 */

export const PROMOTED_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const PROMOTED_ORPHAN_HEAL_LIMIT = 100;

export function ideaLinkIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          return String(entry.id || entry.airtable_record_id || "").trim();
        }
        return "";
      })
      .filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
  }
  const raw = String(value || "").trim();
  return /^rec[A-Za-z0-9]+$/.test(raw) ? [raw] : [];
}

export function isPromotedOrphanIdea(row, { nowMs = Date.now(), minAgeMs = PROMOTED_ORPHAN_MIN_AGE_MS } = {}) {
  if (!row) return false;
  const status = String(row.status || row.fields?.Candidate_Status || "").trim();
  if (status !== "Promoted") return false;
  const payload = row.payload && typeof row.payload === "object" ? row.payload : (row.fields || {});
  const promotedId = String(
    payload.Promoted_Content_Record_ID
    || row.fields?.Promoted_Content_Record_ID
    || "",
  ).trim();
  if (promotedId) return false;
  if (ideaLinkIds(payload["Content Items"] || row.fields?.["Content Items"]).length) return false;
  if (ideaLinkIds(payload["Production Requests"] || row.fields?.["Production Requests"]).length) return false;
  const createdAt = Date.parse(String(row.created_at || row.createdTime || payload.Create_Date || ""));
  if (Number.isFinite(createdAt) && nowMs - createdAt < Math.max(0, Number(minAgeMs) || 0)) {
    return false;
  }
  return true;
}

export function classifyPromotedOrphanIdea(row, { nowMs = Date.now() } = {}) {
  if (!isPromotedOrphanIdea(row, { nowMs, minAgeMs: 0 })) return null;
  const recordId = String(row.airtable_record_id || row.id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) return null;
  const title = String(row.candidate_title || row.fields?.Candidate_Title || "").trim() || recordId;
  return {
    kind: "promoted_orphan_idea",
    class: "data_repair",
    record_id: recordId,
    fingerprint: `promoted_orphan_idea:${recordId}:blank_content_id`,
    actor: "worker_heal",
    diagnosis:
      `Idea Candidate ${recordId} (${title}) is Candidate_Status=Promoted with blank `
      + "Promoted_Content_Record_ID and no Content Item / Production Request. "
      + "Studio Ideas shows In production incorrectly. Worker deletes these orphans "
      + "on the daily heavy :00 tick. Same fingerprint after a heal tick → code_bug.",
  };
}
