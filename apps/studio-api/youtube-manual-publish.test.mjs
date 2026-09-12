import assert from "node:assert/strict";
import test from "node:test";
import {
  YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA,
  manualPublishRequiredFields,
  nextPacificMidnightIso,
  youtubeLooksLikeQuotaOrWrapped403,
  youtubeManualActionRequired,
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
  assert.match(YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA, /failed 403/);
});
