import {
  listSupabaseCarouselSlidesByIds,
  studioSupabaseConfigured,
  studioWriteSource,
} from "./supabase-pipeline-reads.mjs";

/**
 * Carousel build and the verify-race heal read slide records from Supabase
 * when Output/Content writes are Supabase-first. Missing slide identities must
 * fail closed; never fall back to legacy Airtable while Supabase is authoritative.
 * A slide patch commits to carousel_slides.
 */
export async function studioReadCarouselSlides(env, ids, airtableFetch, tableName) {
  const wanted = [...new Set((ids || [])
    .map((id) => String(id?.id || id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)))];
  if (!wanted.length) return [];
  if (studioWriteSource(env) === "supabase" && studioSupabaseConfigured(env)) {
    const rows = await listSupabaseCarouselSlidesByIds(env, wanted);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new Error("Supabase carousel slide identity missing: " + missing.join(","));
    }
    return wanted.map((id) => byId.get(id));
  }
  if (typeof airtableFetch !== "function") throw new Error("Carousel slide legacy read is not available");
  return Promise.all(wanted.map((id) => airtableFetch(env, tableName, id)));
}
