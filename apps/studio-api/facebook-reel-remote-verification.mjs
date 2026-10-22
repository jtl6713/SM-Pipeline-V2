/** QA-1050: read-only exact Meta Reel identity verifier.
 * Never creates, publishes, or interprets a 404 as evidence of no publication.
 * Caller must obtain the existing Page access token through the authorized
 * server secret and must never persist it in a ledger or log.
 */
export async function verifyFacebookReelByVideoId({
  videoId, token, version = "v25.0", fetcher = fetch,
} = {}) {
  const id = String(videoId || "").trim();
  if (!/^\d{6,30}$/.test(id)) return { verdict: "unknown", reason: "missing_exact_video_id" };
  if (!token || !/^v\d+\.\d+$/.test(version))
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
  if (!/^https:\/\/(?:www\.)?facebook\.com\/(?:reel\/|[^?#]*\/videos\/)/i.test(permalink))
    return { verdict: "unknown", reason: "no_authoritative_reel_permalink" };
  if (!["PUBLISHED", "LIVE", "READY_TO_PUBLISH"].includes(status) || status === "READY_TO_PUBLISH")
    return { verdict: "unknown", reason: "remote_not_confirmed_published" };
  const createdAt = typeof body.created_time === "number"
    ? new Date(body.created_time * 1000) : new Date(String(body.created_time || ""));
  if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() > Date.now() + 300000 || createdAt.getTime() < Date.UTC(2004, 0, 1))
    return { verdict: "unknown", reason: "missing_or_invalid_provider_publish_time" };
  // Exact ID plus published status, permalink and timestamp is positive evidence;
  // downstream reconciliation must independently verify the same identity and
  // publication timestamp before modifying an Airtable publishing status.
  return { verdict: "remote_identity_confirmed", video_id: id,
    permalink_url: permalink, provider_status: status, published_at: createdAt.toISOString(),
    source: "meta_graph_exact_reel_video_id", publish_authorized: false };
}

/** Reconciliation gate: use only a second, fresh authoritative Airtable readback.
 * This helper never writes or invokes a provider mutation.
 */
export function reelPublishedReconciliationEvidence({ original, latest, receipt } = {}) {
  const f = x => x?.fields || {};
  if (!original?.id || original.id !== latest?.id ||
      receipt?.verdict !== "remote_identity_confirmed" ||
      !/^\d{6,30}$/.test(String(receipt.video_id || "")) ||
      !receipt.published_at || !Number.isFinite(Date.parse(receipt.published_at)))
    return { authorized: false, reason: "incomplete_positive_evidence" };
  const before = f(original), after = f(latest);
  const savedIds = x => [x.Platform_Post_ID, x.Platform_Media_ID, x.FB_Slideshow_Meta_Video_ID]
    .map(v => String(v || "").trim()).filter(Boolean);
  if (before.Do_Not_Publish !== true || after.Do_Not_Publish !== true ||
      before.Publish_Retry_Eligible === true || after.Publish_Retry_Eligible === true ||
      before.Publish_Error_Stage !== "FBS3_RATE_LIMIT" ||
      after.Publish_Error_Stage !== "FBS3_RATE_LIMIT" ||
      before.Publish_Attempt_Count !== after.Publish_Attempt_Count ||
      before.Studio_Publish_Dispatch_Count !== after.Studio_Publish_Dispatch_Count)
    return { authorized: false, reason: "record_state_changed" };
  const ids = [...savedIds(before), ...savedIds(after)];
  if (!ids.length || ids.some(id => id !== receipt.video_id))
    return { authorized: false, reason: "remote_identity_conflict" };
  if (!["PUBLISHED", "LIVE"].includes(receipt.provider_status) ||
      !/^https:\/\/(?:www\.)?facebook\.com\/reel\//i.test(String(receipt.permalink_url || "")))
    return { authorized: false, reason: "publication_receipt_incomplete" };
  return { authorized: true, video_id: receipt.video_id,
    permalink_url: receipt.permalink_url, published_at: receipt.published_at,
    // Proof permits only an independently guarded existing-post reconciliation, never a Graph create.
    graph_create_authorized: false };
}
