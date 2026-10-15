// Canonical definition for the Studio home "Scheduled posts" columns:
// approved and internally scheduled, but not yet handed off to a platform.
export function isQueuedForPlatformDispatch(row, now = Date.now()) {
  if (!row || !["Facebook", "Instagram", "TikTok", "YouTube"].includes(String(row.platform || "").trim())) return false;
  const val = (key) => String(row[key] ?? "").trim();
  const state = val("studio_state").toLowerCase();
  const review = val("review_status").toLowerCase();
  const output = val("output_status").toLowerCase();
  const publish = val("publish_status").toLowerCase();
  if (row.do_not_publish) return false;
  // Do not interpret a provisional scheduling date as approval.
  if (!(review === "approved" || output.includes("approved for publishing") || output === "approved")) return false;
  if (/ready for review|awaiting approval|in production|rendering|preparing|failed|retry|skipped|manual action|draft delivered|platform processing|published/i.test(state)) return false;
  if (/failed|error|cancelled|canceled|skipped|published|publishing|uploading|processing|draft delivered|manual publish required/i.test(publish)) return false;
  if (row.published_at || row.platform_post_url || row.manual_published_url || row.platform_post_id) return false;
  if (val("manual_completion_status").match(/complete|published/i)) return false;
  const dateValue = row.scheduled_at || row.scheduled_post_date || row.youtube_scheduled_publish_at;
  if (!dateValue) return false;
  const scheduledTime = Date.parse(String(dateValue));
  if (!Number.isFinite(scheduledTime) || scheduledTime <= now) return false;
  if (row.platform === "YouTube") {
    // Private uploads are *already on YouTube*, even though not public.
    if (row.youtube_video_id || /uploaded|processing|succeeded|complete/i.test(val("youtube_upload_status"))) return false;
  }
  if (row.platform === "TikTok") {
    if (/delivered|sent|uploaded|publish complete|processing|uploading/i.test(val("tiktok_draft_status"))) return false;
  }
  if (row.platform === "Facebook") {
    if (/publishing|processing|uploading|published|completed|posted/i.test(val("facebook_publish_status") + " " + val("facebook_slideshow_status"))) return false;
  }
  if (row.platform === "Instagram") {
    if (/publishing|processing|uploaded|published|completed|posted/i.test(val("instagram_carousel_status") + " " + val("instagram_story_status"))) return false;
  }
  return true;
}

export function countPendingPlatformDispatch(rows, now = Date.now()) {
  const counts = { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 };
  for (const row of rows || []) {
    if (isQueuedForPlatformDispatch(row, now)) counts[row.platform] += 1;
  }
  return counts;
}
