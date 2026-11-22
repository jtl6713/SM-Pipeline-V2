/**
 * #2563: transparent, non-publishing follow-up for previously false Meta review
 * decisions. A repair marker is not permission to upload, schedule or approve.
 *
 * A source row is admitted only by exact recovery provenance and an active
 * publication hold. The status must NOT need "Changes Requested" to be found.
 */
export const META_REVIEW_RECOVERY_MARKER = "SM_False_Changes_Requested_Recovery_2563";
const validId = value => /^rec[A-Za-z0-9]{14}$/.test(String(value || ""));
const plain = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
const blank = value => value == null || String(value).trim() === "";
const platforms = new Set(["Facebook", "Instagram"]);
const reasons = Object.freeze({
  provider_reconciliation_required: {
    category: "Meta publication verification",
    next_step: "Studio must check the exact Meta publication and child/parent receipts, reconcile any existing post, then repair media or retry only when verified.",
  },
  provider_preflight_required: {
    category: "Meta dispatch preflight",
    next_step: "Studio must inspect prior dispatch, validate the output-specific media, and restore scheduling only after the required review.",
  },
  production_media_recovery_required: {
    category: "Creative media / gallery repair",
    next_step: "Studio must check the selected media, rebuild missing gallery or video assets, verify accessible URLs, and return the completed package for normal Factory review.",
  },
});
function marker(bag) {
  const entry = bag?.[META_REVIEW_RECOVERY_MARKER];
  return plain(entry) && entry.issue === 2563
    && entry.operation === "false_human_revision_reclassification" ? entry : null;
}
function safeRow(row, bag) {
  return Boolean(marker(bag))
    && platforms.has(row.platform)
    && row.output_status === "In Production"
    && blank(row.review_status)
    && row.do_not_publish === true
    && row.auto_publish_enabled === false
    && blank(row.test_run_id)
    && blank(row.published_at)
    && blank(row.platform_post_url)
    && row.publish_status !== "Published";
}
export function metaReviewRecoverySourceRow(row) {
  return Boolean(row && validId(row.airtable_record_id)
    && safeRow(row, row.error_messages));
}
export function metaReviewRecoveryShapedRecord(record) {
  const f = record?.fields;
  return Boolean(validId(record?.id) && plain(f)
    && safeRow({
      platform: f.Platform, output_status: f.Output_Status,
      review_status: f.Review_Status, do_not_publish: f.Do_Not_Publish,
      auto_publish_enabled: f.Auto_Publish_Enabled, test_run_id: f.Test_Run_ID,
      published_at: f.Published_At, platform_post_url: f.Platform_Post_URL,
      publish_status: f.Publish_Status,
    }, f));
}
/**
 * Evidence-based asset diagnosis. A missing video file is actionable. Photo
 * sets and carousels publish from per-slide media, so a blank Final_File_URL
 * alone is NOT proof that images are missing.
 */
export function metaRecoveryMediaDiagnostic(fields = {}) {
  const platform = String(fields.Platform || "");
  const type = String(fields.Studio_Output_Type || fields.Platform_Output_Type || fields.Format || "").toLowerCase();
  const isGallery = /carousel|multi-image|photo set/.test(type);
  const isVideo = /reel|story|video/.test(type) && !isGallery;
  const hasVideo = Boolean(String(fields.Final_File_URL || fields.Publish_Asset_URL || "").trim());
  const error = [fields.Publish_Error_Message,fields.IG_Carousel_Error_Message,fields.FB_Slideshow_Error_Message,
    fields.Studio_Publish_Dispatch_Note].map(v => String(v || "")).join(" ");
  const missing = [];
  if (isVideo && !hasVideo) missing.push("Final publishable video not recorded");
  if (isGallery && /no C9 final slides|no final slides|missing.*slides|not enough.*slides|no frames/i.test(error))
    missing.push("Final gallery slides missing or incomplete");
  if (isGallery && /child.*(missing|fail|mismatch)|AP1C|AP0C/i.test(error)
      && !missing.length) missing.push("Gallery child/slide preparation needs verification");
  return {
    missing_assets: missing,
    asset_evidence: missing.length ? "missing_or_incomplete" : "not_yet_verified",
    asset_message: missing.length
      ? missing.join("; ")
      : isGallery
        ? "Final gallery images and their public URLs have not been independently verified; a blank video-file field is normal for photo galleries."
        : isVideo ? "Media and provider delivery still require verification." : "Output media requires verification.",
    platform,
  };
}

export function metaReviewRecoverySummary(record) {
  if (!metaReviewRecoveryShapedRecord(record)) return null;
  const f = record.fields, evidence = marker(f);
  const spec = reasons[evidence.reason] || reasons.production_media_recovery_required;
  const media = metaRecoveryMediaDiagnostic(f);
  const assetProblem = media.missing_assets.length > 0;
  const nextAction = assetProblem
    ? "Studio must restore or regenerate missing media, verify the final URLs and gallery counts, then run the required provider/review checks."
    : spec.next_step;
  return {
    issue: 2563, recovery_reason: evidence.reason,
    category: spec.category,
    status: "Studio repair required",
    next_step: nextAction,
    missing_assets: media.missing_assets,
    asset_evidence: media.asset_evidence,
    asset_message: media.asset_message,
    action_status: assetProblem ? "Missing media — Studio repair required" : spec.category + " — verification pending",
    recovery_owner: "Studio automation / repair",
    completion_condition: "Asset URLs checked, provider result reconciled, and Factory review/approval completed.",
    action_owner: "studio",
    user_action_required: false,
    user_instruction: "No action from you yet. Studio needs to complete the listed repair and verify the result.",
    published: false, can_approve: false, can_retry: false, can_publish: false,
  };
}
