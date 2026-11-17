/**
 * Production link truth comes from Supabase's platform_outputs.content_item_id
 * join, NOT nullable Output_ID/output_number nor migrated parent extras.
 * This helper is deliberately read-only and does not assign missing numbers.
 */
export function productionOutputLinksFromJoinedRecords(outputRecords = []) {
  const ids = new Set();
  for (const output of outputRecords || []) {
    const id = String(output?.id || "").trim();
    if (/^rec[A-Za-z0-9]{14}$/.test(id) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      ids.add(id);
    }
  }
  return [...ids];
}
