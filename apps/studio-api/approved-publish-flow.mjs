/**
 * Supabase SoR publishing admission for the independent five-minute flow.
 * This is deliberately NOT the backlog recovery gate: any ambiguous historical
 * dispatch must be verified against its provider before it can be retried.
 */
import { STORY_2915_ID, story2915DispatchFence } from "./story-expired-generation-2915.mjs";
const field = (r, name, snake) => r?.fields?.[name] ?? r?.[snake] ?? r?.error_messages?.[name] ?? null;
const str = v => String(v ?? "").trim();
const checked = v => v === true || v === 1 || str(v).toLowerCase() === "true";
const present = v => str(v).length > 0;
const time = v => {
  const ms = Date.parse(str(v));
  return Number.isFinite(ms) ? ms : null;
};

export function assessFreshSupabasePublish(row, { nowMs = Date.now() } = {}) {
  const read = (name, snake) => field(row, name, snake);
  const block = reason => ({ eligible: false, reason });
  if (!/^rec[A-Za-z0-9]{14}$/.test(str(row?.id))) return block("invalid_record_id");
  if (!Number.isFinite(nowMs)) return block("invalid_clock");
  if (present(read("Test_Run_ID", "test_run_id"))) return block("test_output");
  if (checked(read("Do_Not_Publish", "do_not_publish"))) return block("do_not_publish");
  if (!checked(read("Auto_Publish_Enabled", "auto_publish_enabled"))) return block("auto_publish_disabled");
  if (str(read("Review_Status", "review_status")) !== "Approved" ||
      str(read("Output_Status", "output_status")) !== "Approved for Publishing") return block("not_final_approved");
  if (!["Ready to Publish", "Ready to Schedule"].includes(str(read("Publish_Status", "publish_status")))) return block("not_ready_for_initial_dispatch");
  if (present(read("Published_At", "published_at")) ||
      present(read("Platform_Post_URL", "platform_post_url")) ||
      present(read("Manual_Published_URL", "manual_published_url"))) return block("existing_publication_receipt");

  if(row.id===STORY_2915_ID){try{story2915DispatchFence(row)}catch{return block("expired_story_replacement_generation_unverified")}}
  // An old approval-time "scheduled-hold" was incorrectly counted as
  // dispatch #1 before the due time. Do not erase that historical marker.
  // Only explicit, immutable, per-output reconciliation proof may admit that
  // *single* fake attempt to the same fenced first-publish path. The proof is
  // not a provider receipt; ambiguous/multi-dispatch rows remain blocked.
  const dispatchCount = Number(read("Studio_Publish_Dispatch_Count", "studio_publish_dispatch_count") || 0);
  const providerAttempts = Number(read("Publish_Attempt_Count", "publish_attempt_count") || 0);
  const dispatchAt = time(read("Studio_Publish_Dispatch_At", "studio_publish_dispatch_at"));
  const slotAt = time(read("Scheduled_Post_Date", "scheduled_post_date"));
  const auditedEarlyHold =
    dispatchCount === 1 && providerAttempts === 0 &&
    str(read("Studio_Early_Hold_Recovery_Proof", "studio_early_hold_recovery_proof")) ===
      "issue-2340-scheduled-hold-v1" &&
    dispatchAt !== null && slotAt !== null && dispatchAt < slotAt &&
    time(read("Studio_Early_Hold_Original_Dispatch_At", "studio_early_hold_original_dispatch_at")) === dispatchAt &&
    time(read("Studio_Early_Hold_Original_Scheduled_At", "studio_early_hold_original_scheduled_at")) === slotAt;
  if (!Number.isFinite(dispatchCount) || !Number.isFinite(providerAttempts) ||
      providerAttempts !== 0 || (dispatchCount !== 0 && !auditedEarlyHold))
    return block("previous_attempt_requires_provider_reconciliation");
  for (const name of [
    "Studio_Publish_Dispatch_At", "Publish_Started_At", "Last_Publish_Attempt_At",
    "Platform_Post_ID", "Platform_Media_ID", "YouTube_Video_ID", "IG_Story_Container_ID",
    "IG_Story_Post_ID", "Instagram_Reel_Container_ID",
    "IG_Carousel_Parent_Container_ID", "IG_Carousel_Published_Media_ID",
    "FB_Slideshow_Meta_Video_ID", "TikTok_Draft_Publish_ID",
  ]) {
    if (name === "Studio_Publish_Dispatch_At" && auditedEarlyHold) continue;
    if (present(read(name, name.toLowerCase()))) return block("prior_provider_or_dispatch_identity");
  }
  // Publish_Retry_Eligible=false forbids another attempt, not the first-ever
  // publish of an approved output. The zero-attempt and remote-identity checks
  // above already prove fresh admission; a future retry/cooldown remains held.
  const retryAt = time(read("Publish_Next_Retry_At", "publish_next_retry_at"));
  if (retryAt !== null && retryAt > nowMs) return block("retry_cooldown");
  const lockBy = read("Publish_Locked_By", "publish_locked_by");
  const lockAt = time(read("Publish_Locked_At", "publish_locked_at"));
  if (present(lockBy) && (lockAt === null || nowMs - lockAt < 15 * 60000)) return block("active_publish_lock");

  const platform = str(read("Platform", "platform"));
  const dueAt = time(read("Scheduled_Post_Date", "scheduled_post_date"));
  if (dueAt === null) return block("schedule_required");
  if (dueAt > nowMs + (platform === "TikTok" ? 15 * 60000 : 0)) return block("future_schedule");
  // A manual fallback or a provider error is NOT an initial ready state.
  const fb = str(read("FB_Publish_Status", "fb_publish_status"));
  if (fb && fb !== "Ready for Assets") return block("facebook_stage_not_fresh");
  const story = str(read("IG_Story_Status", "ig_story_status"));
  if (story && !["Not Needed", "Ready"].includes(story)) return block("instagram_story_stage_not_fresh");
  const carousel = str(read("IG_Carousel_Status", "ig_carousel_status"));
  if (carousel && !["Not Selected", "Ready for Asset Prep"].includes(carousel)) return block("carousel_stage_requires_continuation");
  const tiktok = str(read("TikTok_Draft_Status", "tiktok_draft_status"));
  if (tiktok && !["Not Selected", "Ready for Assets", "Waiting for Schedule"].includes(tiktok)) return block("tiktok_stage_requires_continuation");
  const fbSlide = str(read("FB_Slideshow_Status", "fb_slideshow_status"));
  if (fbSlide && !["Not Required", "Ready to Render"].includes(fbSlide)) return block("facebook_slideshow_stage_not_fresh");

  // A fresh record can still be incomplete. Never start a provider upload
  // merely because it is marked Ready to Publish.
  const outputType = str(read("Platform_Output_Type", "platform_output_type"));
  const final = present(read("Final_File_URL", "final_file_url")) || present(read("Publish_Asset_URL", "publish_asset_url"));
  const imageCount = Number(read("Image_Count", "image_count") || 0);
  const readyCount = Number(read("Assets_Ready_Count", "assets_ready_count") || 0);
  const photo = /(?:Photo Set|Carousel|Photo|Image)/i.test(outputType);
  if (photo && !(readyCount > 0 && imageCount > 0 && readyCount >= imageCount) && !final)
    return block("media_not_ready");
  if (!photo && !final) return block("media_not_ready");
  if (!present(read("Output_Caption", "output_caption"))) return block("caption_not_ready");
  return { eligible: true, reason: auditedEarlyHold
    ? "audited_pre_schedule_hold_first_publish" : "fresh_approved_due_unattempted" };
}
