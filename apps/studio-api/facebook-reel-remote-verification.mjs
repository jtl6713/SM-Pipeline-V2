/** QA-1050: read-only exact Meta Reel identity verifier.
 * Never creates, publishes, or interprets a 404 as evidence of no publication.
 * Caller must obtain the existing Page access token through the authorized
 * server secret and must never persist it in a ledger or log.
 */
export async function verifyFacebookReelByVideoId({
  videoId, token, version = "v25.0", fetcher = fetch,
} = {}) {
  const id = String(videoId || "").trim();
  if (!/^\\d{6,30}$/.test(id)) return { verdict: "unknown", reason: "missing_exact_video_id" };
  if (!token || !/^v\\d+\\.\\d+$/.test(version))
    return { verdict: "unknown", reason: "missing_meta_configuration" };
  const url = new URL(`https://graph.facebook.com/${version}/${id}`);
  url.searchParams.set("fields", "id,status,created_time,permalink_url");
  let response, body;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(7000) : undefined,
    });
    body = await response.json();
  } catch {
    return { verdict: "unknown", reason: "meta_read_unavailable" };
  }
  if (!response?.ok || !body || typeof body !== "object")
    return { verdict: "unknown", reason: "meta_read_rejected_or_missing" };
  if (String(body.id || "") !== id)
    return { verdict: "unknown", reason: "remote_identity_mismatch" };
  const status = String(body.status?.video_status || body.status?.processing_phase?.status || body.status || "").toUpperCase();
  // Processing completion alone is not evidence that the Reel was published.
  const permalink = String(body.permalink_url || "");
  if (!/^https:\/\/(?:www\\.)?facebook\\.com\/(?:reel\/|[^?#]*\/videos\/)/i.test(permalink))
    return { verdict: "unknown", reason: "no_authoritative_reel_permalink" };
  if (status && /ERROR|FAILED|PROCESSING|UPLOADING|IN_PROGRESS|SCHEDULED|PENDING/.test(status))
    return { verdict: "unknown", reason: "remote_not_confirmed_published" };
  // Exact ID plus a Reel permalink is a positive remote identity receipt;
  // downstream reconciliation must independently verify the same identity and
  // publication timestamp before modifying an Airtable publishing status.
  return { verdict: "remote_identity_confirmed", video_id: id,
    permalink_url: permalink, provider_status: status || "unspecified",
    source: "meta_graph_exact_reel_video_id", publish_authorized: false };
}
