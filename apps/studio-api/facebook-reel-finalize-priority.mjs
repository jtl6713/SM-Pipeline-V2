/** Facebook Reel already-uploaded video polling, no new Meta Reel creation.
 * Provider status/created_time is authoritative; an upload receipt is not publication.
 */
export const FACEBOOK_REEL_POLL_FORMULA =
  'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Platform_Output_Type}="Facebook Reel",' +
  '{Do_Not_Publish}=0,{Publish_Status}!="Published",{Published_At}=BLANK(),' +
  'OR({FB_Slideshow_Status}="Reel Processing",{FB_Slideshow_Status}="Published Pending Finalize"),' +
  'OR({FB_Slideshow_Meta_Video_ID}!="",{Platform_Post_ID}!=""),' +
  'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))';

const value = (row, key) => String(row?.fields?.[key] ?? row?.[key] ?? "").trim();
const field = (row, key) => row?.fields?.[key] ?? row?.[key];

export function facebookReelPollVideoId(row) {
  const media = value(row, "FB_Slideshow_Meta_Video_ID");
  const post = value(row, "Platform_Post_ID");
  if (media && post && media !== post) return "";
  const id = media || post;
  return /^\d{6,30}$/.test(id) ? id : "";
}

export function facebookReelPollEligible(row, nowMs = Date.now()) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(row?.id || ""))) return false;
  if (value(row, "Platform") !== "Facebook" ||
      value(row, "Platform_Output_Type") !== "Facebook Reel" ||
      !["Reel Processing", "Published Pending Finalize"].includes(value(row, "FB_Slideshow_Status")) ||
      value(row, "Publish_Status") === "Published" ||
      value(row, "Output_Status") === "Published" ||
      value(row, "Published_At") || value(row, "Test_Run_ID") ||
      field(row, "Do_Not_Publish") === true ||
      value(row, "Publish_Locked_At") || value(row, "Publish_Locked_By")) return false;
  const dueAt = Date.parse(value(row, "Publish_Next_Retry_At"));
  if (Number.isFinite(dueAt) && dueAt > nowMs) return false;
  return Boolean(facebookReelPollVideoId(row));
}

export function selectFacebookReelPollBatch(rows, {limit=3, nowMs=Date.now()} = {}) {
  const bound = Math.max(1, Math.min(4, Math.trunc(Number(limit) || 3)));
  return (Array.isArray(rows) ? rows : [])
    .filter(row => facebookReelPollEligible(row, nowMs))
    .sort((a,b) => (Date.parse(value(a,"FB_Slideshow_Last_Checked_At"))||0) -
                    (Date.parse(value(b,"FB_Slideshow_Last_Checked_At"))||0) ||
                   String(a.id).localeCompare(String(b.id)))
    .slice(0,bound);
}
