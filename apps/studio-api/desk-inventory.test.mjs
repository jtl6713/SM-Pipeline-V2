import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDeskMode,
  deskModeAllows,
  classifyProduceJob,
  errorClassFromText,
  extractDriveMusic404FileId,
  isDriveMusic404Error,
  classifyRenderRow,
  classifyCropRow,
  classifyAutonomousRequest,
  classifyAutonomousTopicCollision,
  classifyYoutubeCoverQuota,
  classifyYoutubePrivateSourceFail,
  classifyHealthTarget,
  classifyIntakeResidue,
  classifyPromotedNotRfr,
  classifyAzNotAutoFinished,
  classifyAutonomousRfrGate,
  classifyPublishDispatch,
  classifyPublishFailed,
  classifyIgCarouselTooManyChildren,
  classifyIgCarouselChildVerificationRace,
  classifyIgCarouselChildPollFailure,
  classifyIgCarouselRateLimited,
  classifyTikTokAuthSignature,
  classifyNativeCover,
  classifyRfrLockedMissingDeliverable,
  classifyNativePhotoReviewStrand,
  classifyNativePhotoApproveIncomplete,
  classifyTesterNightly,
  classifyTesterCatalogAssert,
  originFromNotes,
  CLASSIFIER_KINDS,
  fingerprint,
  pathIsAutoMergeAllowlisted,
  deskMayAutomerge,
  deskMayRestart,
  parseDeskCaps,
  summarizeIncidents,
  buildDeskInventoryPayload,
  DEFAULT_DESK_MODE,
} from "./desk-inventory.mjs";

test("desk mode ladder and kill switch", () => {
  assert.equal(parseDeskMode(""), DEFAULT_DESK_MODE);
  assert.equal(parseDeskMode("OFF"), "off");
  assert.equal(deskModeAllows("off", "ticket"), false);
  assert.equal(deskModeAllows("observe", "ticket"), true);
  assert.equal(deskModeAllows("observe", "restart"), false);
  assert.equal(deskModeAllows("infra", "deploy_local"), true);
  assert.equal(deskModeAllows("patch", "open_pr"), true);
  assert.equal(deskModeAllows("patch", "automerge"), false);
  assert.equal(deskModeAllows("automerge", "automerge"), true);
});

test("produce jobs escalate after heal budget then stay transient while retries remain", () => {
  const now = Date.parse("2026-09-07T04:00:00Z");
  assert.equal(classifyProduceJob({ step: "done" }, now), null);
  const blocked = classifyProduceJob({
    request_id: "recJob1",
    step: "blocked",
    job_id: "spj-1",
    updated_at: "2026-09-07T03:59:00Z",
    error: "timeout talking to render",
    heal: { resume_count: 2, max_resumes: 5 },
  }, now);
  assert.equal(blocked.kind, "produce_stale");
  assert.equal(blocked.class, "transient");
  assert.equal(blocked.actor, "worker_heal");
  const escalated = classifyProduceJob({
    request_id: "recJob1",
    step: "escalated",
    job_id: "spj-1",
    updated_at: "2026-09-07T03:00:00Z",
    error: "retries exhausted",
    heal: { resume_count: 5, max_resumes: 5 },
  }, now);
  assert.equal(escalated.kind, "produce_escalated");
  assert.equal(escalated.class, "transient");
  assert.equal(escalated.actor, "worker_heal");
  assert.equal(escalated.fingerprint, fingerprint("produce_escalated", "recJob1", "heal_exhausted"));
  const missingMasters = classifyProduceJob({
    request_id: "reckHkuJfs1F6eTAN",
    step: "escalated",
    job_id: "spj-38c8a6861134",
    updated_at: "2026-09-24T07:31:30.657Z",
    error: "No Studio master photos to crop",
    heal: { resume_count: 5, max_resumes: 5 },
  }, now);
  assert.equal(missingMasters.kind, "produce_escalated");
  assert.equal(missingMasters.class, "transient");
  assert.equal(missingMasters.actor, "worker_heal");
  assert.equal(missingMasters.fingerprint, fingerprint("produce_escalated", "reckHkuJfs1F6eTAN", "missing_masters"));
  assert.equal(errorClassFromText("No Studio master photos to crop"), "missing_masters");
  assert.equal(errorClassFromText("No Platform Outputs found for this Production Request"), "missing_outputs");
  assert.equal(errorClassFromText("TikTok photo draft initialization failed. HTTP 401: Unauthorized"), "transient_http");
  const mismatch = classifyProduceJob({
    request_id: "reccEj6eVXPPKalJd",
    step: "blocked",
    job_id: "spj-1",
    updated_at: "2026-09-07T15:21:07Z",
    error: "Remotion /render failed (500): Render clip count mismatch before asset download: expected 20, received 28.",
    heal: {},
  }, now);
  assert.equal(mismatch.kind, "produce_clip_mismatch");
  assert.equal(mismatch.class, "code_bug");
  assert.equal(mismatch.actor, "desk_agent");
  assert.equal(mismatch.fingerprint, fingerprint("produce_clip_mismatch", "reccEj6eVXPPKalJd", "clip_count_mismatch"));
  assert.equal(errorClassFromText("clip count mismatch before asset download"), "clip_count_mismatch");
});

