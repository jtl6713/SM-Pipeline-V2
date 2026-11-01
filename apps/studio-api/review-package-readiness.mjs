/**
 * Shared, fail-closed review-package evidence. No publishing side effects.
 * Airtable remains the canonical source; Supabase is never consulted for writes.
 */
const MEDIA = "https://media.chicagoshining.com/";
const lower = value => String(value || "").trim().toLowerCase();
const string = value => String(value || "").trim();
const validCdn = value => string(value).startsWith(MEDIA);
function read(record, key) {
  const value = record?.fields?.[key] ?? record?.[key];
  return value?.name ?? value;
}
function clipManifest(record) {
  const raw = read(record, "Selected_Assets_JSON");
  if (!raw) return null;
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return value && typeof value === "object" ? value : null;
  } catch { return { invalid_json: true }; }
}
export function evaluateReviewPackage(record, { validatedAt = new Date().toISOString() } = {}) {
  const id = record?.id || null;
  const status = lower(read(record, "Output_Status"));
  const review = lower(read(record, "Review_Status"));
  const publish = lower(read(record, "Publish_Status"));
  const render = lower(read(record, "Render_Status"));
  const evidence = [];
  const missing = [];
  const urls = [];
  const result = (readiness, reason) => ({
    output_id: id,
    readiness,
    reason,
    missing_requirements: missing,
    evidence,
    review_asset_urls: [...new Set(urls)],
    validation_timestamp: validatedAt,
    evidence_level: "record",
  });
  if (!id) return result("UNKNOWN", "missing_record_identity");
  if (/approved|published|scheduled|skipped|cancelled|rejected/.test(status) ||
      /approved|published|scheduled/.test(publish) || review === "approved") {
    return result("BLOCKED", "past_review");
  }
  if (review === "changes requested" || read(record, "Studio_Render_Review_Hold_Active")) {
    return result("IN_PROGRESS", "revision_held");
  }
  if (/failed|error|blocked/.test(render) || /failed|error/.test(status)) {
    return result("FAILED", "required_processing_failed");
  }
  if (/ready for render|waiting in render queue|^rendering$|^queued$/.test(render) ||
      /ready for render|^rendering$/.test(status)) {
    return result("IN_PROGRESS", "render_or_preparation_active");
  }
  const native = render === "native photo route";
  const caption = string(read(record, "Output_Caption"));
  if (!caption) missing.push("Output_Caption");
  if (native) {
    const manifest = clipManifest(record);
    const clips = Array.isArray(manifest?.selected_clips) ? manifest.selected_clips : null;
    const count = Number(read(record, "Selected_Clip_Count") || 0);
    const linked = read(record, "Carousel Slides");
    const slideCount = Array.isArray(linked) ? linked.length : 0;
    const preview = string(read(record, "Studio_Preview_URL"));
    const cover = string(read(record, "Thumbnail_URL"));
    if (!(count > 0 && Number.isSafeInteger(count))) missing.push("Selected_Clip_Count");
    if (!validCdn(preview)) missing.push("Studio_Preview_URL");
    else { urls.push(preview); evidence.push("public_cdn_preview"); }
    if (!validCdn(cover)) missing.push("Thumbnail_URL");
    else { urls.push(cover); evidence.push("public_cdn_cover"); }
    if (slideCount && count && slideCount !== count) missing.push("Carousel Slides count mismatch");
    if (manifest?.invalid_json) missing.push("Selected_Assets_JSON invalid JSON");
    if (clips) {
      if (clips.length !== count) missing.push("Selected_Assets_JSON count mismatch");
      for (const clip of clips) {
        const url = string(clip?.url || clip?.src);
        if (!validCdn(url)) missing.push("Selected_Assets_JSON public image");
        else urls.push(url);
      }
      evidence.push("manifest_images:" + clips.length);
      if (manifest?.validation_status && lower(manifest.validation_status) !== "valid") {
        missing.push("Selected_Assets_JSON validation");
      }
    } else if (!slideCount) {
      // The Supabase Factory mirror omits linked Carousel Slides. Its existing
      // RFR marker + counted native selection + public CDN preview/cover are a
      // compact projection, not a verified full record. Every approval reloads
      // canonical Airtable and validates the full package + public HTTP bytes.
      if (status !== "ready for review" || !count) missing.push("Selected_Assets_JSON or Carousel Slides");
      else evidence.push("compact_status_and_selected_count:" + count);
    } else {
      evidence.push("compact_linked_slides:" + slideCount);
    }
    if (count) evidence.push("selected_count:" + count);
  } else {
    const final = string(read(record, "Final_File_URL"));
    const finalId = string(read(record, "Final_File_ID"));
    if (!final && !finalId) missing.push("Final_File_URL or Final_File_ID");
    else evidence.push("finished_video_file");
    // Only demand an explicit thumbnail where the existing workflow requires a
    // grid cover; Stories and single-image placements may have no separate cover.
    const type = lower(read(record, "Studio_Output_Type") || read(record, "Format"));
    const platform = lower(read(record, "Platform"));
    const coverOptional = /story/.test(type) ||
      (/single image|feed post/.test(type) && /facebook|instagram/.test(platform));
    if (!coverOptional && !validCdn(read(record, "Thumbnail_URL"))) missing.push("Thumbnail_URL");
  }
  if (missing.length) {
    const queued = status === "in production" && !!string(read(record, "Remotion_Job_ID"));
    return result(queued ? "IN_PROGRESS" : "BLOCKED", queued ? "active_job_missing_review_assets" : "incomplete_review_package");
  }
  return result("READY", "complete_review_package");
}

