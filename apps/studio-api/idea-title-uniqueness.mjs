/** Fail-closed, per-title 365-day guard for Studio idea creation paths.
 * Airtable does not enforce unique Candidate_Title or Content_Title values.
 * The query is scoped to non-test production rows and scans the entire
 * trailing-year history, not a truncated "recent ideas" list.
 */
export const IDEA_TITLE_UNIQUENESS_DAYS = 365;

export function studioIdeaTitleKey(title) {
  return String(title || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function studioIdeaTitleYearFormula(title, titleField, createdField) {
  if (!["Candidate_Title", "Content_Title"].includes(titleField)) throw new Error("Invalid title field");
  if (!["Create_Date", "Created_At"].includes(createdField)) throw new Error("Invalid created date field");
  const key = studioIdeaTitleKey(title);
  if (!key) throw new Error("A nonempty idea title is required");
  return `AND({Test_Run_ID}=BLANK(),IS_AFTER({${createdField}},DATEADD(TODAY(),-${IDEA_TITLE_UNIQUENESS_DAYS},'days')),REGEX_REPLACE(LOWER({${titleField}}&''),'[^a-z0-9]','')='${key}')`;
}

/**
 * Query both unpromoted Ideas and promoted Content Items, so deletion of a
 * candidate link cannot make a recently used title eligible again.
 * query(kind, formula) MUST reject when a source is unavailable; no catch-to-[]
 * permitted. The caller should reject the create or edit with HTTP 409.
 */
export async function studioFindRecentDuplicateTitle(title, query, { excludeIdeaId = "", excludeContentId = "" } = {}) {
  const sources = [
    ["idea", "Candidate_Title", "Create_Date", excludeIdeaId],
    ["content", "Content_Title", "Created_At", excludeContentId],
  ];
  for (const [kind, field, created, excluded] of sources) {
    const rows = await query(kind, studioIdeaTitleYearFormula(title, field, created));
    if (!Array.isArray(rows)) throw new Error("Incomplete title history");
    const found = rows.find((row) => row?.id && row.id !== excluded);
    if (found) return { source: kind, record_id: found.id };
  }
  return null;
}