test("deleted Drive library music is drive_music_404 data_repair, not Worker retry", () => {
  const now = Date.parse("2026-10-03T14:00:00Z");
  const remotionErr = "Remotion /render failed (500): Download failed 404 Drive 11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t";
  const t1Err = "404 Client Error: Not Found for url: https://www.googleapis.com/drive/v3/files/11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t?alt=media&supportsAllDrives=true";
  assert.equal(errorClassFromText(remotionErr), "drive_music_404");
  assert.equal(errorClassFromText(t1Err), "drive_music_404");
  assert.equal(extractDriveMusic404FileId(remotionErr), "11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t");
  assert.equal(extractDriveMusic404FileId(t1Err), "11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t");
  assert.equal(isDriveMusic404Error(remotionErr), true);
  const blocked = classifyProduceJob({
    request_id: "recrbAqjeyGcERgdf",
    step: "blocked",
    job_id: "spj-17372f47e6aa",
    updated_at: "2026-10-03T13:50:00Z",
    error: remotionErr,
    heal: { resume_count: 5, max_resumes: 5, last_block_error: remotionErr },
  }, now);
  assert.equal(blocked.kind, "drive_music_404");
  assert.equal(blocked.class, "data_repair");
  assert.equal(blocked.actor, "desk_agent");
  assert.equal(blocked.fingerprint, fingerprint("drive_music_404", "recrbAqjeyGcERgdf", "11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t"));
  const render = classifyRenderRow({
    id: "recj8NYksxakWJEJd",
    render_status: "Failed",
    remotion_job_id: "job-1",
    render_error: remotionErr,
  }, now);
  assert.equal(render.kind, "drive_music_404");
  assert.equal(render.fingerprint, fingerprint("drive_music_404", "recj8NYksxakWJEJd", "11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t"));
  const t1 = classifyRenderRow({
    id: "reczSvL8nKCVySr7J",
    render_status: "Ready for Render",
    remotion_job_id: "",
    timing_error: t1Err,
  }, now);
  assert.equal(t1.kind, "drive_music_404");
});

test("render, orphan, crop, autonomous, and health classifiers", () => {
  const now = Date.parse("2026-09-07T04:00:00Z");
  assert.equal(classifyRenderRow({
    id: "recR1",
    render_status: "Ready for Render",
    remotion_job_id: "",
  }, now).kind, "render_ready_no_job");
  // Outputs 1702–1705 Upper West Side: orphan "Ready to Render" choice parks R4 forever.
  const readyToTypo = classifyRenderRow({
    id: "recR1typo",
    render_status: "Ready to Render",
    remotion_job_id: "",
    output_id: 1702,
  }, now);
  assert.equal(readyToTypo.kind, "render_ready_status_typo");
  assert.equal(readyToTypo.actor, "worker_heal");
  assert.equal(readyToTypo.fingerprint, "render_ready_status_typo:recR1typo:ready_to_render");
  // Output 432 / CI 137: narration required, Voiceover_URL blank, R4 loops on waiting_for_voiceover.
  const waitingVo = classifyRenderRow({
    id: "recR1b",
    render_status: "Ready for Render",
    remotion_job_id: "",
    voiceover_required: true,
    voiceover_url: "",
    output_id: 432,
  }, now);
  assert.equal(waitingVo.kind, "render_ready_waiting_voiceover");
  assert.equal(waitingVo.actor, "worker_heal");
  assert.equal(waitingVo.fingerprint, "render_ready_waiting_voiceover:recR1b:no_voiceover_url");
  assert.equal(classifyRenderRow({
    id: "recR1c",
    render_status: "Ready for Render",
    remotion_job_id: "",
    voiceover_required: true,
    voiceover_url: "https://drive.google.com/uc?id=vo",
  }, now).kind, "render_ready_no_job");
  const failedRender = classifyRenderRow({
    id: "recRFail",
    render_status: "Failed",
    remotion_job_id: "job-crash",
    render_error: "Command failed with exit code 1",
  }, now);
  assert.equal(failedRender.kind, "render_failed");
  assert.equal(failedRender.class, "transient");
  assert.equal(failedRender.actor, "worker_heal");
  const badSource = classifyRenderRow({
    id: "recRBadSource",
    render_status: "Rendering",
    remotion_job_id: "job-bad-source",
    render_clip_list_json: '[{"url":"/api/media-assets/recVideo/stream"}]',
    last_modified: "2026-09-07T03:59:00Z",
  }, now);
  assert.equal(badSource.kind, "render_unfetchable_source");
  assert.equal(badSource.class, "data_repair");
  assert.equal(badSource.actor, "worker_heal");
  assert.match(badSource.diagnosis, /Google Drive URL/);
  const privateDriveWatermark = classifyRenderRow({
    id: "recRWatermark",
    render_status: "Failed",
    remotion_job_id: "job-watermark",
    remotion_props_json: '{"watermarkUrl":"https://drive.google.com/uc?export=download&id=abc123","watermarkRequired":true}',
    render_error: "Remotion render failed with exit code 1",
  }, now);
  assert.equal(privateDriveWatermark.kind, "render_private_drive_watermark");
  assert.equal(privateDriveWatermark.class, "data_repair");
  assert.equal(privateDriveWatermark.actor, "worker_heal");
  assert.match(privateDriveWatermark.diagnosis, /ERR_BLOCKED_BY_ORB/);
  const parkedDriveWatermark = classifyRenderRow({
    id: "recRWatermarkParked",
    render_status: "Blocked",
    remotion_job_id: "",
    render_error: "PRIVATE_DRIVE_WATERMARK: waiting for Remotion watermark localization; old renderer cannot fetch drive.google.com watermark safely.",
  }, now);
  assert.equal(parkedDriveWatermark.kind, "render_private_drive_watermark");
  assert.equal(parkedDriveWatermark.actor, "worker_heal");
  // Output 1807: Final_File_URL present but Render_Status still Rendering.
  const staleRendering = classifyRenderRow({
    id: "rec0mwr0QiudNSQrn",
    render_status: "Rendering",
    output_status: "In Production",
    review_status: "Review Sent",
    remotion_job_id: "",
    final_file_url: "https://drive.google.com/file/d/final1807/view",
    last_modified: "2026-10-06T18:00:00Z",
  }, now);
  assert.equal(staleRendering.kind, "render_stale_rendering");
  assert.equal(staleRendering.class, "transient");
  assert.equal(staleRendering.actor, "worker_heal");
  assert.equal(staleRendering.fingerprint, "render_stale_rendering:rec0mwr0QiudNSQrn:final_file_present");
  assert.equal(classifyRenderRow({
    id: "recR2",
    render_status: "Rendering",
    remotion_job_id: "job-1",
    final_file_url: "",
    last_modified: "2026-09-07T03:40:00Z",
  }, now).class, "infra_down");
  assert.equal(classifyRenderRow({
    id: "recR3",
    output_status: "In Production",
    remotion_job_id: "",
  }, now).kind, "produce_orphan");
  assert.equal(classifyCropRow({
    id: "recC1",
    transfer_status: "Processing",
    attempt_count: 2,
    last_attempt_at: "2026-09-07T03:57:00Z",
  }, now).kind, "crop_stale");
  assert.equal(classifyCropRow({
    id: "recC2",
    transfer_status: "Error",
    attempt_count: 6,
  }, now).kind, "crop_parked");
  assert.equal(classifyAutonomousRequest({
    status: "Submitted",
    notes: "origin=autonomous cited_trend=Navy Pier",
    job: { request_id: "recA1" },
  }).kind, "autonomous_stalled");
  assert.equal(classifyAutonomousRequest({
    status: "Promoted",
    notes: "origin=autonomous",
    job: { request_id: "recA2" },
  }).kind, "autonomous_produce_gap");
  assert.equal(classifyHealthTarget(
    { id: "pipeline-runner", url: "https://pipeline.chicagoshining.com/health" },
    { ok: false, status: 502 },
  ).class, "infra_down");
  assert.equal(classifyHealthTarget({ id: "pipeline-runner" }, { ok: true }), null);
  assert.equal(classifyHealthTarget(
    { id: "timing-engine", public: false },
    { ok: false, status: 0, error: "Could not resolve host" },
  ), null);
  assert.equal(classifyIntakeResidue({
    id: "driveSmall",
    name: "Lincoln Park Zoo 20.MOV",
    size: 16148070,
  }).kind, "intake_parked");
  assert.equal(classifyIntakeResidue({
    id: "driveProcessed",
    name: "Lincoln Park Zoo 20.MOV",
    size: 16148070,
    existing_media_asset_id: "recMedia1",
    duplicate_reason: "drive_id",
    parents: ["ingestion", "photos"],
  }).kind, "intake_processed_residue");
  assert.equal(classifyIntakeResidue({
    id: "driveHuge",
    name: "Huge.MOV",
    size: 150000000,
  }).kind, "intake_oversize");
  assert.equal(classifyIntakeResidue({
    id: "driveHugeProcessed",
    name: "Huge.MOV",
    size: 150000000,
    existing_media_asset_id: "recOld",
  }).kind, "intake_processed_residue");
});

