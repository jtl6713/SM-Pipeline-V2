import assert from "node:assert/strict";
import test from "node:test";
import {
  YOUTUBE_MANUAL_LIVE_VIDEO_HEAL_FORMULA,
  YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA,
  isYouTubePostUrl,
  manualPublishRequiredFields,
  nextPacificMidnightIso,
  parseYouTubeVideoId,
  youtubeCompleteEligibility,
  youtubeLiveVideoIdFromFields,
  youtubeLooksLikeQuotaOrWrapped403,
  youtubeCoverQuotaOnly,
  youtubeCoverQuotaParkFields,
  youtubeLiveQuotaOnly,
  youtubeManualActionRequired,
  youtubeManualCloseFields,
  outputTerminalPublishedFields,
  staleManualFlagsOnPublishedFields,
  youtubeManualLiveVideoHealCandidate,
  youtubeNeedsUrlEntry,
  youtubeOembedUrl,
  youtubeWatchUrl,
} from "./youtube-manual-publish.mjs";

test("detects wrapped videos.list 403 quota text from undeployed YTS2_POLL path", () => {
  const fields = {
    Platform: "YouTube",
    Publish_Status: "Publishing",
    Publish_Error_Stage: "YTS2_POLL",
    Publish_Error_Message: "Temporary error polling YouTube processing status.",
    YouTube_Error_Message:
      "YTS2 poll failed. HTTP 403: {'error': 'videos.list failed 403', 'upstream': {'error': {'code': 403, 'reason': 'quotaExceeded'}}}",
  };
  assert.equal(youtubeLooksLikeQuotaOrWrapped403(fields), true);
  assert.equal(youtubeManualActionRequired(fields), true);
});

test("published rows ignore stale manual fallback flags", () => {
  const fields = {
    Platform: "YouTube",
    Publish_Status: "Published",
    Output_Status: "Published",
    YouTube_Stage: "YT2",
    Manual_Fallback_Required: true,
    Manual_Completion_Status: "Required",
  };
  assert.equal(outputTerminalPublishedFields(fields), true);
  assert.equal(youtubeManualActionRequired(fields), false);
  assert.deepEqual(staleManualFlagsOnPublishedFields(fields), {
    Manual_Fallback_Required: false,
    Manual_Completion_Status: "Not Required",
    Publish_Error_Stage: "",
    Publish_Error_Message: "",
    YouTube_Error_Message: "",
    Publish_Retry_Eligible: false,
  });
});

test("manual flags still win without quota text", () => {
  assert.equal(
    youtubeManualActionRequired({
      Platform: "YouTube",
      Publish_Status: "Manual Publish Required",
      YouTube_Error_Message: "anything",
    }),
    true
  );
  assert.equal(
    youtubeManualActionRequired({
      Platform: "YouTube",
      Publish_Status: "Publishing",
      Manual_Fallback_Required: true,
    }),
    true
  );
});

test("non-quota YouTube errors are not treated as manual", () => {
  assert.equal(
    youtubeManualActionRequired({
      Platform: "YouTube",
      Publish_Status: "Publishing",
      Publish_Error_Stage: "YTS2_POLL",
      YouTube_Error_Message: "YTS2 poll failed. HTTP 500: backendError",
    }),
    false
  );
});

test("nextPacificMidnightIso is after now and lands on LA midnight", () => {
  const now = new Date("2026-09-12T13:30:00.000Z"); // 06:30 PDT
  const iso = nextPacificMidnightIso(now);
  const next = new Date(iso);
  assert.ok(next.getTime() > now.getTime());
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(next);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  assert.equal(get("hour"), "00");
  assert.equal(get("minute"), "00");
  assert.equal(get("day"), "13");
  assert.equal(iso, "2026-09-13T07:00:00.000Z");
});

test("manualPublishRequiredFields parks until Pacific midnight", () => {
  const fields = manualPublishRequiredFields({
    youtubeMessage: "parked",
    nextRetryAt: "2026-09-13T07:00:00.000Z",
  });
  assert.equal(fields.Publish_Status, "Manual Publish Required");
  assert.equal(fields.Manual_Fallback_Required, true);
  assert.equal(fields.Manual_Completion_Status, "Required");
  assert.equal(fields.Publish_Next_Retry_At, "2026-09-13T07:00:00.000Z");
  assert.match(YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA, /YTS2_POLL/);
  assert.match(YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA, /YTS2_THUMBNAIL/);
  assert.match(YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA, /YTS2_QUOTA/);
  assert.match(YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA, /failed 403/);
});

test("live Short cover quota is not Manual Action Required", () => {
  const fields = {
    Platform: "YouTube",
    Publish_Status: "Publishing",
    YouTube_Video_ID: "EwRNnNZO0Xc",
    Publish_Error_Stage: "YTS2_THUMBNAIL",
    Publish_Error_Message: "Temporary error uploading YouTube thumbnail.",
    YouTube_Error_Message: "YTS2 thumbnail upload/compression failed. HTTP 500: thumbnails.set failed 403 quotaExceeded",
  };
  assert.equal(youtubeCoverQuotaOnly(fields), true);
  assert.equal(youtubeManualActionRequired(fields), false);
  const parked = youtubeCoverQuotaParkFields({
    errorStage: "YTS2_THUMBNAIL",
    youtubeMessage: fields.YouTube_Error_Message,
    nextRetryAt: "2026-09-27T07:00:00.000Z",
  });
  assert.equal(parked.Publish_Status, "Publishing");
  assert.equal(parked.Publish_Error_Stage, "YTS2_THUMBNAIL");
  assert.equal(parked.Manual_Fallback_Required, false);
  assert.equal(parked.Publish_Next_Retry_At, "2026-09-27T07:00:00.000Z");
  assert.match(parked.Publish_Error_Message, /already live/i);
});

