/**
 * #2618: fail-closed, exact-set protection for Factory's deletion/skip action.
 * Factory Delete mutates unpublished siblings, not just the selected output.
 * An unresolved creative-media QA marker is an independent veto even if DNP
 * was mistakenly cleared. No publication/scheduling or database writes here.
 */
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

export async function assertFactoryCreativeQaDeleteSafe(ids, readRows) {
  const unique = [...new Set((ids || []).map(v => String(v || "")))];
  if (!unique.length || unique.length > 40
    || unique.length !== (ids || []).length
    || unique.some(id => !RECORD_ID.test(id))) {
    throw Error("Factory deletion target set missing or ambiguous; nothing changed");
  }
  if (typeof readRows !== "function") throw Error("Factory deletion authoritative reader missing");
  const rows = await readRows(unique);
  if (!Array.isArray(rows) || rows.length !== unique.length) {
    throw Error("Factory deletion canonical Supabase target coverage unavailable; nothing changed");
  }
  const found = new Set();
  for (const row of rows) {
    const id = String(row?.airtable_record_id || "");
    if (!unique.includes(id) || found.has(id)) {
      throw Error("Factory deletion canonical target mismatch; nothing changed");
    }
    found.add(id);
    if (row?.error_messages?.SM_2618_Creative_QA_Hold?.publishing_permitted === false) {
      throw Error("Creative QA hold: output " + id + " requires corrected media and human Factory approval; Delete/Skip is blocked");
    }
  }
  return { safe: true, checked_count: unique.length };
}
