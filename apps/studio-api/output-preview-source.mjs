/**
 * Pure URL predicates for /api/outputs/:id/preview source selection.
 * Keep aligned with item4UrlIsPublicPlayableVideo / item4UrlIsPublicPublishCdn
 * in worker.js — this module owns the render-server accept path that those
 * media.chicagoshining.com helpers intentionally exclude.
 */

export function item4UrlIsRenderServerVideo(url) {
  const href = String(url || "").trim();
  if (!href) return false;
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "render.chicagoshining.com") return false;
  if (!parsed.pathname.startsWith("/out/")) return false;
  // Reject bare /out/ and non-video leftovers (logs, status JSON, etc.).
  if (parsed.pathname === "/out/" || parsed.pathname.endsWith("/")) return false;
  return /\.(mp4|mov|m4v|webm)$/i.test(parsed.pathname);
}