test("promoted advancement is origin-aware and does not treat Ready for Review as a finding", () => {
  const now = Date.parse("2026-09-07T04:00:00Z");
  assert.equal(originFromNotes("origin=autonomous cited_trend=Navy Pier"), "autonomous");
  assert.equal(classifyPromotedNotRfr({
    status: "Promoted",
    notes: "origin=autonomous",
    requestId: "recA3",
    outputs: [{ id: "out1", output_status: "Ready for Review" }],
    nowMs: now,
  }), null);
  assert.equal(classifyPromotedNotRfr({
    status: "Promoted",
    notes: "origin=autonomous",
    requestId: "recA4",
    outputs: [{
      id: "out2",
      output_status: "In Production",
      last_modified: "2026-09-07T03:00:00Z",
    }],
    nowMs: now,
  }).kind, "promoted_not_rfr");
  assert.equal(classifyPromotedNotRfr({
    status: "Promoted",
    notes: "origin=az-finished-video",
    requestId: "recAz1",
    outputs: [{ id: "out3", output_status: "In Production", last_modified: "2026-09-07T03:00:00Z" }],
    nowMs: now,
  }), null);
  assert.equal(classifyAzNotAutoFinished({
    status: "Promoted",
    notes: "origin=az-finished-video",
    requestId: "recAz2",
    outputs: [{
      id: "azOut",
      output_status: "Ready for Review",
      review_status: "",
      final_file_url: "https://media.example/final.mp4",
      thumbnail_url: "https://media.chicagoshining.com/publish/cover.jpg",
      output_caption: "Navy Pier at dusk",
      studio_output_type: "Reel",
    }],
  }).kind, "az_not_auto_finished");
  assert.equal(classifyAzNotAutoFinished({
    status: "Promoted",
    notes: "origin=az-finished-video",
    requestId: "recAz3",
    outputs: [{
      output_status: "Approved for Publishing",
      review_status: "Approved",
      final_file_url: "https://media.example/final.mp4",
      thumbnail_url: "https://media.chicagoshining.com/publish/cover.jpg",
      output_caption: "caption",
      studio_output_type: "Reel",
    }],
  }), null);
  assert.equal(classifyAutonomousRfrGate({
    notes: "origin=autonomous",
    requestId: "recA5",
    outputs: [{ id: "rfr1", output_status: "Ready for Review" }],
  }), null);
  assert.equal(classifyAutonomousRfrGate({
    notes: "origin=autonomous",
    requestId: "recA6",
    outputs: [{ id: "pub1", output_status: "Published", review_status: "", published_at: "2026-09-07T03:00:00Z" }],
  }).kind, "autonomous_rfr_gate");
  const neverSent = classifyPublishDispatch({
    id: "recP1",
    output_id: 908,
    output_title: "Vizcaya Rainy Day Plan",
    output_status: "Approved for Publishing",
    platform: "Instagram",
    platform_output_type: "Reel",
    content_id: 209,
    content_title: "Vizcaya Rainy Day Plan",
    last_modified: "2026-09-07T03:00:00Z",
  }, now);
  assert.equal(neverSent.kind, "publish_never_dispatch");
  assert.equal(neverSent.blocker, "never_attempted");
  assert.equal(neverSent.output_id, 908);
  assert.equal(neverSent.content_id, 209);
  assert.equal(neverSent.content_title, "Vizcaya Rainy Day Plan");
  assert.equal(neverSent.platform, "Instagram");
  assert.equal(neverSent.platform_output_type, "Reel");
  assert.equal(classifyPublishDispatch({
    id: "recScheduledHold",
    output_status: "Approved for Publishing",
    platform: "Instagram",
    publish_status: "Ready to Schedule",
    scheduled_post_date: "2026-10-03T11:30:00.000Z",
    auto_publish_enabled: true,
    last_modified: "2026-09-07T03:00:00Z",
  }, now), null);
  const quotaHold = classifyPublishDispatch({
    id: "recYtQuota",
    output_status: "Approved for Publishing",
    platform: "YouTube",
    publish_status: "Manual Publish Required",
    publish_error: "YouTube API quota exhausted while polling processing.",
    scheduled_post_date: "2026-09-30T12:00:00.000Z",
    last_modified: "2026-09-07T03:00:00Z",
  }, now);
  assert.equal(quotaHold.blocker, "youtube_quota");
  assert.equal(quotaHold.actor, "worker_heal");
  assert.match(quotaHold.diagnosis, /Do not kick/i);
  const exhausted = classifyPublishDispatch({
    id: "recKickCap",
    output_status: "Approved for Publishing",
    platform: "Instagram",
    publish_status: "Ready to Publish",
    scheduled_post_date: "2026-09-07T03:00:00Z",
    dispatch_count: 4,
    dispatch_note: "skipped: missing-public-mp4",
    last_modified: "2026-09-07T03:00:00Z",
  }, now);
  assert.equal(exhausted.blocker, "missing_asset");
  assert.equal(exhausted.class, "code_bug");
  assert.equal(exhausted.actor, "desk_agent");
  assert.equal(classifyPublishDispatch({
    id: "recP2",
    output_status: "Approved for Publishing",
    platform: "TikTok",
    last_modified: "2026-09-07T03:00:00Z",
  }, now), null);
  const ig796 = classifyPublishFailed({
    id: "recHsN9TCoV8HsAdT",
    output_id: 796,
    output_status: "Approved for Publishing",
    publish_status: "Ready to Publish",
    publish_retry_eligible: true,
    publish_error: "Instagram Reel create failed. Meta status_code: IN_PROGRESS. Status: In Progress: Media is still being processed.",
  });
  assert.equal(ig796.kind, "publish_failed_transient");
  assert.equal(ig796.class, "transient");
  assert.equal(ig796.actor, "worker_heal");
  assert.equal(ig796.fingerprint, fingerprint("publish_failed_transient", "recHsN9TCoV8HsAdT", "in_progress"));
  assert.equal(classifyPublishDispatch({
    id: "recHsN9TCoV8HsAdT",
    output_status: "Approved for Publishing",
    platform: "Instagram",
    publish_status: "Ready to Publish",
    publish_retry_eligible: true,
    publish_error: "Instagram Reel create failed. Meta status_code: IN_PROGRESS.",
    last_modified: "2026-09-07T03:00:00Z",
  }, now), null);
  assert.ok(CLASSIFIER_KINDS.includes("publish_failed_transient"));
  assert.ok(CLASSIFIER_KINDS.includes("render_failed"));
  assert.ok(CLASSIFIER_KINDS.includes("render_unfetchable_source"));
  assert.ok(CLASSIFIER_KINDS.includes("render_private_drive_watermark"));
  assert.equal(classifyPublishFailed({
    id: "recHsN9TCoV8HsAdT",
    output_status: "Approved for Publishing",
    publish_status: "Ready to Publish",
    publish_retry_eligible: true,
    publish_error: "Instagram Reel create failed. Meta status_code: ERROR. Status: Error: Media upload has failed with error code 2207082",
  }).class, "transient");
  const vizcaya908 = classifyPublishFailed({
    id: "recuOQs6TgAXJqxRI",
    output_id: 908,
    platform: "TikTok",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    tiktok_draft_status: "Manual Fallback",
    publish_error: "TikTok photo draft initialization failed. HTTP 401: {'ok': False, 'error': 'Unauthorized', 'worker_version': 'v5.1-tiktok-caption-diagnostics'}",
    last_publish_attempt_at: "2026-09-26T08:47:24.000Z",
  }, now);
  assert.equal(vizcaya908, null);
  const vizcayaSig = classifyTikTokAuthSignature({
    id: "recuOQs6TgAXJqxRI",
    output_id: 908,
    platform: "TikTok",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    tiktok_draft_status: "Manual Fallback",
    publish_error: "TikTok photo draft initialization failed. HTTP 401: {'ok': False, 'error': 'Unauthorized', 'worker_version': 'v5.1-tiktok-caption-diagnostics'}",
    last_publish_attempt_at: "2026-09-26T08:47:24.000Z",
  });
  assert.equal(vizcayaSig.kind, "tiktok_auth_signature");
  assert.equal(vizcayaSig.class, "code_bug");
  assert.equal(vizcayaSig.actor, "desk_agent");
  assert.equal(vizcayaSig.fingerprint, fingerprint("tiktok_auth_signature", "recuOQs6TgAXJqxRI", "pipeline_secret"));
  const la963 = classifyTikTokAuthSignature({
    id: "rect8fjS3MmqDvpvZ",
    output_id: 963,
    platform: "TikTok",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    tiktok_draft_status: "Manual Fallback",
    publish_error_stage: "TTD1_VIDEO_INIT",
    publish_error: "TikTok video draft initialization failed. HTTP 401: {'ok': False, 'error': 'Unauthorized', 'worker_version': 'v5.1-tiktok-caption-diagnostics'}",
  });
  assert.equal(la963.kind, "tiktok_auth_signature");
  assert.equal(la963.fingerprint, fingerprint("tiktok_auth_signature", "rect8fjS3MmqDvpvZ", "pipeline_secret"));
  assert.ok(CLASSIFIER_KINDS.includes("tiktok_auth_signature"));
  const ig1235 = classifyIgCarouselTooManyChildren({
    id: "recVphOmGqaxIYHSD",
    output_id: 1235,
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    output_status: "Approved for Publishing",
    publish_status: "Ready to Schedule",
    ig_carousel_status: "Children Ready",
    ig_carousel_error_stage: "AP3C Parent Creation",
    ig_carousel_error: "AP3C parent creation failed. HTTP 400: (#100) Unsupported post type. The post has too little or too many attachments to qualify as a carousel",
    ig_carousel_child_count: 12,
    image_count: 12,
  });
  assert.equal(ig1235.kind, "ig_carousel_too_many_children");
  assert.equal(ig1235.class, "transient");
  assert.equal(ig1235.actor, "worker_heal");
  assert.equal(ig1235.fingerprint, fingerprint("ig_carousel_too_many_children", "recVphOmGqaxIYHSD", "12"));
  assert.equal(classifyPublishFailed({
    id: "recVphOmGqaxIYHSD",
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    publish_error: "AP3C parent creation failed. HTTP 400: (#100) Unsupported post type. The post has too little or too many attachments to qualify as a carousel",
    ig_carousel_error: "AP3C parent creation failed. HTTP 400: (#100) Unsupported post type. The post has too little or too many attachments to qualify as a carousel",
    ig_carousel_error_stage: "AP3C Parent Creation",
    ig_carousel_status: "Children Ready",
    ig_carousel_child_count: 12,
  }, now), null);
  assert.ok(CLASSIFIER_KINDS.includes("ig_carousel_too_many_children"));
  const ig1298 = classifyIgCarouselChildVerificationRace({
    id: "recvDSuJr2B4cuzfV",
    output_id: 1298,
    output_title: "Rainy Day Museum Mile",
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    output_status: "Approved for Publishing",
    publish_status: "Ready to Schedule",
    ig_carousel_status: "Assets Ready",
    ig_carousel_error_stage: "AP1C Child Creation",
    ig_carousel_error: "AP1C child-ID verification mismatch. Created/retained: 9; expected: 10.",
    ig_carousel_child_count: 10,
    image_count: 10,
  });
  assert.equal(ig1298.kind, "ig_carousel_child_verification_race");
  assert.equal(ig1298.class, "transient");
  assert.equal(ig1298.actor, "worker_heal");
  assert.equal(ig1298.observed_child_count, 9);
  assert.equal(ig1298.expected_child_count, 10);
  assert.match(ig1298.diagnosis, /preserve them/i);
  assert.ok(CLASSIFIER_KINDS.includes("ig_carousel_child_verification_race"));
  const ig1298Poll = classifyIgCarouselChildPollFailure({
    id: "recvDSuJr2B4cuzfV",
    output_id: 1298,
    output_title: "Rainy Day Museum Mile",
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    output_status: "Approved for Publishing",
    publish_status: "Ready to Schedule",
    ig_carousel_status: "Assets Ready",
    ig_carousel_error_stage: "AP2C Child Polling",
    ig_carousel_error: "AP2C verified terminal child failure or poll timeout. Finished: 9; terminal: 1; max attempts: 18. AP1C will recreate children.",
    ig_carousel_child_count: 10,
    image_count: 10,
  });
  assert.equal(ig1298Poll.kind, "ig_carousel_child_poll_failure");
  assert.equal(ig1298Poll.class, "transient");
  assert.equal(ig1298Poll.actor, "worker_heal");
  assert.equal(ig1298Poll.finished_child_count, 9);
  assert.equal(ig1298Poll.terminal_child_count, 1);
  assert.equal(ig1298Poll.max_attempts, 18);
  assert.match(ig1298Poll.diagnosis, /unfinished required children only/i);
  assert.ok(CLASSIFIER_KINDS.includes("ig_carousel_child_poll_failure"));
  const ig1298Rate = classifyIgCarouselRateLimited({
    id: "recvDSuJr2B4cuzfV",
    output_id: 1298,
    output_title: "Rainy Day Museum Mile",
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    output_status: "Approved for Publishing",
    publish_status: "Ready to Schedule",
    publish_retry_eligible: true,
    ig_carousel_status: "Assets Ready",
    ig_carousel_error_stage: "AP1C Child Creation",
    ig_carousel_error: "AP1C child creation failed for slide 1. HTTP 400: User is performing too many actions",
  });
  assert.equal(ig1298Rate.kind, "ig_carousel_rate_limited");
  assert.equal(ig1298Rate.class, "transient");
  assert.equal(ig1298Rate.actor, "worker_heal");
  assert.match(ig1298Rate.diagnosis, /back off at least 30 minutes/i);
  assert.match(ig1298Rate.diagnosis, /Preserve every required child ID/i);
  assert.ok(CLASSIFIER_KINDS.includes("ig_carousel_rate_limited"));
  assert.equal(classifyPublishFailed({
    id: "recvDSuJr2B4cuzfV",
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    output_status: "Failed",
    publish_status: "Failed",
    publish_error: "AP1C child creation failed for slide 1. HTTP 400: User is performing too many actions",
    ig_carousel_error_stage: "AP1C Child Creation",
    ig_carousel_error: "AP1C child creation failed for slide 1. HTTP 400: User is performing too many actions",
  }, now), null);
  assert.equal(classifyPublishFailed({
    id: "recvDSuJr2B4cuzfV",
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    output_status: "Failed",
    publish_status: "Failed",
    publish_error: "AP1C child-ID verification mismatch. Created/retained: 9; expected: 10.",
    ig_carousel_error_stage: "AP1C Child Creation",
    ig_carousel_error: "AP1C child-ID verification mismatch. Created/retained: 9; expected: 10.",
  }, now), null);
  const staleFailed = classifyPublishFailed({
    id: "recStaleFail",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    publish_error: "Some unknown publisher error that is not in the transient list",
    last_publish_attempt_at: "2026-09-26T12:00:00.000Z",
  }, Date.parse("2026-09-26T13:05:00.000Z"));
  assert.equal(staleFailed.class, "transient");
  assert.equal(staleFailed.actor, "worker_heal");
  assert.equal(staleFailed.fingerprint, fingerprint("publish_failed_transient", "recStaleFail", "stale_failed"));
  assert.equal(classifyPublishFailed({
    id: "recFreshUnknown",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    publish_error: "Some unknown publisher error that is not in the transient list",
    last_publish_attempt_at: "2026-09-26T13:00:00.000Z",
  }, Date.parse("2026-09-26T13:05:00.000Z")).class, "code_bug");
  assert.equal(classifyPublishFailed({
    id: "recCopyright",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    publish_error: "copyright claim on this video",
    last_publish_attempt_at: "2026-09-26T08:00:00.000Z",
  }, Date.parse("2026-09-26T13:05:00.000Z")).class, "code_bug");
  assert.equal(classifyNativeCover({
    id: "recCvr",
    output_status: "Published",
    platform: "Instagram",
    studio_output_type: "Reel",
    thumbnail_url: "https://drive.google.com/uc?id=abc",
  }).kind, "native_cover_missing");
  assert.equal(classifyNativeCover({
    id: "recCvrOk",
    output_status: "Published",
    platform: "Instagram",
    studio_output_type: "Reel",
    thumbnail_url: "https://media.chicagoshining.com/publish/cover.jpg",
  }), null);
  const bigJohnReel = {
    id: "recQnS3hxKuA00cbW",
    output_id: 391,
    output_status: "Ready for Review",
    render_status: "Rendered",
    review_status: "Review Sent",
    platform: "Instagram",
    studio_output_type: "Reel",
    thumbnail_url: "",
    final_file_url: "https://drive.google.com/file/d/1Rvb7fO0HKcs3RtIRn9xZJChYzj2VWC6X/view",
    studio_preview_url: "https://media.chicagoshining.com/studio/previews/recQnS3hxKuA00cbW/current.mp4",
    last_modified: "2026-09-07T03:00:00Z",
  };
  const locked = classifyRfrLockedMissingDeliverable(bigJohnReel, now);
  assert.equal(locked.kind, "rfr_locked_missing_deliverable");
  assert.equal(locked.blocker, "cover");
  assert.equal(locked.class, "code_bug");
  assert.equal(locked.fingerprint, fingerprint("rfr_locked_missing_deliverable", "391", "cover"));
  assert.equal(classifyRfrLockedMissingDeliverable({
    ...bigJohnReel,
    last_modified: "2026-09-07T03:59:00Z",
  }, now).class, "transient");
  assert.equal(classifyRfrLockedMissingDeliverable({
    id: "recxUhl52Y88ZYx5Z",
    output_id: 392,
    output_status: "Ready for Review",
    render_status: "Rendered",
    review_status: "Review Sent",
    platform: "Instagram",
    studio_output_type: "Story",
    thumbnail_url: "",
    final_file_url: "https://drive.google.com/file/d/story/view",
    studio_preview_url: "https://media.chicagoshining.com/studio/previews/recxUhl52Y88ZYx5Z/current.mp4",
  }, now), null);
  assert.equal(classifyRfrLockedMissingDeliverable({
    ...bigJohnReel,
    thumbnail_url: "https://media.chicagoshining.com/studio/previews/thumbnails/recL3Jcd7dimxybTF/cover-9x16.png",
  }, now), null);
  assert.equal(classifyRfrLockedMissingDeliverable({
    id: "recDriveCover",
    output_id: 393,
    output_status: "Ready for Review",
    render_status: "Rendered",
    platform: "Facebook",
    studio_output_type: "Reel",
    thumbnail_url: "https://drive.google.com/uc?id=1kQ8eVS9Oo5okoa08g8iZJSfYVk39Cx6A&export=download",
    studio_preview_url: "https://media.chicagoshining.com/studio/previews/x.mp4",
  }, now).blocker, "cover");
  assert.equal(classifyRfrLockedMissingDeliverable({
    id: "recLetter",
    output_id: 200,
    output_status: "Ready for Review",
    render_status: "Native Photo Route",
    platform: "Instagram",
    studio_output_type: "Carousel",
    needs_lettering: true,
    thumbnail_url: "https://media.chicagoshining.com/studio/previews/thumbnails/recX/cover-9x16.png",
  }, now).blocker, "lettering");
  assert.ok(CLASSIFIER_KINDS.includes("rfr_locked_missing_deliverable"));
  assert.equal(classifyTesterNightly([], now).kind, "tester_nightly");
  assert.equal(classifyTesterNightly([{
    type: "github_actions",
    created_at: "2026-09-07T03:30:00Z",
    payload: { suite: "Regression suite", conclusion: "success" },
  }], now), null);
  assert.equal(classifyTesterCatalogAssert(), null);
  assert.ok(CLASSIFIER_KINDS.includes("promoted_not_rfr"));
  const zooCollision = classifyAutonomousTopicCollision({
    place: "lincoln park zoo",
    keep: { id: "recEMuJACqAnqsRPu", title: "Lincoln Park Zoo - Worth the trip?" },
    extras: [
      { id: "recdGHU0uHq3ktPje", title: "Free Zoo Escape" },
      { id: "recPy3fzh3rdnsVta", title: "Lincoln Park Zoo Stroll: Birds to Rhinos" },
    ],
  });
  assert.equal(zooCollision.kind, "autonomous_topic_collision");
  assert.equal(zooCollision.class, "data_repair");
  assert.equal(zooCollision.fingerprint, fingerprint("autonomous_topic_collision", "lincoln_park_zoo", "same_place"));
  assert.deepEqual(zooCollision.extra_record_ids, ["recdGHU0uHq3ktPje", "recPy3fzh3rdnsVta"]);
  const yt375 = classifyYoutubePrivateSourceFail({
    id: "recRxp28DYcT9SEMW",
    platform: "YouTube",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    youtube_stage: "YT1",
    youtube_video_id: "",
    final_file_url: "https://drive.google.com/file/d/1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI/view",
    publish_asset_url: "",
    studio_preview_url: "",
  });
  assert.equal(yt375.kind, "youtube_private_source_fail");
  assert.equal(yt375.class, "transient");
  assert.equal(yt375.actor, "worker_heal");
  const yt375Ready = classifyYoutubePrivateSourceFail({
    id: "recRxp28DYcT9SEMW",
    platform: "YouTube",
    output_status: "Approved for Publishing",
    publish_status: "Ready to Publish",
    youtube_stage: "YT1",
    youtube_video_id: "",
    final_file_url: "https://drive.google.com/file/d/1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI/view",
    publish_asset_url: "",
    studio_preview_url: "",
    publish_asset_error: "AP0 Worker/R2 upload failed. ('Connection aborted.', ConnectionAbortedError(10053, 'An established connection was aborted by the software in your host machine'))",
  });
  assert.equal(yt375Ready.kind, "youtube_private_source_fail");
  assert.equal(yt375Ready.fingerprint, fingerprint("youtube_private_source_fail", "recRxp28DYcT9SEMW", "yt1_drive"));
  assert.equal(classifyYoutubePrivateSourceFail({
    id: "recPublicYt",
    platform: "YouTube",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    youtube_stage: "YT1",
    final_file_url: "https://drive.google.com/file/d/abc/view",
    publish_asset_url: "https://media.chicagoshining.com/publish/recPublicYt.mp4",
  }), null);
});

