/** #2374: bounded, Supabase-only protected media rework visibility.
 *
 * These records were deliberately disarmed because their creative package was
 * not complete. "Visible for manual repair" NEVER means review-ready or
 * authorized to create provider media, clear DNP, retry or schedule.
 */
export const PROTECTED_MEDIA_REWORK_MARKER = "Studio_Overdue_Preflight_Repair_20261120";
export const NEW_MEDIA_REWORK_MARKER = "Studio_Overdue_UnsafeGallery_Hold_20261121";
function sourceHold(row) {
  return isObject(row?.[PROTECTED_MEDIA_REWORK_MARKER])
    ? row[PROTECTED_MEDIA_REWORK_MARKER]
    : isObject(row?.[NEW_MEDIA_REWORK_MARKER])
      ? row[NEW_MEDIA_REWORK_MARKER] : null;
}

const recordId = (value) => /^rec[A-Za-z0-9]{14}$/.test(String(value || ""));
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isBlank = (value) => value == null || String(value).trim() === "";

/** Validate canonical typed Supabase source before importing a held row. */
export function protectedMediaReworkSourceRow(row) {
  if (!row || !recordId(row.airtable_record_id)) return false;
  if (!sourceHold(row.error_messages)) return false;
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
  if (!sourceHold(fields)) return false;
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
 * Preview ONLY an independently audited, complete, output-specific original
 * 4:5 image sequence. Never interpret these URLs as newly staged, approved,
 * linked C9 slides or remotely created provider media.
 */
export function protectedMediaReworkOriginalPreviewGallery(record) {
  if (!protectedMediaReworkShapedRecord(record)) return null;
  const evidence = record.fields.Studio_Recovery_IG_Original_Preview_Gallery_Verified_20261121;
  if (!isObject(evidence)) return null;
  const urls = evidence.candidate_original_image_urls;
  const n = evidence.expected_image_count;
  if (!Array.isArray(urls) || urls.length < 2 || urls.length > 10
      || !Number.isInteger(n) || n !== urls.length
      || evidence.verified_4x5_image_count !== n
      || evidence.source_class !== "original_output_preview_folder"
      || evidence.verification_type !== "read_only_cdn_http_decoded_image_header"
      || evidence.original_slide_records_present !== false
      || evidence.original_factory_approved_slide_identity_proven !== false
      || evidence.fresh_factory_creative_review_required !== true
      || evidence.ap0c_instagram_public_asset_staging_done !== false
      || evidence.owner_original_provider_publication_proven !== false
      || evidence.new_publish_retry_authorized !== false) return null;
  const pattern = new RegExp(
    "^https://media\\.chicagoshining\\.com/studio/previews/(lettered|watermarked)/"
    + record.id + "/([0-9])\\.jpg$"
  );
  if (!urls.every((url, index) =>
    typeof url === "string" && pattern.exec(url)?.[2] === String(index)
  )) return null;
  return {
    urls: [...urls],
    count_mismatch: evidence.parent_count_mismatch_requires_manual_review === true,
  };
}

/** No sensitive provider fields or raw error_messages go into Factory cards. */
export function protectedMediaReworkSummary(record) {
  if (!protectedMediaReworkShapedRecord(record)) return null;
  const fields = record.fields;
  const evidence = sourceHold(fields);
  const previewSequence = isObject(
    fields.Studio_Recovery_IG_Original_Preview_Gallery_Verified_20261121
  );
  const incompleteOriginal = isObject(
    fields.Studio_Recovery_IG_Original_Preview_Gallery_Needs_Rebuild_20261121
  );
  const originalGallery = protectedMediaReworkOriginalPreviewGallery(record);
  const verifiedSource = Boolean(
    isObject(fields.Studio_Recovery_Source_Gallery_Verified_20261121)
      || isObject(fields.Studio_Recovery_IG_Source_Gallery_Verified_20261121)
      || previewSequence
  );
  return {
    media_rework: true,
    source_inventory_verified: verifiedSource,
    // Exact public JPEGs for the human gallery preview only. No IG/R2 stage.
    original_image_previews: originalGallery?.urls || [],
    source_count_mismatch: originalGallery?.count_mismatch === true,
    stage: String(evidence.stage || evidence.reason || "Creative package repair").slice(0, 100),
    next_step: previewSequence
      ? "Original public preview sequence verified, but no Final Approved slide records. Reconstruct the exact creative gallery and stage only after fresh Factory review."
      : incompleteOriginal
        ? "Original source folder incomplete or wrong aspect. Rebuild the 4:5 gallery and obtain fresh Factory approval."
        : verifiedSource
          ? "Existing source images verified. Complete platform staging, inspect preview and request fresh Factory approval."
          : "Rebuild or reconcile the original missing media/slide package, inspect preview and request fresh Factory approval.",
    can_approve: false,
    can_retry: false,
    can_publish: false,
  };
}
