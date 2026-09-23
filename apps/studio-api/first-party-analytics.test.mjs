import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsAgeHours,
  analyticsCadenceForAgeHours,
  analyticsMeasurementBucket,
  analyticsNextSyncAt,
  analyticsObservationKey,
  nativePlatformId,
  normalizeAnalyticsSnapshot,
  sanitizeAnalyticsError,
} from "./first-party-analytics.mjs";

test("cadence is dense early and relaxes with age", () => {
  assert.equal(analyticsCadenceForAgeHours(2).refreshHours, 2);
  assert.equal(analyticsCadenceForAgeHours(12).refreshHours, 4);
  assert.equal(analyticsCadenceForAgeHours(30).refreshHours, 8);
  assert.equal(analyticsCadenceForAgeHours(72).refreshHours, 24);
  assert.equal(analyticsCadenceForAgeHours(250).refreshHours, 48);
  assert.equal(analyticsCadenceForAgeHours(500).refreshHours, 96);
  assert.equal(analyticsCadenceForAgeHours(800).refreshHours, 720);
});

test("snapshot buckets preserve a growth curve without duplicate minute-level rows", () => {
  const published = "2026-09-20T00:00:00.000Z";
  const a = "2026-09-20T03:01:00.000Z";
  const b = "2026-09-20T03:55:00.000Z";
  const c = "2026-09-20T04:01:00.000Z";
  assert.equal(analyticsAgeHours(published, a) > 3, true);
  assert.equal(analyticsMeasurementBucket(published, a), analyticsMeasurementBucket(published, b));
  assert.notEqual(analyticsMeasurementBucket(published, b), analyticsMeasurementBucket(published, c));
  assert.ok(analyticsNextSyncAt(published, a));
});

test("normalization keeps unavailable metrics null instead of zero", () => {
  const snapshot = normalizeAnalyticsSnapshot("TikTok", { view_count: 50, like_count: 4, comment_count: 1, share_count: 2 }, {
    nativePostId: "123456789",
    publishedAt: "2026-09-20T00:00:00.000Z",
    measuredAt: "2026-09-20T04:00:00.000Z",
  });
  assert.equal(snapshot.views, 50);
  assert.equal(snapshot.reach, null);
  assert.equal(snapshot.watch_time_sec, null);
  assert.equal(snapshot.total_interactions, 7);
});

test("native IDs prefer platform-specific fields", () => {
  assert.equal(nativePlatformId("YouTube", { Platform_Post_ID: "urlish", YouTube_Video_ID: "abc123" }), "abc123");
  assert.equal(nativePlatformId("Instagram", { Platform_Post_ID: "1", Platform_Media_ID: "2" }), "2");
  assert.equal(nativePlatformId("TikTok", { Platform_Post_ID: "https://www.tiktok.com/@x/video/777777777777" }), "777777777777");
});

test("observation key is profile/post/bucket specific", () => {
  const args = { platform: "YouTube", profileId: "recABC", nativePostId: "vid1", publishedAt: "2026-09-20T00:00:00Z" };
  const a = analyticsObservationKey({ ...args, measuredAt: "2026-09-20T02:00:00Z" });
  const b = analyticsObservationKey({ ...args, measuredAt: "2026-09-20T02:30:00Z" });
  assert.equal(a, b);
  assert.match(a, /first_party:youtube:recABC:vid1:/);
});

test("analytics errors redact bearer and token query values", () => {
  const msg = sanitizeAnalyticsError("bad https://x?access_token=secret123 Authorization: Bearer xyz.abc");
  assert.equal(msg.includes("secret123"), false);
  assert.equal(msg.includes("xyz.abc"), false);
});