test("YouTube cover quota on a live Short is not operator work", () => {
  const output1001 = classifyYoutubeCoverQuota({
    id: "recbvjtX95IioyxOi",
    output_id: 1001,
    output_title: "How the Sign Changes",
    content_id: 227,
    content_title: "How the Sign Changes",
    platform: "YouTube",
    output_status: "Approved for Publishing",
    publish_status: "Publishing",
    youtube_video_id: "EwRNnNZO0Xc",
    publish_error_stage: "YTS2_THUMBNAIL",
    publish_error: "Temporary error uploading YouTube thumbnail.",
    youtube_error: "YTS2 thumbnail upload/compression failed. HTTP 500: thumbnails.set failed 403 quotaExceeded",
  });
  assert.equal(output1001.kind, "youtube_cover_quota");
  assert.equal(output1001.class, "transient");
  assert.equal(output1001.actor, "worker_heal");
  assert.equal(output1001.fingerprint, fingerprint("youtube_cover_quota", "recbvjtX95IioyxOi", "quota"));
  assert.equal(output1001.output_id, 1001);
  assert.equal(output1001.content_id, 227);
  assert.equal(classifyYoutubeCoverQuota({
    platform: "YouTube",
    youtube_video_id: "EwRNnNZO0Xc",
    publish_error_stage: "YTS2_THUMBNAIL",
    youtube_error: "backendError",
  }), null);
  assert.equal(classifyYoutubeCoverQuota({
    platform: "YouTube",
    youtube_video_id: "",
    publish_error_stage: "YTS2_THUMBNAIL",
    youtube_error: "quotaExceeded",
  }), null);
  const output994 = classifyYoutubeCoverQuota({
    id: "recXCJSdgdyjp01bg",
    output_id: 994,
    platform: "YouTube",
    publish_status: "Manual Publish Required",
    youtube_video_id: "JL2sm6Zy1YY",
    publish_error_stage: "YTS2_QUOTA",
    youtube_error: "YTS2 poll blocked by quota/HTTP 403: videos.list failed 403 quotaExceeded",
  });
  assert.equal(output994.kind, "youtube_cover_quota");
  assert.equal(output994.fingerprint, fingerprint("youtube_cover_quota", "recXCJSdgdyjp01bg", "quota"));
});

