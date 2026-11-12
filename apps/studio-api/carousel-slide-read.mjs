import {
  listSupabaseCarouselSlidesByIds,
  studioSupabaseConfigured,
  studioWriteSource,
} from "./supabase-pipeline-reads.mjs";

/**
 * Carousel build and the verify-race heal read slide records from Supabase
 * when Output/Content writes are Supabase-first. A slide that is not in the
 * copy yet is still read from Airtable. A slide patch commits to carousel_slides.
 */
export async function studioReadCarouselSlides(env, ids, airtableFetch, tableName) {
  const wanted = [...new Set((ids || [])
    .map((id) => String(id?.id || id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)))];
  if (!wanted.length) return [];
  if (typeof airtableFetch !== "function") throw new Error("Carousel slide Airtable read is not available");
  if (studioWriteSource(env) === "supabase" && studioSupabaseConfigured(env)) {
    const rows = await listSupabaseCarouselSlidesByIds(env, wanted);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length) {
      const extra = await Promise.all(missing.map((id) => airtableFetch(env, tableName, id)));
      for (const row of extra) if (row?.id) byId.set(row.id, row);
    }
    return wanted.map((id) => byId.get(id)).filter(Boolean);
  }
  return Promise.all(wanted.map((id) => airtableFetch(env, tableName, id)));
}
