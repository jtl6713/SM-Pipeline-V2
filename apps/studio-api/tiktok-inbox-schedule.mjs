/** TikTok inbox drafts land ~15 minutes before Scheduled_Post_Date so Joseph can post immediately. */
export const STUDIO_TIKTOK_INBOX_LEAD_MS = 15 * 60 * 1000;

export const STUDIO_TIKTOK_INBOX_LEAD_MINUTES = 15;

/** Airtable: scheduled time is blank or within the inbox lead window. */
export const STUDIO_TIKTOK_INBOX_DUE_FORMULA = `OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},DATEADD(NOW(),${STUDIO_TIKTOK_INBOX_LEAD_MINUTES},'minutes')))`;

/** Airtable: non-TikTok at/after schedule, or TikTok inside the inbox lead window. */
export const STUDIO_PUBLISH_RECONCILE_SCHEDULE_FORMULA = `OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW()),AND({Platform}="TikTok",IS_BEFORE({Scheduled_Post_Date},DATEADD(NOW(),${STUDIO_TIKTOK_INBOX_LEAD_MINUTES},'minutes'))))`;

export function studioPublishScheduledMs(record, scheduledPostDate = null) {
  const raw = scheduledPostDate != null
    ? String(scheduledPostDate || "").trim()
    : String(record?.fields?.Scheduled_Post_Date ?? record?.Scheduled_Post_Date ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

export function studioTikTokInboxIsDue(record, nowMs = Date.now(), leadMs = STUDIO_TIKTOK_INBOX_LEAD_MS) {
  const ms = studioPublishScheduledMs(record);
  if (ms == null) return true;
  return ms <= nowMs + leadMs;
}

export function studioTikTokArmedDraftStatus(record, scheduledPostDate = null, nowMs = Date.now(), leadMs = STUDIO_TIKTOK_INBOX_LEAD_MS) {
  return studioTikTokInboxIsDue({ ...record, fields: { ...(record?.fields || {}), Scheduled_Post_Date: scheduledPostDate ?? record?.fields?.Scheduled_Post_Date ?? record?.Scheduled_Post_Date } }, nowMs, leadMs)
    ? "Ready for Assets"
    : "Waiting for Schedule";
}