test("phase 4 automerge stays gated to allowlisted paths, caps, and mode", () => {
  assert.equal(pathIsAutoMergeAllowlisted("apps/studio-api/desk-inventory.mjs"), true);
  assert.equal(pathIsAutoMergeAllowlisted("apps/studio-web/index.html"), false);
  const caps = parseDeskCaps({ date: "2026-09-07", auto_merges: 0, auto_prs: 1 }, "2026-09-07");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-api/worker.js"],
    caps,
  }).ok, true);
  assert.equal(deskMayAutomerge({
    mode: "patch",
    paths: ["apps/studio-api/worker.js"],
    caps,
  }).reason, "mode_blocks_automerge");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-web/index.html"],
    caps,
  }).reason, "path_not_allowlisted");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-api/worker.js"],
    caps,
    recurring: true,
  }).reason, "recurring_fingerprint");
  const full = parseDeskCaps({ date: "2026-09-07", auto_merges: 1, max_auto_merges_per_day: 1 }, "2026-09-07");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-api/worker.js"],
    caps: full,
  }).reason, "daily_merge_cap");
  assert.equal(deskMayRestart("pipeline-runner", { restarts: { "pipeline-runner": 2 }, max_restarts_per_service_per_day: 2 }).ok, false);
});

test("inventory payload summarizes escalate counts without inventing work", () => {
  const payload = buildDeskInventoryPayload({
    mode: "observe",
    chicagoDate: "2026-09-06",
    chicagoHour: 22,
    incidents: [
      { kind: "produce_escalated", class: "code_bug", fingerprint: "produce_escalated:rec1:heal_exhausted" },
      { kind: "produce_stale", class: "transient", fingerprint: "produce_stale:rec2:timeout" },
    ],
    health: [{ id: "pipeline-runner", ok: true }],
  });
  assert.equal(payload.schema, "studio.desk-inventory.1");
  assert.equal(payload.summary.total, 2);
  assert.equal(payload.summary.counts.produce_escalated, 1);
  assert.equal(payload.summary.needs_desk, true);
  assert.ok(Array.isArray(payload.checks));
  assert.equal(payload.checks.some((row) => row.kind === "produce_escalated" && row.status === "finding"), true);
  assert.equal(payload.recap.open_count, 2);
  assert.equal(payload.recap.cards[0].status, "Needs you");
  assert.match(payload.recap.cards[0].found, /stuck and marked for investigation/i);
  assert.equal(summarizeIncidents([]).total, 0);
});


