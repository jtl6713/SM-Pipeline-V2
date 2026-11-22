/**
 * #2618: Producer-to-scheduling-approval technical preflight.
 *
 * Supabase only, metadata-only: never sets Review_Status=Approved, an MAE
 * date, auto_publish_enabled, publish_status or a provider token/attempt.
 * A final human scheduling/publishing approval is still required.
 */
import { supabaseRest, studioSupabaseConfigured } from "./supabase-pipeline-reads.mjs";

export const PREFLIGHT_KEY = "SM_Scheduling_Approval_Preflight_v1";
const CDN = "https://media.chicagoshining.com/";
const recId = /^rec[A-Za-z0-9]{14}$/;
const supportedRender = new Set(["Rendered", "Native Photo Route"]);
const safeStatus = new Set(["", "Not Ready", "Ready to Publish"]);
const safeReview = new Set(["", "Review Sent", "Pending Review", "Pending"]);
const str = value => String(value ?? "").trim();
const truthy = value => value === true || value === 1 || str(value).toLowerCase() === "true";

export function schedulingPreflightSignature(row) {
  // An exact equality fingerprint: use the complete relevant media identities,
  // not a lossy numerical hash, so changes invalidate previous verification.
  return JSON.stringify([
    row?.airtable_record_id, row?.platform, row?.studio_output_type,
    row?.render_status, row?.final_file_url, row?.studio_preview_url,
    row?.thumbnail_url, row?.selected_clip_count, row?.output_caption,
  ]);
}

export function assessSchedulingPreflight(row, { allowVerifiedCompactNative = false } = {}) {
  const fail = reason => ({ ready: false, reason });
  if (!row || !recId.test(str(row.airtable_record_id)) || !row.id ||
      !row.content_item_id || !row.content_profile_id) return fail("unverified_output_ownership");
  if (row.output_status !== "Ready for Review") return fail("not_ready_for_review");
  if (truthy(row.test_run_id) || str(row.test_run_id)) return fail("test_output");
  if (truthy(row.do_not_publish) || truthy(row.auto_publish_enabled))
    return fail("publishing_or_recovery_hold");
  if (!supportedRender.has(str(row.render_status))) return fail("render_incomplete");
  if (!safeReview.has(str(row.review_status)) ||
      !safeStatus.has(str(row.publish_status))) return fail("review_or_publication_state");
  // Legacy NYC producer plans can prefill a proposed Scheduled_Post_Date
  // before the creative exists or the human has approved. A proposed date is
  // NOT permission to post. Technical verification may proceed, but may NEVER
  // change that date, Review_Status, Auto_Publish_Enabled or Publish_Status.
  // An actual Studio/YouTube scheduled stamp or provider operation still blocks.
  if (row.published_at || row.studio_scheduled_at ||
      row.youtube_scheduled_publish_at || row.platform_post_url || row.platform_post_id)
    return fail("existing_schedule_or_provider_operation");
  if (row.scheduled_post_date &&
      !Number.isFinite(Date.parse(str(row.scheduled_post_date))))
    return fail("invalid_provisional_scheduled_date");
  const bag = row.error_messages && typeof row.error_messages === "object"
    && !Array.isArray(row.error_messages) ? row.error_messages : {};
  if ([
    "Publish_Locked_At", "Publish_Started_At", "Studio_Publish_Dispatch_At",
    "Platform_Post_ID", "Platform_Media_ID", "Factory_Review_Handoff_Safety_Hold_At",
    "Studio_Render_Review_Hold_Active",
  ].some(key => truthy(bag[key]) || str(bag[key])) ||
      ["Studio_Publish_Dispatch_Count", "Publish_Attempt_Count", "Studio_Publish_Attempt_Count"]
        .some(key => Number(bag[key] || 0) > 0))
    return fail("historical_provider_or_review_hold");
  if (!str(row.output_caption)) return fail("caption_missing");
  const preview = str(row.studio_preview_url);
  const cover = str(row.thumbnail_url);
  if (!preview.startsWith(CDN) || !cover.startsWith(CDN))
    return fail("public_preview_or_cover_missing");
  const native = row.render_status === "Native Photo Route";
  const media = [{ url: preview, kind: native ? "image" : "video" },
    { url: cover, kind: "image" }];
  if (native) {
    const count = Number(row.selected_clip_count);
    if (!Number.isSafeInteger(count) || count < 1)
      return fail("native_selected_count_missing");
    // Never infer that a photo set passed from its cover alone. Verify the
    // complete selected set and every actual image URL, in source order.
    const manifest = row.selected_assets;
    const clips = manifest && typeof manifest === "object" && !Array.isArray(manifest)
      ? manifest.selected_clips : null;
    if (!Array.isArray(clips)) {
      // The lean Factory GET does not download entire selected_assets JSON.
      // It may only project a pre-existing receipt from a STRICT full-manifest
      // byte probe, and cannot create one from this compact projection.
      const receipt = row.error_messages?.[PREFLIGHT_KEY];
      const confirmedEarlier = allowVerifiedCompactNative &&
        receipt?.status === "verified" &&
        receipt?.native_source_count === count &&
        receipt?.signature === schedulingPreflightSignature(row);
      if (!confirmedEarlier) return fail("native_photo_manifest_mismatch");
    } else {
      if (clips.length !== count ||
          clips.some(clip => !str(clip?.url || clip?.src).startsWith(CDN)))
        return fail("native_photo_manifest_mismatch");
      for (const clip of clips) media.push({ url: str(clip.url || clip.src), kind: "image" });
    }
  } else if (!str(row.final_file_url)) {
    return fail("render_final_file_missing");
  }
  return {
    ready: true, reason: "technical_media_preflight_pending",
    signature: schedulingPreflightSignature(row),
    media: [...new Map(media.map(asset => [asset.url, asset])).values()],
  };
}

