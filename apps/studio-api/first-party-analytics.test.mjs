import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  analyticsAgeHours,
  analyticsCadenceForAgeHours,
  analyticsMeasurementBucket,
  analyticsNextSyncAt,
  analyticsObservationKey,
  fetchFacebookOwnedPostAnalytics,
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
  assert.equal(nativePlatformId("Instagram", { Platform_Post_ID: "1", Platform_Media_ID: "2" }), "1");
  assert.equal(nativePlatformId("Instagram", { Platform_Post_ID: "1", Platform_Media_ID: "2", IG_Carousel_Published_Media_ID: "3" }), "3");
  assert.equal(nativePlatformId("Facebook", { Platform_Post_ID: "story-url-id", Platform_Media_ID: "story-media-id" }), "story-media-id");
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

test("Facebook owned analytics works for video-style objects without reactions", async () => {
  const requested = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  const fetchImpl = async (rawUrl) => {
    const url = new URL(rawUrl);
    requested.push(url.toString());
    if (url.pathname.endsWith("/123456789/insights")) {
      return json({
        data: [
          { name: "post_media_view", values: [{ value: 900 }] },
          { name: "post_total_media_view_unique", values: [{ value: 700 }] },
        ],
      });
    }
    const fields = url.searchParams.get("fields") || "";
    if (fields.includes("likes.limit(0).summary(true)")) {
      return json({
        id: "123456789",
        created_time: "2026-09-20T12:00:00+0000",
        permalink_url: "https://www.facebook.com/reel/123456789",
        likes: { summary: { total_count: 12 } },
        comments: { summary: { total_count: 3 } },
        shares: { count: 2 },
      });
    }
    return json({ id: "123456789", created_time: "2026-09-20T12:00:00+0000" });
  };

  const result = await fetchFacebookOwnedPostAnalytics({
    postId: "123456789",
    token: "test-token",
    fetchImpl,
  });

  assert.equal(result.views, 900);
  assert.equal(result.reach, 700);
  assert.equal(result.likes, 12);
  assert.equal(result.comments, 3);
  assert.equal(result.shares, 2);
  assert.equal(result.total_interactions, 17);
  assert.equal(requested.some((url) => url.includes("reactions")), false);
});


const workerSource = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");

test("connection status helper does not reference sweep-local counters", () => {
  const start = workerSource.indexOf("function studioInsightsLatestSyncByPlatform(rows) {");
  const end = workerSource.indexOf("\n\nasync function getInsightsConnections", start);
  assert.ok(start >= 0 && end > start);
  const helper = workerSource.slice(start, end);
  assert.doesNotMatch(helper, /\bconsidered\b|\blimit\b/);
});

test("first-party analytics sweep allocates work independently by content profile", () => {
  const start = workerSource.indexOf("async function studioSweepPublishedInsights(env, options = {}) {");
  const end = workerSource.indexOf("\n\nasync function studioFetchOutputInsights", start);
  assert.ok(start >= 0 && end > start);
  const sweep = workerSource.slice(start, end);
  assert.match(sweep, /listContentProfileRecords/);
  assert.match(sweep, /contentProfileFilterFormula\(profileRecord\)/);
  assert.match(sweep, /perProfileLimit/);
  assert.match(sweep, /Round-robin execution/);
  assert.match(sweep, /Insights_As_Of/);
});


const youtubeUploaderSource = fs.readFileSync(
  new URL("../../services/youtube-uploader/youtube-upload-service.js", import.meta.url),
  "utf8"
);

test("youtube uploader tests analytics independently from channel identity", () => {
  const start = youtubeUploaderSource.indexOf("async function oauthStatus() {");
  const end = youtubeUploaderSource.indexOf("\n\nasync function deleteVideo", start);
  assert.ok(start >= 0 && end > start);
  const status = youtubeUploaderSource.slice(start, end);
  assert.match(status, /channel_identity_error/);
  assert.match(status, /data_api_quota_exceeded/);
  assert.match(status, /Always test Analytics independently/);
  assert.match(status, /const analyticsStatus = await analyticsReadStatus\(refreshed\.token\)/);
});

test("studio treats healthy YouTube analytics as connected even when Data API quota is exhausted", () => {
  const marker = 'result.youtube.status = body?.refresh_ok && body?.analytics_read_ok';
  const start = workerSource.indexOf(marker);
  assert.ok(start >= 0);
  const block = workerSource.slice(start, start + 1800);
  assert.match(block, /"connected"/);
  assert.match(block, /data_api_quota_exceeded/);
  assert.match(block, /analytics remain connected/);
});


test("Facebook owned analytics resolves page-scoped post IDs and current media-view metrics", async () => {
  const requested = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  const fetchImpl = async (rawUrl) => {
    const url = new URL(rawUrl);
    requested.push(url.pathname + "?" + url.searchParams.toString());
    if (url.pathname.endsWith("/1406705239181984_1328690532508711")) {
      return json({
        id: "1406705239181984_1328690532508711",
        created_time: "2026-09-25T07:31:50+0000",
        likes: { summary: { total_count: 2 } },
        comments: { summary: { total_count: 1 } },
        shares: { count: 1 },
      });
    }
    if (url.pathname.endsWith("/1406705239181984_1328690532508711/insights")) {
      return json({
        data: [
          { name: "post_media_view", values: [{ value: 321 }] },
          { name: "post_total_media_view_unique", values: [{ value: 200 }] },
          { name: "post_reactions_like_total", values: [{ value: 3 }] },
          { name: "post_reactions_love_total", values: [{ value: 1 }] },
        ],
      });
    }
    return json({ error: { code: 100, message: "Unsupported get request" } }, 400);
  };
  const result = await fetchFacebookOwnedPostAnalytics({
    postId: "1328690532508711",
    pageId: "1406705239181984",
    token: "test-token",
    fetchImpl,
  });
  assert.equal(result.id, "1406705239181984_1328690532508711");
  assert.equal(result.views, 321);
  assert.equal(result.reach, 200);
  assert.equal(result.likes, 4);
  assert.equal(result.comments, 1);
  assert.equal(result.shares, 1);
  assert.equal(result.total_interactions, 6);
  assert.equal(requested.some((url) => url.includes("1406705239181984_1328690532508711")), true);
});

test("Facebook native ID prefers media ID for story-style outputs", () => {
  assert.equal(
    nativePlatformId("Facebook", { Platform_Post_ID: "story-url-id", Platform_Media_ID: "story-media-id" }),
    "story-media-id"
  );
});

test("Facebook connection status treats sample-post failures as warnings", () => {
  const start = workerSource.indexOf('const page = await studioInsightsMetaIdentity(settings.FACEBOOK_PAGE_ID');
  assert.ok(start >= 0);
  const block = workerSource.slice(start, start + 2200);
  assert.match(block, /result\.facebook\.status = "connected"/);
  assert.match(block, /result\.facebook\.sync_warning/);
  assert.match(block, /pageId: result\.facebook\.account_id/);
});


test("connected account cards hide historical per-post errors", () => {
  const marker = "Account Connections is an account-health surface";
  const start = workerSource.indexOf(marker);
  assert.ok(start >= 0);
  const block = workerSource.slice(start - 500, start + 1200);
  assert.match(block, /item\.last_error = item\.status === "connected"/);
  assert.match(block, /\? null/);
  assert.match(block, /activity\.last_error/);
});
