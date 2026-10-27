/**
 * A successful TikTok inbox-draft email handoff is an operationally fulfilled
 * dispatch obligation, NOT proof of a public TikTok post.
 *
 * The customer tracks publication in the separate Manual Needed view.
 * Suppress only Past Due / missing-schedule classifications once both the
 * draft-delivered state and durable email-sent timestamp exist. Never set
 * Published, infer a confirmation URL, or bypass failures/holds.
 */
const read=(row,normalized,airtable)=>row?.[normalized] ?? row?.[airtable]
  ?? row?.fields?.[airtable] ?? row?.fields?.[normalized] ?? null;
export const TIKTOK_EMAILED_DRAFT_STATUSES=Object.freeze([
  "Draft Delivered — Manual Action Required",
  "Manual Completion Received",
]);
export function isTikTokEmailedManualHandoff(row) {
  const platform=String(read(row,"platform","Platform")||"").trim();
  const status=String(read(row,"tiktok_draft_status","TikTok_Draft_Status")||"").trim();
  const emailSent=String(read(row,"tiktok_draft_email_sent_at","TikTok_Draft_Email_Sent_At")||"").trim();
  return platform==="TikTok" && Boolean(emailSent) && TIKTOK_EMAILED_DRAFT_STATUSES.includes(status);
}
export const TIKTOK_NOT_EMAILED_HANDOFF_AIRTABLE_FORMULA =
  'NOT(AND({Platform}="TikTok",{TikTok_Draft_Email_Sent_At}!=BLANK(),'
  + 'OR({TikTok_Draft_Status}="Draft Delivered — Manual Action Required",'
  + '{TikTok_Draft_Status}="Manual Completion Received")))';