export function verifiedSchedulingPreflight(row) {
  const assess = assessSchedulingPreflight(row, { allowVerifiedCompactNative: true });
  const receipt = row?.error_messages?.[PREFLIGHT_KEY];
  return assess.ready && receipt?.status === "verified" &&
    receipt?.signature === assess.signature &&
    receipt?.requires_human_approval === true;
}

export async function probeSchedulingMedia(assessment, fetchImpl = fetch) {
  if (!assessment?.ready) return { ok: false, reason: assessment?.reason || "not_eligible" };
  for (const asset of assessment.media || []) {
    let response;
    try {
      response = await fetchImpl(asset.url, {
        method: "GET",
        headers: { Range: "bytes=0-31" },
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(7000) : undefined,
      });
      const mime = str(response?.headers?.get?.("content-type")).toLowerCase();
      const kindOkay = asset.kind === "video" ? mime.startsWith("video/") : mime.startsWith("image/");
      try { await response?.body?.cancel?.(); } catch {}
      if (!response?.ok || !kindOkay)
        return { ok: false, reason: "media_http_validation_failed" };
    } catch {
      try { await response?.body?.cancel?.(); } catch {}
      return { ok: false, reason: "media_http_validation_unavailable" };
    }
  }
  return { ok: true, reason: "public_media_byte_headers_verified" };
}

const SELECT = [
  "id", "airtable_record_id", "content_item_id", "content_profile_id",
  "platform", "studio_output_type", "render_status", "output_status",
  "review_status", "publish_status", "do_not_publish", "auto_publish_enabled",
  "test_run_id", "output_caption", "studio_preview_url", "thumbnail_url",
  "final_file_url", "selected_clip_count", "selected_assets",
  "published_at", "scheduled_post_date", "studio_scheduled_at",
  "youtube_scheduled_publish_at", "platform_post_url", "error_messages",
  "updated_at",
].join(",");

/**
 * Independent five-minute cron: a small bounded number of outputs per cycle.
 * It does not re-render, send review mail, approve, schedule, lift holds or
 * publish. A failed or racy preflight cannot advance an output.
 */
export async function sweepSchedulingApprovalPreflight(env, {
  limit = 4, fetchImpl = fetch, clock = () => new Date(),
} = {}) {
  const report = { scanned: 0, eligible: 0, verified: 0, skipped: 0, races: 0, unavailable: 0 };
  if (!studioSupabaseConfigured(env)) return { ...report, reason: "supabase_unavailable" };
  const max = Math.max(1, Math.min(8, Number(limit) || 4));
  const rows = await supabaseRest(env,
    "platform_outputs?output_status=eq.Ready%20for%20Review&do_not_publish=eq.false" +
    "&published_at=is.null&select=" + SELECT +
    "&order=created_at.asc.nullslast&limit=100");
  if (!Array.isArray(rows)) throw Error("Scheduling approval Supabase scan unavailable");
  report.scanned = rows.length;
  for (const row of rows) {
    if (report.eligible >= max) break;
    const eligibility = assessSchedulingPreflight(row);
    if (!eligibility.ready) { report.skipped++; continue; }
    if (verifiedSchedulingPreflight(row)) { report.skipped++; continue; }
    report.eligible++;
    // Verify ownership at its authoritative linked Content Item. The output
    // UUIDs merely being present is not proof they refer to the same profile.
    const parents = await supabaseRest(env, "content_items?id=eq." +
      encodeURIComponent(row.content_item_id) +
      "&content_profile_id=eq." + encodeURIComponent(row.content_profile_id) +
      "&select=id,airtable_record_id&limit=1");
    if (!Array.isArray(parents) || parents.length !== 1 ||
        !parents[0]?.airtable_record_id) { report.unavailable++; continue; }
    const media = await probeSchedulingMedia(eligibility, fetchImpl);
    if (!media.ok) { report.unavailable++; continue; }
    const stamp = clock().toISOString();
    if (!row.updated_at || !str(row.id)) { report.unavailable++; continue; }
    const receipt = {
      version: 1,
      status: "verified",
      checked_at: stamp,
      signature: eligibility.signature,
      evidence: media.reason,
      native_source_count: row.render_status === "Native Photo Route" ? Number(row.selected_clip_count) : null,
      scope: "technical_media_only",
      requires_human_approval: true,
      scheduling_authorized: false,
      publishing_authorized: false,
    };
    // PostgREST CAS rejects edits from contemporaneous runner/factory actions.
    const query = "platform_outputs?id=eq." + encodeURIComponent(row.id)
      + "&airtable_record_id=eq." + encodeURIComponent(row.airtable_record_id)
      + "&updated_at=eq." + encodeURIComponent(row.updated_at)
      + "&output_status=eq.Ready%20for%20Review"
      + "&do_not_publish=eq.false&published_at=is.null"
      + "&scheduled_post_date=is.null"
      + "&studio_scheduled_at=is.null"
      + "&" + (row.review_status == null ? "review_status=is.null" :
        "review_status=eq." + encodeURIComponent(row.review_status))
      + "&" + (row.publish_status == null ? "publish_status=is.null" :
        "publish_status=eq." + encodeURIComponent(row.publish_status));
    const changed = await supabaseRest(env, query, {
      method: "PATCH",
      body: {
        error_messages: { ...(row.error_messages || {}), [PREFLIGHT_KEY]: receipt },
        updated_at: stamp,
      },
      headers: { Prefer: "return=representation" },
    });
    if (!Array.isArray(changed) || changed.length !== 1) { report.races++; continue; }
    // Only existing metadata changed. Never infer actual editorial/rights QA.
    report.verified++;
  }
  return report;
}
