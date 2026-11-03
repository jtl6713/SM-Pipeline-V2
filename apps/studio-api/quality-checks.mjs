/** Maintained Quality Agent check catalog. Human titles plus machine fields. */

export const QUALITY_AGENT_NAME = "Quality Agent";
export const QUALITY_CHECK_SCHEMA = "studio.quality-checks.1";

export const QUALITY_LANES = Object.freeze(["service", "tester", "both"]);
export const QUALITY_ACTORS = Object.freeze(["worker_heal", "desk_agent", "local_companion", "regression"]);
export const QUALITY_HEALS = Object.freeze([
  "drain_intake",
  "remove_ingestion_parent",
  "resume_produce",
  "requeue_failed",
  "promote_published",
  "stamp_video_draft_then_ttd0",
  "retry_existing_final_mp4_staging",
  "park_six_hours",
  "return_to_preapproval_after_cooldown",
  "repair_render_sources",
  "repair_scripted_short_assets",
  "promote_native_photo_review_strand",
  "complete_native_photo_approve",
  "heal_stale_rfr_after_approve",
  "diagnose_then_one_send",
  "wait_pacific_midnight",
  "align_signature_then_rearm",
  "clamp_children_then_requeue",
  "verify_children_then_advance",
  "backoff_then_retry_missing_child",
  "retarget_music_drive",
  "promote_rendered_ready_for_review",
  "return_phantom_rerender_to_review",
  "release_autonomous_revision_lock",
  "extend_last_clip_requeue_r4",
  "ticket_only",
  "resume_factory_batch",
  "reconcile_factory_batch",
  "recover_schedule_lock",
  "reconcile_schedule_reservation",
  "none",
]);

export const ORIGIN_TERMINALS = Object.freeze({
  autonomous: "Ready for Review",
  "az-finished-video": "Approved for Publishing / scheduled",
  other: "Ready for Review",
});

const ADVANCEMENT_TERMINALS = Object.freeze({
  autonomous: ORIGIN_TERMINALS.autonomous,
  "az-finished-video": ORIGIN_TERMINALS["az-finished-video"],
  other: ORIGIN_TERMINALS.other,
});

function check(row) {
  return Object.freeze({
    terminal_by_origin: null,
    ...row,
  });
}