test("native photo review strand only heals scheduled complete output after sibling approval", () => {
  const row = {
    id: "recNativeStrand01",
    output_id: 1208,
    output_status: "Ready for Review",
    render_status: "Native Photo Route",
    scheduled_post_date: "2026-10-05T23:00:00.000Z",
    thumbnail_url: "https://media.chicagoshining.com/studio/previews/thumbnails/cover.png",
    platform: "Instagram",
    studio_output_type: "Instagram Carousel",
    content_item_id: "recContent265",
  };
  const sibling = {
    id: "recSibling1209",
    output_status: "Approved for Publishing",
    render_status: "Native Photo Route",
    content_item_id: "recContent265",
  };
  assert.equal(classifyNativePhotoReviewStrand(row, [row]), null);
  const incident = classifyNativePhotoReviewStrand(row, [row, sibling]);
  assert.equal(incident.kind, "native_photo_review_strand");
  assert.equal(incident.actor, "worker_heal");
});

test("native photo review strand does not bypass missing deliverables or unscheduled review", () => {
  const base = {
    id: "recNativeStrand02",
    output_id: 1208,
    output_status: "Ready for Review",
    render_status: "Native Photo Route",
    platform: "Instagram",
    studio_output_type: "Instagram Carousel",
    content_item_id: "recContent265",
  };
  const sibling = { id: "recSibling", output_status: "Approved for Publishing" };
  assert.equal(classifyNativePhotoReviewStrand(base, [base, sibling]), null);
  assert.equal(classifyNativePhotoReviewStrand({
    ...base,
    scheduled_post_date: "2026-10-05T23:00:00.000Z",
    thumbnail_url: "",
  }, [base, sibling]), null);
});

