/**
 * Issue #2374: Evidence-only classification of overdue publisher outputs.
 *
 * A creation container, upload, inbox draft, webhook receipt, or old dispatch
 * counter is never proof of a published post.  This helper has no network,
 * mutation or scheduling privileges and deliberately never authorizes retry.
 *
 * Accepts canonical Studio `row.fields` values; caller must independently
 * verify that a record is approved, overdue and lacks an authoritative receipt.
 */
const nonempty = value => String(value ?? "").trim().length > 0;
const positive = value => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0;
};

export const OVERDUE_PROVIDER_EVIDENCE_LANES = Object.freeze([
  "youtube_existing_video_id",
  "tiktok_existing_draft_id",
  "instagram_story_existing_creation_container",
  "instagram_carousel_existing_parent_container",
  "saved_post_id_needs_authenticated_account_get",
  "published_label_without_saved_public_receipt",
  "prior_dispatch_without_saved_remote_identity",
  "no_saved_dispatch_provider_preflight_required",
]);

export function classifyOverdueProviderEvidence(fields = {}) {
  const f = fields?.fields ?? fields ?? {};
  const platform = String(f.Platform || "").trim();
  let lane;
  if (platform === "YouTube" && nonempty(f.YouTube_Video_ID))
    lane = "youtube_existing_video_id";
  else if (platform === "TikTok" && nonempty(f.TikTok_Draft_Publish_ID))
    lane = "tiktok_existing_draft_id";
  else if (platform === "Instagram" && nonempty(f.IG_Story_Container_ID))
    lane = "instagram_story_existing_creation_container";
  else if (platform === "Instagram" && nonempty(f.IG_Carousel_Parent_Container_ID))
    lane = "instagram_carousel_existing_parent_container";
  else if ([f.Platform_Post_ID, f.Platform_Media_ID, f.IG_Carousel_Published_Media_ID, f.IG_Story_Post_ID]
    .some(nonempty))
    lane = "saved_post_id_needs_authenticated_account_get";
  else if (f.Publish_Status === "Published")
    lane = "published_label_without_saved_public_receipt";
  else if (positive(f.Studio_Publish_Dispatch_Count) || positive(f.Publish_Attempt_Count) ||
      nonempty(f.Studio_Publish_Dispatch_At) || nonempty(f.Publish_Started_At))
    lane = "prior_dispatch_without_saved_remote_identity";
  else
    lane = "no_saved_dispatch_provider_preflight_required";
  return {
    lane,
    saved_remote_artifact: /^(?:youtube_existing|tiktok_existing|instagram_.*container|saved_post_id)/.test(lane),
    published_post_verified: false,
    authorized_to_reupload: false,
    requires_provider_preflight: true,
  };
}