test("live Short poll quota is not Manual Action Required even after YTS2 parks the row", () => {
  const fields = {
    Platform: "YouTube",
    Publish_Status: "Manual Publish Required",
    YouTube_Video_ID: "JL2sm6Zy1YY",
    Publish_Error_Stage: "YTS2_QUOTA",
    Manual_Fallback_Required: true,
    Manual_Completion_Status: "Required",
    Publish_Error_Message: "YouTube API quota exhausted while polling processing. Manual publish required until the next automatic retry after Pacific midnight.",
    YouTube_Error_Message: "YTS2 poll blocked by quota/HTTP 403: videos.list failed 403 quotaExceeded",
  };
  assert.equal(youtubeLiveQuotaOnly(fields), true);
  assert.equal(youtubeManualActionRequired(fields), false);
});

test("parses watch, shorts, and youtu.be URLs", () => {
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/watch?v=jRARA4azmDs"), "jRARA4azmDs");
  assert.equal(parseYouTubeVideoId("https://youtu.be/jRARA4azmDs?si=abc"), "jRARA4azmDs");
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/shorts/jRARA4azmDs"), "jRARA4azmDs");
  assert.equal(isYouTubePostUrl("https://www.tiktok.com/@x/video/1"), false);
});

test("Studio can close a quota-parked YouTube row with a live URL", () => {
  const waiting = {
    platform: "YouTube",
    do_not_publish: false,
    publish_status: "Manual Publish Required",
    output_status: "Approved for Publishing",
    youtube_stage: "YT2",
    studio_state: "Manual Action Required",
    youtube_video_id: "jRARA4azmDs",
  };
  assert.equal(youtubeCompleteEligibility(waiting), null);
  assert.equal(youtubeNeedsUrlEntry(waiting), false);
  assert.equal(youtubeNeedsUrlEntry({ ...waiting, youtube_video_id: "" }), true);
  assert.equal(youtubeNeedsUrlEntry({
    ...waiting,
    youtube_video_id: "",
    platform_post_url: "https://www.youtube.com/watch?v=jRARA4azmDs",
  }), false);
  assert.equal(youtubeCompleteEligibility({ ...waiting, publish_status: "Published" }), "already_published");
  assert.equal(youtubeNeedsUrlEntry({ platform: "YouTube", publish_status: "", youtube_stage: "", studio_state: "Ready for Review" }), false);
});

test("manual close fields mark the output fully published and stop retries", () => {
  const fields = youtubeManualCloseFields({
    url: "https://www.youtube.com/watch?v=jRARA4azmDs",
    now: "2026-09-13T14:40:00.000Z",
    existingNotes: "YTS2 quota",
    privacy: "private",
  });
  assert.equal(fields.YouTube_Video_ID, "jRARA4azmDs");
  assert.equal(fields.Platform_Post_URL, "https://www.youtube.com/watch?v=jRARA4azmDs");
  assert.equal(fields.Publish_Status, "Published Privately");
  assert.equal(fields.Output_Status, "Published");
  assert.equal(fields.YouTube_Stage, "Complete");
  assert.equal(fields.YouTube_Thumbnail_Status, "Pending");
  assert.equal(fields.Manual_Completion_Status, "Completed");
  assert.equal(fields.Publish_Retry_Eligible, false);
  assert.match(fields.Output_Notes, /Studio YouTube publication confirmed/);
});

test("live video heal resolves ids from stored fields and builds oEmbed probe URL", () => {
  assert.equal(
    youtubeLiveVideoIdFromFields({
      YouTube_Video_ID: "nYAitOg42b4",
      Platform_Post_URL: "",
    }),
    "nYAitOg42b4"
  );
  assert.equal(
    youtubeLiveVideoIdFromFields({
      Platform_Post_URL: "https://www.youtube.com/shorts/nYAitOg42b4",
    }),
    "nYAitOg42b4"
  );
  const watch = youtubeWatchUrl("nYAitOg42b4");
  assert.match(youtubeOembedUrl(watch), /nYAitOg42b4/);
  assert.match(YOUTUBE_MANUAL_LIVE_VIDEO_HEAL_FORMULA, /Manual Publish Required/);
});

test("manual live heal candidate uses stored video id without a new URL paste", () => {
  const candidate = youtubeManualLiveVideoHealCandidate({
    Platform: "YouTube",
    Do_Not_Publish: false,
    Publish_Status: "Manual Publish Required",
    Output_Status: "Approved for Publishing",
    YouTube_Stage: "YT2",
    Manual_Fallback_Required: true,
    Manual_Completion_Status: "Required",
    YouTube_Video_ID: "nYAitOg42b4",
    Platform_Post_URL: "https://www.youtube.com/watch?v=nYAitOg42b4",
  });
  assert.deepEqual(candidate, {
    videoId: "nYAitOg42b4",
    liveUrl: "https://www.youtube.com/watch?v=nYAitOg42b4",
  });
  assert.equal(
    youtubeManualLiveVideoHealCandidate({
      Platform: "YouTube",
      Publish_Status: "Published",
      Output_Status: "Published",
      YouTube_Stage: "Complete",
      YouTube_Video_ID: "nYAitOg42b4",
    }),
    null
  );
});

test("auto-healed close notes explain cron verification", () => {
  const fields = youtubeManualCloseFields({
    url: "https://www.youtube.com/watch?v=nYAitOg42b4",
    now: "2026-09-20T14:55:00.000Z",
    autoHealed: true,
  });
  assert.match(fields.Output_Notes, /auto-healed a manual YouTube row/);
  assert.equal(fields.Manual_Fallback_Required, false);
});
