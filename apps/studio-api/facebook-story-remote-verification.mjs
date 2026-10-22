/**
 * Read-only Meta Page Story verification.
 *
 * GET /{page-id}/stories exposes post_id, media_id, status, url, creation_time.
 * Only an exact persisted upload media ID, corroborated by a published/archived
 * Page story, establishes publication evidence. An empty/incomplete listing is
 * NEVER evidence of nonpublication; never authorize a Graph POST from it.
 */
export function facebookStoryPublishedMatch(items, expectedMediaId) {
  const expected = String(expectedMediaId || "").trim();
  if (!/^\d{6,30}$/.test(expected)) return null;
  const matches = (Array.isArray(items) ? items : []).filter((item) => (
    item && String(item.media_id || "").trim() === expected
    && ["PUBLISHED", "ARCHIVED"].includes(String(item.status || "").toUpperCase())
    && /^\d{6,30}$/.test(String(item.post_id || ""))
  ));
  if (matches.length !== 1) return null; // ambiguous identities fail closed
  const hit = matches[0];
  const url = String(hit.url || "").trim();
  const publicUrl = /^https:\/\/(?:www\.)?facebook\.com\//i.test(url) ? url : null;
  const creation = hit.creation_time;
  let publishedAt = null;
  if (typeof creation === "number" && creation > 1000000000 && creation < 10000000000) {
    publishedAt = new Date(creation * 1000).toISOString();
  } else if (typeof creation === "string") {
    const at = Date.parse(creation);
    if (Number.isFinite(at)) publishedAt = new Date(at).toISOString();
  }
  return Object.freeze({
    media_id: expected, post_id: String(hit.post_id), url: publicUrl,
    published_at: publishedAt, remote_status: String(hit.status).toUpperCase(),
    source: "meta_page_stories_exact_media_id",
  });
}

export async function verifyFacebookStoryByMediaId({
  pageId, token, version = "v25.0", mediaId, fetcher = fetch, maxPages = 4,
} = {}) {
  const id = String(mediaId || "").trim();
  if (!/^\d{6,30}$/.test(id)) return { verdict: "unknown", reason: "missing_exact_media_id" };
  const page = String(pageId || "").trim();
  const apiVersion = String(version || "").trim();
  if (!/^\d{6,30}$/.test(page) || !/^v\d+\.\d+$/.test(apiVersion) || !token)
    return { verdict: "unknown", reason: "missing_meta_page_configuration" };
  const base = `https://graph.facebook.com/${apiVersion}/${page}/stories`;
  const seen = new Set();
  let after = "";
  let pagesRead = 0;
  let uniqueMatch = null;
  const limit = Math.min(10, Math.max(1, Number(maxPages) || 4));
  while (pagesRead < limit) {
    if (seen.has(after)) return { verdict: "unknown", reason: "repeated_meta_page_cursor", pages_read: pagesRead };
    seen.add(after);
    const url = new URL(base);
    url.searchParams.set("fields", "post_id,media_id,status,url,creation_time");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    let response, body;
    try {
      response = await fetcher(url.toString(), {
        method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(7000) : undefined,
      });
      body = await response.json();
    } catch {
      return { verdict: "unknown", reason: "meta_read_unavailable", pages_read: pagesRead };
    }
    if (!response?.ok || !body || !Array.isArray(body.data))
      return { verdict: "unknown", reason: "meta_read_rejected_or_invalid", pages_read: pagesRead };
    pagesRead++;
    // A first-page positive cannot be final: later pages can disclose an
    // inconsistent remote identity. Complete the bounded census before repair.
    const matches = body.data.filter((item) => String(item?.media_id || "") === id);
    if (matches.length > 1 || (matches.length && uniqueMatch))
      return { verdict: "unknown", reason: "ambiguous_remote_story", pages_read: pagesRead };
    if (matches.length === 1) {
      const match = facebookStoryPublishedMatch(matches, id);
      if (!match)
        return { verdict: "unknown", reason: "remote_story_not_confirmed_published", pages_read: pagesRead };
      uniqueMatch = match;
    }
    // Do not follow arbitrary provider paging.next URLs or propagate secrets.
    // A cursor is an untrusted opaque value, but stays on the fixed Graph host.
    const cursor = typeof body.paging?.cursors?.after === "string" ? body.paging.cursors.after : "";
    if (!body.paging?.next)
      return uniqueMatch
        ? { verdict: "verified_published", evidence: uniqueMatch, pages_read: pagesRead }
        : { verdict: "unknown", reason: "no_exact_match_not_proof_of_absence", pages_read: pagesRead };
    if (!cursor || cursor.length > 1000)
      return { verdict: "unknown", reason: "invalid_meta_cursor", pages_read: pagesRead };
    after = cursor;
  }
  // Even a positive match is inconclusive when Graph pagination is truncated.
  return { verdict: "unknown", reason: "incomplete_meta_pagination", pages_read: pagesRead };
}