/** Precise operator sentences. `kind` matches a classifier or tester assertion. */
export const QUALITY_CHECKS = Object.freeze([
  check({
    id: "ig_stale_upload",
    signature: "QA-IG-STALE-UPLOAD",
    title: "Flag orphaned Instagram Reel AP1-IG publish locks after 30 minutes for identity-safe recovery",
    lane: "service",
    kind: "ig_stale_upload",
    actor: "desk_agent",
    heal: "ticket_only", // fail closed until production lease/Meta/MAE adapters are proven
  }),
  check({
    id: "scripted_short_producer_constraints",
    signature: "QA-SCRIPTED-SHORT-PRODUCER-CONSTRAINTS",
    title: "Block scripted-short production when the saved Producer Plan, required uploads, scene assignments, profile, or requested topic no longer match",
    lane: "both",
    kind: "scripted_short_producer_constraints",
    actor: "worker_heal",
    heal: "repair_scripted_short_assets",
  }),
  check({
    id: "asset_location_mismatch",
    signature: "QA-ASSET-LOCATION-MISMATCH",
    title: "Detect and safely repair scripted short library media that violates the requested location or profile",
    lane: "both",
    kind: "asset_location_mismatch",
    actor: "worker_heal",
    heal: "repair_scripted_short_assets",
  }),
  check({
    id: "schedule_lock_hung",
    signature: "QA-SCHEDULE-LOCK-HUNG",
    title: "Detect expired or abandoned profile/platform scheduling reservation locks",
    lane: "service",
    kind: "schedule_lock_hung",
    actor: "worker_heal",
    heal: "recover_schedule_lock",
  }),
  check({
    id: "schedule_lock_contention",
    signature: "QA-SCHEDULE-LOCK-CONTENTION",
    title: "Detect scheduling requests waiting too long behind a profile/platform reservation owner",
    lane: "service",
    kind: "schedule_lock_contention",
    actor: "worker_heal",
    heal: "none",
  }),
  check({
    id: "schedule_reservation_drift",
    signature: "QA-SCHEDULE-RESERVATION-DRIFT",
    title: "Detect disagreement between durable scheduling reservation ledger and authoritative Platform Output",
    lane: "service",
    kind: "schedule_reservation_drift",
    actor: "worker_heal",
    heal: "reconcile_schedule_reservation",
  }),
  check({
    id: "schedule_collision",
    signature: "QA-SCHEDULE-COLLISION",
    title: "Detect committed same-profile/platform schedules that violate separation policy",
    lane: "both",
    kind: "schedule_collision",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "schedule_queue_stalled",
    signature: "QA-SCHEDULE-QUEUE-STALLED",
    title: "Detect scheduling approval queues unable to advance because a reservation lane is blocked",
    lane: "service",
    kind: "schedule_queue_stalled",
    actor: "worker_heal",
    heal: "recover_schedule_lock",
  }),
  check({ id: "factory_batch_stalled", title: "Detect Factory approval batches stalled beyond recovery heartbeat", lane: "service",
    kind: "factory_batch_stalled", actor: "worker_heal", heal: "resume_factory_batch" }),
  check({ id: "factory_batch_state_mismatch", title: "Reconcile Factory batch status that disagrees with durable item states", lane: "service",
    kind: "factory_batch_state_mismatch", actor: "worker_heal", heal: "reconcile_factory_batch" }),
  check({ id: "factory_batch_duplicate_item", title: "Block Factory batch with duplicate output IDs; require manual inspection", lane: "service",
    kind: "factory_batch_duplicate_item", actor: "desk_agent", heal: "ticket_only" }),
  check({ id: "factory_batch_transient_wait", title: "Track transient Factory item retries without bypassing backoff", lane: "service",
    kind: "factory_batch_transient_wait", actor: "worker_heal", heal: "resume_factory_batch" }),
  check({ id: "factory_batch_failed_item", title: "Surface failed-only Factory approval retries without touching successes", lane: "service",
    kind: "factory_batch_failed_item", actor: "desk_agent", heal: "ticket_only" }),
  check({
    id: "factory_approval_missing_authority",
    signature: "QA-FACTORY-APPROVAL-SOURCE-NOT-FOUND",
    title: "Detect Factory approval failures whose output ID cannot resolve to an authoritative Airtable Platform Output",
    lane: "service", kind: "factory_approval_missing_authority", actor: "desk_agent", heal: "ticket_only",
  }),
  check({
    id: "intake_processed_residue",
    title: "Check for orphaned ingestion content that has already been fully processed",
    lane: "service",
    kind: "intake_processed_residue",
    actor: "worker_heal",
    heal: "remove_ingestion_parent",
  }),
  check({
    id: "intake_parked",
    title: "Check for eligible unprocessed files still sitting in the ingestion folder",
    lane: "service",
    kind: "intake_parked",
    actor: "worker_heal",
    heal: "drain_intake",
  }),
  check({
    id: "intake_oversize",
    title: "Check for oversized ingestion videos waiting on compress (A1S/A1P)",
    lane: "service",
    kind: "intake_oversize",
    actor: "worker_heal",
    heal: "none",
  }),
  check({
    id: "autonomous_revision_lock",
    title: "Check for the autonomous FIFO lock stuck on a Factory revision hold",
    lane: "service",
    kind: "autonomous_revision_lock",
    actor: "worker_heal",
    heal: "release_autonomous_revision_lock",
  }),
  check({
    id: "autonomous_stalled",
    title: "Check for origin=autonomous requests stuck in Draft/Ready/Submitted (should skip Production Approve through to Promoted)",
    lane: "both",
    kind: "autonomous_stalled",
    actor: "desk_agent",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "promoted_not_rfr",
    title: "Check for Promoted / production-approved work whose outputs are not advancing to Ready for Review",
    lane: "service",
    kind: "promoted_not_rfr",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "az_not_auto_finished",
    title: "Check for origin=az-finished-video that has cover + caption + Final_File_URL but is not auto-approved / scheduled",
    lane: "service",
    kind: "az_not_auto_finished",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "autonomous_topic_collision",
    title: "Check for origin=autonomous harvests that leaked a second package on the same landmark",
    lane: "service",
    kind: "autonomous_topic_collision",
    actor: "desk_agent",
    heal: "ticket_only",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "youtube_private_source_fail",
    title: "Check for YouTube Shorts stuck because Graph cannot fetch a private Drive final",
    lane: "service",
    kind: "youtube_private_source_fail",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "youtube_cover_quota",
    title: "Check for live YouTube Shorts whose poll or cover hit daily quota (not operator work)",
    lane: "service",
    kind: "youtube_cover_quota",
    actor: "worker_heal",
    heal: "wait_pacific_midnight",
  }),
  check({
    id: "autonomous_rfr_gate",
    title: "Check that library-stills autonomous work stops at Ready for Review (must not auto-publish)",
    lane: "both",
    kind: "autonomous_rfr_gate",
    actor: "desk_agent",
    heal: "ticket_only",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "publish_never_dispatch",
    title: "Check for due Approved-for-Publishing outputs that never dispatch (ignore future calendar holds)",
    lane: "service",
    kind: "publish_never_dispatch",
    actor: "worker_heal",
    heal: "diagnose_then_one_send",
  }),
  check({
    id: "publish_failed_transient",
    title: "Check for Failed or retry-eligible publishes (Instagram IN_PROGRESS, HTTP 401, or Failed for more than an hour) that Worker should requeue",
    lane: "service",
    kind: "publish_failed_transient",
    actor: "worker_heal",
    heal: "requeue_failed",
  }),
  check({
    id: "publish_live_failed_status",
    title: "Check for Publish_Status=Failed while Platform_Post_ID / Published_At already prove the post is live",
    lane: "service",
    kind: "publish_live_failed_status",
    actor: "worker_heal",
    heal: "promote_published",
  }),
  check({
    id: "ttd0_route_blank_draft",
    title: "Check for TTD0_ROUTE Failed TikTok Videos that already have a public media.chicagoshining.com MP4 but blank TikTok_Draft_Type",
    lane: "service",
    kind: "ttd0_route_blank_draft",
    actor: "worker_heal",
    heal: "stamp_video_draft_then_ttd0",
  }),
  check({
    id: "facebook_fbs2_storage_disconnect",
    title: "Check Facebook Reel FBS2_DIRECT_STORAGE failed R2 transfers with an existing rendered MP4; retry staging, never regenerate frames",
    lane: "service",
    kind: "facebook_fbs2_storage_disconnect",
    actor: "worker_heal",
    heal: "retry_existing_final_mp4_staging",
  }),
  check({
    id: "facebook_publish_rate_limit",
    title: "Check for Facebook Graph 368 / 1390008 spam rate-limit during FBS3 Reel upload session start",
    lane: "service",
    kind: "facebook_publish_rate_limit",
    actor: "worker_heal",
    heal: "park_six_hours",
  }),
  check({
    id: "facebook_story_rate_limit",
    signature: "QA-FB-STORY-368-RETRY-PENDING",
    title: "Recover cooled transient Facebook Story 368 rejections to Ready for Review; preserve remote-verification holds and require a fresh MAE approval",
    lane: "service",
    kind: "facebook_story_rate_limit",
    actor: "worker_heal",
    heal: "return_to_preapproval_after_cooldown",
  }),
  check({
    id: "tiktok_auth_signature",
    title: "Check for TikTok Manual Fallback / HTTP 401 Unauthorized from the city auth Worker (pipeline secret signature mismatch)",
    lane: "both",
    kind: "tiktok_auth_signature",
    actor: "desk_agent",
    heal: "align_signature_then_rearm",
  }),
  check({
    id: "ig_duplicate_slide_sets",
    signature: "QA-IG-AP1C-DUPLICATE-SLIDE-SETS",
    title: "Detect Instagram AP1C doubled linked slide-number sets and require approved-manifest reconciliation before retry",
    lane: "service", kind: "ig_duplicate_slide_sets", actor: "desk_agent", heal: "ticket_only",
  }),
  check({
    id: "ig_ambiguous_parent",
    signature: "QA-IG-AP3C-AMBIGUOUS-PARENT",
    title: "Quarantine ambiguous Instagram AP3C HTTP 5xx parent creation until provider-side outcome can be verified",
    lane: "service", kind: "ig_ambiguous_parent", actor: "desk_agent", heal: "ticket_only",
  }),
  check({
    id: "ig_expired_child_drift",
    signature: "QA-IG-EXPIRED-CHILD-STATE-DRIFT",
    title: "Detect stale Instagram child-ready counters where Meta returned expired media but Airtable still claims FINISHED",
    lane: "service", kind: "ig_expired_child_drift", actor: "worker_heal", heal: "verify_children_then_advance",
  }),
  check({
    id: "ig_retry_storm",
    signature: "QA-IG-RETRY-STORM",
    title: "Fence Instagram carousel stages that repeat a persistent error beyond their bounded retry allowance",
    lane: "service", kind: "ig_retry_storm", actor: "desk_agent", heal: "ticket_only",
  }),
  check({
    id: "ig_carousel_too_many_children",
    title: "Check for Instagram carousels stuck at AP3C because Graph received more than 10 children",
    lane: "service",
    kind: "ig_carousel_too_many_children",
    actor: "worker_heal",
    heal: "clamp_children_then_requeue",
  }),
  check({
    id: "ig_carousel_child_verification_race",
    title: "Check for AP1C child-ID verification mismatches after Instagram child creation",
    lane: "service",
    kind: "ig_carousel_child_verification_race",
    actor: "worker_heal",
    heal: "verify_children_then_advance",
  }),
  check({
    id: "ig_carousel_child_poll_failure",
    title: "Check for AP2C terminal child or timeout failures after Instagram child creation",
    lane: "service",
    kind: "ig_carousel_child_poll_failure",
    actor: "worker_heal",
    heal: "verify_children_then_advance",
  }),
  check({
    id: "ig_carousel_rate_limited",
    title: "Check for Meta AP1C 'User is performing too many actions' throttling",
    lane: "service",
    kind: "ig_carousel_rate_limited",
    actor: "worker_heal",
    heal: "backoff_then_retry_missing_child",
  }),
  check({
    id: "render_failed",
    title: "Check for Render_Status=Failed outputs (including Failed for more than an hour) that Worker should requeue to Ready for Render",
    lane: "service",
    kind: "render_failed",
    actor: "worker_heal",
    heal: "requeue_failed",
  }),
  check({
    id: "render_unfetchable_source",
    title: "Check for render manifests containing Studio-only /api/media-assets stream URLs that Remotion cannot fetch",
    lane: "service",
    kind: "render_unfetchable_source",
    actor: "worker_heal",
    heal: "repair_render_sources",
  }),
  check({
    id: "render_private_drive_watermark",
    title: "Check for Remotion renders using a private Google Drive watermark that Chromium cannot load (403 / ERR_BLOCKED_BY_ORB)",
    lane: "service",
    kind: "render_private_drive_watermark",
    actor: "worker_heal",
    heal: "repair_render_sources",
  }),
  check({
    id: "native_photo_review_strand",
    title: "Check for complete scheduled native-photo outputs stranded at Ready for Review after sibling approval",
    lane: "service",
    kind: "native_photo_review_strand",
    actor: "worker_heal",
    heal: "promote_native_photo_review_strand",
  }),
  check({
    id: "native_photo_approve_incomplete",
    title: "Check for native-photo outputs marked Approved for Publishing without Review/Publish arming or carousel slides",
    lane: "service",
    kind: "native_photo_approve_incomplete",
    actor: "worker_heal",
    heal: "complete_native_photo_approve",
  }),
  check({
    id: "awaiting_approval_stale_rfr",
    title: "Check for outputs still Output_Status=Ready for Review after Approve (phantom All-Profiles Awaiting Approval)",
    lane: "service",
    kind: "awaiting_approval_stale_rfr",
    actor: "worker_heal",
    heal: "heal_stale_rfr_after_approve",
  }),
  check({
    id: "native_cover_missing",
    title: "Check for Reels/Shorts that published without attaching the 3D native cover",
    lane: "both",
    kind: "native_cover_missing",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "rfr_locked_missing_deliverable",
    title: "Check for Rendered / Review Sent / Ready for Review outputs that still cannot Open review because the reviewable deliverable is incomplete",
    lane: "service",
    kind: "rfr_locked_missing_deliverable",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "produce_stale",
    title: "Check for stale studio-produce jobs that Worker heal should still resume",
    lane: "service",
    kind: "produce_stale",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "produce_escalated",
    title: "Check for escalated studio-produce jobs and un-park them when the block is recoverable",
    lane: "service",
    kind: "produce_escalated",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "produce_clip_mismatch",
    title: "Check for Remotion clip-count mismatch (expected N, received M) that Worker retries cannot fix",
    lane: "service",
    kind: "produce_clip_mismatch",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "produce_stamp_422",
    title: "Check for studio-produce blocked on an Airtable 422 while stamping Selected_Assets_JSON",
    lane: "service",
    kind: "produce_stamp_422",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "engagement_duplicate",
    title: "Check for duplicate engagement attempts blocked by idempotency keys",
    lane: "both",
    kind: "engagement_duplicate",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_repeated_comment",
    title: "Check for near-identical repeated engagement comments",
    lane: "both",
    kind: "engagement_repeated_comment",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_unsupported",
    title: "Check for unsupported platform engagement operations offered as Open Post only",
    lane: "both",
    kind: "engagement_unsupported",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_permission",
    title: "Check for expired or missing engagement API permissions / OAuth failures",
    lane: "both",
    kind: "engagement_permission",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_quota",
    title: "Check for engagement API quota exhaustion (do not raise limits to bypass spam protections)",
    lane: "both",
    kind: "engagement_quota",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_failed_comment",
    title: "Check for failed engagement comment/like publishes that must not be blind-retried",
    lane: "both",
    kind: "engagement_failed_comment",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_wrong_profile",
    title: "Check for engagement actions attempted against the wrong brand profile",
    lane: "both",
    kind: "engagement_wrong_profile",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_irrelevant_ai",
    title: "Check for inappropriate or irrelevant AI engagement suggestions",
    lane: "both",
    kind: "engagement_irrelevant_ai",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_post_deleted",
    title: "Check for engagement targets whose posts were deleted before action",
    lane: "both",
    kind: "engagement_post_deleted",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "engagement_ambiguous",
    title: "Check for ambiguous engagement publish outcomes that require existence verification before retry",
    lane: "both",
    kind: "engagement_ambiguous",
    actor: "desk_agent",
    heal: "none",
  }),
  check({
    id: "drive_music_404",
    title: "Check for produce/render parked on a deleted Google Drive library music file (Remotion Download failed 404)",
    lane: "service",
    kind: "drive_music_404",
    actor: "desk_agent",
    heal: "retarget_music_drive",
  }),
  check({
    id: "render_ready_no_job",
    title: "Check for outputs Ready for Render with no Remotion job",
    lane: "service",
    kind: "render_ready_no_job",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "render_ready_status_typo",
    title: "Check for outputs parked on orphan Render_Status Ready to Render (R4 never selects it)",
    lane: "service",
    kind: "render_ready_status_typo",
    actor: "worker_heal",
    heal: "requeue_failed",
  }),
  check({
    id: "render_ready_waiting_voiceover",
    title: "Check for outputs Ready for Render with no Remotion job because the voiceover never generated",
    lane: "service",
    kind: "render_ready_waiting_voiceover",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "voiceover_exceeds_render",
    title: "Check for Blocked renders where spoken voiceover runs past the stamped duration (Output 2156)",
    lane: "service",
    kind: "voiceover_exceeds_render",
    actor: "worker_heal",
    heal: "extend_last_clip_requeue_r4",
  }),
  check({
    id: "render_stale_rendering",
    title: "Check for outputs stuck on Render_Status=Rendering after Final_File_URL is already present",
    lane: "service",
    kind: "render_stale_rendering",
    actor: "worker_heal",
    heal: "promote_rendered_ready_for_review",
  }),
  check({
    id: "phantom_rerender",
    title: "Check for Changes Requested outputs painted Rerendering after the finished file is already present",
    lane: "service",
    kind: "phantom_rerender",
    actor: "worker_heal",
    heal: "return_phantom_rerender_to_review",
  }),
  check({
    id: "render_long",
    title: "Check for renders still in progress past the stale window",
    lane: "service",
    kind: "render_long",
    actor: "local_companion",
    heal: "ticket_only",
  }),
  check({
    id: "produce_orphan",
    title: "Check for In Production outputs with no produce/render job",
    lane: "service",
    kind: "produce_orphan",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "variant_preparing",
    title: "Check for variant rows stuck in Preparing or Error (auto Retry remaining)",
    lane: "service",
    kind: "variant_preparing",
    actor: "worker_heal",
    heal: "requeue_failed",
  }),
  check({
    id: "crop_stale",
    title: "Check for crop jobs still Processing past the stale window",
    lane: "service",
    kind: "crop_stale",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "crop_parked",
    title: "Check for crop jobs parked in Error or exhausted Processing attempts",
    lane: "service",
    kind: "crop_parked",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "health_down",
    title: "Check that public Chicago Shining /health endpoints are up",
    lane: "both",
    kind: "health_down",
    actor: "local_companion",
    heal: "ticket_only",
  }),
  check({
    id: "autonomous_produce_gap",
    title: "Check for Promoted origin=autonomous work with a missing or blocked produce job",
    lane: "service",
    kind: "autonomous_produce_gap",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "az_stalled",
    title: "Check for origin=az-finished-video jobs that are stalled or escalated",
    lane: "service",
    kind: "az_stalled",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "variant_heic_sprite",
    title: "Check for 9:16 fill-crops that look like two photos stacked from a raw HEIC tile grid",
    lane: "service",
    kind: "variant_heic_sprite",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "tester_nightly",
    title: "Check that the last nightly regression rotation from tests/regression/catalog.json is fresh and passing",
    lane: "tester",
    kind: "tester_nightly",
    actor: "regression",
    heal: "ticket_only",
  }),
  check({
    id: "retired_platform_residue",
    title: "Check that retired platform values cannot enter Production approval validation, output plans, or operator-facing errors",
    lane: "both",
    kind: "retired_platform_residue",
    actor: "regression",
    heal: "none",
  }),
  check({
    id: "tester_catalog_assert",
    title: "Check cheap Quality Agent catalog assertions without seeding live platform-matrix rows",
    lane: "tester",
    kind: "tester_catalog_assert",
    actor: "regression",
    heal: "none",
  }),
]);

