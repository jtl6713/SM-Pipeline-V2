/**
 * Pure Airtable Platform Output projection for Rendering Review.
 * This module is intentionally read-only and has zero database operations.
 * All schedule mutations remain with the shared reservation authority.
 */
export function renderingReviewOutputView(record, readField, holdActiveField) {
  if (!record?.id || typeof readField !== "function") return null;
  const f = key => readField(record,key);
  const text = x => String(x ?? "").trim();
  const choice = x => typeof x==="string" ? x : text(x?.name);
  const linkedId = x => {
    if (Array.isArray(x)) return linkedId(x[0]);
    if (typeof x==="string") return x;
    if (x?.linkedRecordIds?.length) return x.linkedRecordIds[0];
    return x?.id || "";
  };
  const outputType = choice(f("Platform_Output_Type")) ||
    (choice(f("Studio_Output_Type"))==="Reel" ? "Instagram Reel" : choice(f("Studio_Output_Type")));
  return {
    id:record.id,
    profile_id:linkedId(f("Content_Profile")),
    output_type:outputType,
    platform:choice(f("Platform")),
    output_status:choice(f("Output_Status")),
    publish_status:choice(f("Publish_Status")),
    render_status:choice(f("Render_Status")),
    final_file_id:text(f("Final_File_ID")),
    final_file_url:text(f("Final_File_URL")),
    platform_post_id:text(f("Platform_Post_ID")),
    platform_media_id:text(f("Platform_Media_ID")),
    platform_post_url:text(f("Platform_Post_URL")),
    published_at:text(f("Published_At")),
    publish_started_at:text(f("Publish_Started_At")),
    publish_locked_at:text(f("Publish_Locked_At")),
    publish_locked_by:text(f("Publish_Locked_By")),
    scheduled_post_date:text(f("Scheduled_Post_Date")),
    studio_scheduled_at:text(f("Studio_Scheduled_At")),
    youtube_scheduled_publish_at:text(f("YouTube_Scheduled_Publish_At")),
    approved_attempt_id:choice(f("Review_Status"))==="Approved" ? "legacy-approved-attempt" : null,
    do_not_publish:Boolean(f("Do_Not_Publish")),
    review_hold_active:Boolean(f(holdActiveField)),
  };
}
