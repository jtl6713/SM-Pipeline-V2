/** #2374: bounded, Supabase-only protected media rework visibility.
 *
 * These records were deliberately disarmed because their creative package was
 * not complete. "Visible for manual repair" NEVER means review-ready or
 * authorized to create provider media, clear DNP, retry or schedule.
 */
export const PROTECTED_MEDIA_REWORK_MARKER = "Studio_Overdue_Preflight_Repair_20261120";

const recordId = (value) => /^rec[A-Za-z0-9]{14}$/.test(String(value || ""));
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isBlank = (value) => value == null || String(value).trim() === "";

/** Validate canonical typed Supabase source before importing a held row. */
export function protectedMediaReworkSourceRow(row) {
  if (!row || !recordId(row.airtable_record_id)) return false;
  if (!isObject(row.error_messages?.[PROTECTED_MEDIA_REWORK_MARKER])) return false;
  return row.review_status === "Changes Requested"
    && row.output_status === "Changes Requested"
    && row.publish_status === "Not Ready"
    && row.do_not_publish === true
    && row.auto_publish_enabled === false
    && row.publish_retry_eligible === false
    && isBlank(row.test_run_id)
    && isBlank(row.scheduled_post_date)
    && isBlank(row.studio_scheduled_at)
    && isBlank(row.youtube_scheduled_publish_at)
    && isBlank(row.published_at)
    && isBlank(row.platform_post_url);
}

/** Defense in depth after Supabase rows are shaped for Factory/Operations. */
export function protectedMediaReworkShapedRecord(record) {
  const fields = record?.fields;
  if (!recordId(record?.id) || !isObject(fields)) return false;
  if (!isObject(fields[PROTECTED_MEDIA_REWORK_MARKER])) return false;
  return fields.Review_Status === "Changes Requested"
    && fields.Output_Status === "Changes Requested"
    && fields.Publish_Status === "Not Ready"
    && fields.Do_Not_Publish === true
    && fields.Auto_Publish_Enabled === false
    && fields.Publish_Retry_Eligible === false
    && isBlank(fields.Test_Run_ID)
    && isBlank(fields.Scheduled_Post_Date)
    && isBlank(fields.Studio_Scheduled_At)
    && isBlank(fields.YouTube_Scheduled_Publish_At)
    && isBlank(fields.Published_At)
    && isBlank(fields.Platform_Post_URL);
}

/**
 * Six #2374 held original Instagram preview folders have individually verified
 * 4:5 JPEG sequences. Expose image URLs to Factory for READ-ONLY human review,
 * never as AP0C staging receipts, Final Approved slides or upload authority.
 * Incomplete/incorrect-aspect galleries (including #10813) stay unavailable.
 */
export function protectedMediaReworkPreviewGallery(record) {
  if (!protectedMediaReworkShapedRecord(record)) return [];
  const proof = record.fields.Studio_Recovery_IG_Original_Preview_Gallery_Verified_20261121;
  if (!isObject(proof)
      || proof.source_class !== "original_output_preview_folder"
      || proof.original_slide_records_present !== false
      || proof.original_factory_approved_slide_identity_proven !== false
      || proof.ap0c_instagram_public_asset_staging_done !== false
      || proof.fresh_factory_creative_review_required !== true) return [];
  const count = proof.expected_image_count;
  if (!Number.isInteger(count) || count < 2 || count > 10
      || proof.verified_4x5_image_count !== count) return [];
  const urls = proof.candidate_original_image_urls;
  if (!Array.isArray(urls) || urls.length !== count) return [];
  const id = record.id;
  const prefixes = [
    `https://media.chicagoshining.com/studio/previews/lettered/${id}/`,
    `https://media.chicagoshining.com/studio/previews/watermarked/${id}/`,
  ];
  // Every index must be exact, in order, from the same original output folder.
  const selected = prefixes.find(prefix => urls.every((url, index) =>
    typeof url === "string" && url === `${prefix}${index}.jpg`));
  return selected ? [...urls] : [];
}

/** No sensitive provider fields or raw error_messages go into Factory cards. */
export function protectedMediaReworkSummary(record) {
  if (!protectedMediaReworkShapedRecord(record)) return null;
  const fields = record.fields;
  const evidence = fields[PROTECTED_MEDIA_REWORK_MARKER];
  const previewSequence = isObject(
    fields.Studio_Recovery_IG_Original_Preview_Gallery_Verified_20261121
  );
  const incompleteOriginal = isObject(
    fields.Studio_Recovery_IG_Original_Preview_Gallery_Needs_Rebuild_20261121
  );
  const verifiedSource = Boolean(
    isObject(fields.Studio_Recovery_Source_Gallery_Verified_20261121)
      || isObject(fields.Studio_Recovery_IG_Source_Gallery_Verified_20261121)
      || previewSequence
  );
  const originalGalleryImages = protectedMediaReworkPreviewGallery(record);
  return {
    media_rework: true,
    source_inventory_verified: verifiedSource,
    preview_gallery_urls: originalGalleryImages,
    stage: String(evidence.stage || "Creative package repair").slice(0, 100),
    next_step: previewSequence
      ? "Original public preview sequence verified, but no Final Approved slide records. Reconstruct the exact creative gallery and stage only after fresh Factory review."
      : incompleteOriginal
        ? "Original source folder incomplete or wrong aspect. Rebuild the 4:5 gallery and obtain fresh Factory approval."
        : verifiedSource
          ? "Existing source images verified. Complete platform staging, inspect preview and request fresh Factory approval."
          : "Rebuild or reconcile the original media package, inspect preview and request fresh Factory approval.",
    can_approve: false,
    can_retry: false,
    can_publish: false,
  };
}