export const QUALITY_CHECK_BY_KIND = Object.freeze(
  Object.fromEntries(QUALITY_CHECKS.map((row) => [row.kind, row]))
);

export function catalogCheckForKind(kind) {
  return QUALITY_CHECK_BY_KIND[String(kind || "").trim()] || null;
}

export function assertQualityCatalog(checks = QUALITY_CHECKS) {
  const rows = Array.isArray(checks) ? checks : [];
  const ids = new Set();
  const titles = new Set();
  const kinds = new Set();
  for (const row of rows) {
    if (!row?.id || !row?.title || !row?.kind) {
      throw new Error("quality catalog row missing id, title, or kind");
    }
    if (!QUALITY_LANES.includes(row.lane)) throw new Error(`invalid lane for ${row.id}`);
    if (!QUALITY_ACTORS.includes(row.actor)) throw new Error(`invalid actor for ${row.id}`);
    if (!QUALITY_HEALS.includes(row.heal)) throw new Error(`invalid heal for ${row.id}`);
    if (ids.has(row.id)) throw new Error(`duplicate quality catalog id ${row.id}`);
    if (titles.has(row.title)) throw new Error(`duplicate quality catalog title: ${row.title}`);
    if (kinds.has(row.kind)) throw new Error(`duplicate quality catalog kind ${row.kind}`);
    ids.add(row.id);
    titles.add(row.title);
    kinds.add(row.kind);
  }
  return { ok: true, count: rows.length };
}

export function attachQualityChecks(incidents, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const scanned = options.scannedKinds instanceof Set
    ? options.scannedKinds
    : new Set(options.scannedKinds || []);
  const rows = Array.isArray(incidents) ? incidents.filter(Boolean) : [];
  const byKind = {};
  for (const row of rows) {
    const kind = String(row.kind || "").trim();
    if (!kind) continue;
    if (!byKind[kind]) byKind[kind] = [];
    byKind[kind].push(row);
  }
  return QUALITY_CHECKS.map((check) => {
    const matching = byKind[check.kind] || [];
    const wasScanned = !scanned.size || scanned.has(check.kind);
    let status = "not_run";
    if (matching.length) status = "finding";
    else if (wasScanned) status = "pass";
    return {
      ...check,
      status,
      incidents: matching,
      checked_at: generatedAt,
    };
  });
}
