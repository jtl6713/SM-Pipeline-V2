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

/** No sensitive provider fields or raw error_messages go into Factory cards. */
export function protectedMediaReworkSummary(record) {
  if (!protectedMediaReworkShapedRecord(record)) return null;
  const fields = record.fields;
  const evidence = fields[PROTECTED_MEDIA_REWORK_MARKER];
  const verifiedSource = Boolean(
    isObject(fields.Studio_Recovery_Source_Gallery_Verified_20261121)
      || isObject(fields.Studio_Recovery_IG_Source_Gallery_Verified_20261121)
  );
  return {
    media_rework: true,
    source_inventory_verified: verifiedSource,
    stage: String(evidence.stage || "Creative package repair").slice(0, 100),
    next_step: verifiedSource
      ? "Existing source images verified. Complete platform staging, inspect preview and request fresh Factory approval."
      : "Rebuild or reconcile the original media package, inspect preview and request fresh Factory approval.",
    can_approve: false,
    can_retry: false,
    can_publish: false,
  };
}