/**
 * Factory approval preflight: check the actual publicly served photo bytes,
 * not only field text. A failed or inconclusive probe is never permission.
 */
export async function verifyReviewImages(readiness, { fetchImpl = fetch } = {}) {
  if (readiness.readiness !== "READY") return readiness;
  const urls = readiness.review_asset_urls || [];
  if (!urls.length) return { ...readiness, evidence_level: "record_only" };
  const results = await Promise.all(urls.map(async url => {
    try {
      const response = await fetchImpl(url, { method: "GET", headers: { Range: "bytes=0-15" } });
      const type = String(response.headers?.get("Content-Type") || "").toLowerCase();
      try { await response.body?.cancel(); } catch {}
      return response.ok && type.startsWith("image/");
    } catch { return false; }
  }));
  if (results.every(Boolean)) return {
    ...readiness, evidence_level: "http_probed",
    evidence: [...readiness.evidence, "public_assets_http_verified:" + urls.length],
  };
  return {
    ...readiness, readiness: "BLOCKED", reason: "review_asset_unreachable",
    missing_requirements: [...readiness.missing_requirements,
      ...urls.filter((_, index) => !results[index]).map(() => "public review image unreachable")],
    evidence_level: "http_probe_failed",
  };
}

export function safeReviewPromotion(record, readiness) {
  if (readiness?.readiness !== "READY") return false;
  const status = lower(read(record, "Output_Status"));
  const review = lower(read(record, "Review_Status"));
  const publish = lower(read(record, "Publish_Status"));
  const render = lower(read(record, "Render_Status"));
  return status === "in production"
    && (!review || review === "pending" || review === "review sent")
    && (!publish || publish === "not ready")
    && !read(record, "Studio_Render_Review_Hold_Active")
    && !read(record, "Do_Not_Publish")
    && (render === "native photo route" || render === "rendered")
    && !/ready for render|waiting|rendering/.test(render);
}

/**
 * Held creative revisions belong in Needs Eyes for preview/send-back only.
 * They are NOT eligible for Approve: the separate Do_Not_Publish and review
 * hold checks continue to prohibit all approval and publishing routes.
 */
export function factoryReviewVisibility(record, readiness, studioState, creativeAvailable) {
  const heldVisible = read(record, "Studio_Render_Review_Hold_Active") === true
    && read(record, "Do_Not_Publish") === true
    && lower(read(record, "Output_Status")) === "ready for review"
    && lower(read(record, "Review_Status")) === "review sent"
    && creativeAvailable === true;
  return {
    visible: studioState === "Ready for Review"
      && (readiness?.readiness === "READY" || heldVisible),
    incomplete: lower(read(record, "Output_Status")) === "ready for review"
      && readiness?.readiness !== "READY" && !heldVisible,
    held_preview_only: heldVisible,
  };
}