test("native photo approve incomplete catches Output 1245 half-armed AFP", () => {
  const ig1245 = classifyNativePhotoApproveIncomplete({
    id: "reccuk3Nj4jOQX5c1",
    output_id: 1245,
    output_status: "Approved for Publishing",
    render_status: "Native Photo Route",
    platform: "Instagram",
    studio_output_type: "Carousel",
    platform_output_type: "Instagram Carousel",
    review_status: "",
    publish_status: "",
    auto_publish_enabled: false,
    carousel_slide_count: 0,
    ig_carousel_status: "",
    scheduled_post_date: "2026-10-01T23:00:00.000Z",
    thumbnail_url: "https://media.chicagoshining.com/studio/previews/thumbnails/cover.png",
  });
  assert.equal(ig1245.kind, "native_photo_approve_incomplete");
  assert.equal(ig1245.class, "transient");
  assert.equal(ig1245.actor, "worker_heal");
  assert.equal(ig1245.fingerprint, fingerprint("native_photo_approve_incomplete", "reccuk3Nj4jOQX5c1", "unarmed"));
  assert.equal(classifyNativePhotoApproveIncomplete({
    id: "recArmed",
    output_id: 1246,
    output_status: "Approved for Publishing",
    render_status: "Native Photo Route",
    platform: "Facebook",
    studio_output_type: "Multi-Image Post",
    platform_output_type: "Facebook Photo Set",
    review_status: "Approved",
    publish_status: "Ready to Schedule",
    auto_publish_enabled: true,
    carousel_slide_count: 5,
    fb_publish_status: "Ready for Assets",
  }), null);
  assert.ok(CLASSIFIER_KINDS.includes("native_photo_approve_incomplete"));
  assert.ok(CLASSIFIER_KINDS.includes("native_photo_review_strand"));
});
