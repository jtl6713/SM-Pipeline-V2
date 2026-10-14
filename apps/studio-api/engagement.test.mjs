import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_CAPABILITIES,
  actionSupported,
  scorePostRelevance,
  filterAndRankCandidates,
  normalizeGeneratedComments,
  sanitizeCommentSuggestion,
  normalizeEngagementProfile,
  fallbackCommentSuggestions,
  engagementDedupeKey,
  creatorRecentlyEngaged,
  findDuplicateAction,
  makeIdempotencyKey,
  classifyEngagementFailure,
  mergeEngagementSettings,
  defaultEngagementSettings,
  computeEngagementInsights,
  mapYoutubeSearchItem,
  buildTargetRecord,
  buildActionRecord,
  enrichEngagementHistory,
  pruneEngagementStore,
  ensureThreeCommentSuggestions,
  dailyActionCount,
  nearIdenticalComment,
  backoffMs,
} from "./engagement.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("city profile keys map onto engagement profiles", () => {
  assert.equal(normalizeEngagementProfile("new-york"), "nyc");
  assert.equal(normalizeEngagementProfile("New York"), "nyc");
  assert.equal(normalizeEngagementProfile("los-angeles"), "la");
  assert.equal(normalizeEngagementProfile("nyc"), "nyc");
});

test("capability matrix marks YouTube comment/like supported and TikTok unsupported", () => {
  assert.equal(PLATFORM_CAPABILITIES.youtube.stage_b_comment, true);
  assert.equal(PLATFORM_CAPABILITIES.youtube.stage_b_like, true);
  assert.equal(actionSupported("youtube", "comment"), true);
  assert.equal(actionSupported("tiktok", "comment"), false);
  assert.equal(actionSupported("instagram", "comment"), false);
  assert.equal(PLATFORM_CAPABILITIES.facebook.discover, "unsupported");
});

test("profile-specific relevance prefers Chicago architecture over unrelated travel", () => {
  const settings = defaultEngagementSettings("chicago");
  const hit = scorePostRelevance(
    { caption: "Chicago river bridges at blue hour #architecture #chicago", creator_name: "Local Photog" },
    settings
  );
  const miss = scorePostRelevance(
    { caption: "My cat sleeping on a couch #pets", creator_name: "CatAccount" },
    settings
  );
  assert.ok(hit.score >= settings.relevance_threshold);
  assert.ok(miss.score < settings.relevance_threshold);
});

test("deduplication and ranking keep unique high-relevance posts", () => {
  const settings = mergeEngagementSettings({ relevance_threshold: 0.4, max_candidates_per_run: 5 }, "nyc");
  const posts = [
    { platform: "youtube", post_id: "a1", caption: "Manhattan architecture walk", creator_id: "c1", creator_name: "A" },
    { platform: "youtube", post_id: "a1", caption: "Manhattan architecture walk", creator_id: "c1", creator_name: "A" },
    { platform: "youtube", post_id: "b2", caption: "Brooklyn bridge photography", creator_id: "c2", creator_name: "B" },
    { platform: "youtube", post_id: "c3", caption: "Unrelated baking tutorial", creator_id: "c3", creator_name: "C" },
  ];
  const existing = [{ dedupe_key: engagementDedupeKey("youtube", "b2", "c2") }];
  const ranked = filterAndRankCandidates(posts, settings, existing);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].post_id, "a1");
});

test("AI comment sanitizer blocks generic praise, links, and visit claims", () => {
  assert.equal(sanitizeCommentSuggestion("Amazing!"), "");
  assert.equal(sanitizeCommentSuggestion("Cool https://spam.example"), "");
  assert.equal(sanitizeCommentSuggestion("I visited there last week — gorgeous!"), "");
  const ok = sanitizeCommentSuggestion("Love how you captured the geometric facade details.");
  assert.match(ok, /geometric facade/i);
  const normalized = normalizeGeneratedComments({
    comments: ["Amazing!", "Love how you captured the geometric facade details.", "Love how you captured the geometric facade details."],
  });
  assert.equal(normalized.comments.length, 1);
});

test("fallback comments and near-identical detection", () => {
  const comments = fallbackCommentSuggestions({
    caption: "Chicago skyline from the riverwalk",
    matched_terms: ["chicago skyline"],
  });
  assert.ok(comments.comments.length >= 2);
  assert.equal(nearIdenticalComment(comments.comments[0], comments.comments[0]), true);
  assert.equal(nearIdenticalComment("Unique angle on the bridge trusses.", "Totally different praise."), false);
});

test("approval and unsupported API behavior helpers", () => {
  const settings = defaultEngagementSettings("la");
  const post = mapYoutubeSearchItem({
    id: { videoId: "vid123" },
    snippet: {
      title: "Downtown LA architecture walk",
      description: "Exploring DTLA landmarks",
      channelId: "ch1",
      channelTitle: "LA Shooter",
      publishedAt: "2026-10-01T12:00:00Z",
      thumbnails: { medium: { url: "https://i.ytimg.com/vi/vid123/mqdefault.jpg" } },
    },
  });
  const ranked = filterAndRankCandidates([post], settings, []);
  assert.equal(ranked.length, 1);
  const cityTitle = scorePostRelevance(
    { caption: "Los Angeles in 4K | City of Angels", creator_name: "Travel Cuts" },
    settings
  );
  assert.ok(cityTitle.score >= settings.relevance_threshold);
  const shortTitle = scorePostRelevance(
    { caption: "Best of LA", description: "A walk through Hollywood and the coast." },
    settings
  );
  assert.ok(shortTitle.score >= settings.relevance_threshold);
  const unrelated = scorePostRelevance(
    { caption: "Yosemite valley hike at sunrise", creator_name: "Park Notes" },
    settings
  );
  assert.ok(unrelated.score < settings.relevance_threshold);
  const embedded = scorePostRelevance(
    { caption: "Glass architecture in a plaza", creator_name: "Design Daily" },
    settings
  );
  assert.ok(embedded.score < settings.relevance_threshold);
  const target = buildTargetRecord(ranked[0], settings, ["Strong DTLA framing — great sense of place."]);
  assert.equal(target.approval_status, "pending");
  assert.equal(actionSupported(target.platform, "comment"), true);
  assert.equal(actionSupported("facebook", "like"), false);
});

test("provider authorization / rate-limit classification and retry safety", () => {
  assert.equal(classifyEngagementFailure("OAuth refresh failed 401").kind, "engagement_permission");
  assert.equal(classifyEngagementFailure("quotaExceeded dailyLimitExceeded").kind, "engagement_quota");
  assert.equal(classifyEngagementFailure("unsupported on TikTok").kind, "engagement_unsupported");
  assert.equal(classifyEngagementFailure("ambiguous publish result").kind, "engagement_ambiguous");
  assert.ok(backoffMs(0) >= 1000);
  assert.ok(backoffMs(5) > backoffMs(2));
});

test("idempotent comment publishing and creator cooldowns", () => {
  const key = makeIdempotencyKey("chicago", "youtube", "comment", "vid1");
  const published = {
    idempotency_key: key,
    execution_status: "published",
    approval_status: "approved",
    action_type: "comment",
    platform: "youtube",
    creator_id: "ch1",
    profile: "chicago",
    approved_at: new Date().toISOString(),
    executed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  const approvedOnly = {
    ...published,
    execution_status: "pending",
    executed_at: null,
  };
  const queued = {
    ...published,
    execution_status: "queued",
    executed_at: null,
  };
  assert.ok(findDuplicateAction([published], key));
  assert.equal(findDuplicateAction([approvedOnly], key), null);
  assert.equal(findDuplicateAction([queued], key), null);
  assert.equal(creatorRecentlyEngaged([published], "ch1", "youtube", 72), true);
  assert.equal(creatorRecentlyEngaged([approvedOnly], "ch1", "youtube", 72), false);
  assert.equal(dailyActionCount([published], "chicago", "youtube", "comment"), 1);
  assert.equal(dailyActionCount([approvedOnly, queued], "chicago", "youtube", "comment"), 0);
});

test("quality agent error classification signatures are distinct", () => {
  const kinds = [
    "duplicate engagement",
    "near-identical comment",
    "unsupported platform",
    "permission expired",
    "quota 429",
    "comment failed 500",
    "wrong profile",
    "irrelevant AI suggestion",
    "video not found 404",
    "ambiguous publish",
  ].map((text) => classifyEngagementFailure(text).kind);
  assert.ok(new Set(kinds).size >= 8);
});

test("insights only count confirmed publishes and never invent growth", () => {
  const insights = computeEngagementInsights({
    targets: [{
      profile: "chicago",
      suggested_comments: ["a", "b"],
      platform: "youtube",
      creator_id: "UCabc123",
      creator_name: "TripVerse",
    }],
    actions: [
      { profile: "chicago", platform: "youtube", action_type: "comment", approval_status: "approved", execution_status: "published", creator_id: "UCabc123" },
      { profile: "chicago", platform: "youtube", action_type: "like", approval_status: "approved", execution_status: "published", creator_id: "UCabc123" },
      { profile: "chicago", platform: "tiktok", action_type: "comment", approval_status: "rejected", execution_status: "failed", creator_id: "c2" },
    ],
  }, "chicago");
  assert.equal(insights.comments_published, 1);
  assert.equal(insights.likes_completed, 1);
  assert.match(insights.note, /not attributed/i);
  assert.equal(insights.top_creators[0]?.creator, "TripVerse");
  assert.notEqual(insights.top_creators[0]?.creator, "UCabc123");
});

test("prune keeps the engagement ledger under Airtable's long-text limit", () => {
  const store = {
    targets: Array.from({ length: 40 }, (_, index) => ({
      target_id: `et_${index}`,
      profile: "chicago",
      caption: "c".repeat(2000),
      content_summary: "s".repeat(500),
      suggested_comments: ["a".repeat(300), "b".repeat(300), "c".repeat(300)],
      discovered_at: new Date(Date.now() - index * 1000).toISOString(),
    })),
    actions: Array.from({ length: 60 }, (_, index) => ({
      action_id: `ea_${index}`,
      profile: index % 2 ? "chicago" : "la",
      action_type: "comment",
      execution_status: "published",
      created_at: new Date(Date.now() - index * 1000).toISOString(),
    })),
    suspended: {},
  };
  const pruned = pruneEngagementStore(store);
  const size = JSON.stringify(pruned).length;
  assert.ok(size <= 80000, `ledger is ${size} chars`);
  assert.ok(pruned.actions.some((row) => row.profile === "chicago"));
  assert.ok(pruned.targets.some((row) => row.profile === "chicago"));
  assert.ok(
    pruned.targets.every((row) => (row.suggested_comments || []).length === 3),
    "ledger slim must keep all three comment options",
  );
  const mixed = pruneEngagementStore({
    targets: ["chicago", "miami", "la", "nyc"].flatMap((profile) => (
      Array.from({ length: 12 }, (_, index) => ({
        target_id: `${profile}_${index}`,
        profile,
        caption: "c".repeat(2000),
        discovered_at: new Date(Date.now() - index * 1000).toISOString(),
      }))
    )),
    actions: [],
    suspended: {},
  });
  for (const profile of ["chicago", "miami", "la", "nyc"]) {
    assert.ok(mixed.targets.some((row) => row.profile === profile), profile);
  }
  assert.ok(JSON.stringify(mixed).length <= 80000);
});

test("ensureThreeCommentSuggestions restores Use #2/#3 after over-slim", () => {
  const repaired = ensureThreeCommentSuggestions({
    target_id: "et_slim",
    caption: "Chicago riverwalk skyline at dusk",
    matched_terms: ["chicago skyline"],
    suggested_comments: ["Love how you framed this riverwalk skyline."],
    selected_comment: "Love how you framed this riverwalk skyline.",
    approval_status: "pending",
    eligibility_status: "Suggested",
  });
  assert.equal(repaired.suggested_comments.length, 3);
  assert.equal(repaired.suggested_comments[0], "Love how you framed this riverwalk skyline.");
  assert.ok(repaired.suggested_comments[1]);
  assert.ok(repaired.suggested_comments[2]);
});

test("worker wires engagement routes, cron, and version bump", () => {
  assert.match(worker, /from "\.\/engagement-service\.mjs"/);
  assert.match(worker, /\/api\/engagement\//);
  assert.match(worker, /studio_engagement_v1:\s*true/);
  assert.match(worker, /0.10.595-scheduled-target-refill/);
  assert.match(worker, /studioRunEngagementDiscovery/);
  assert.match(worker, /studioEngagementCron/);
  assert.match(worker, /engagementThemeContextRecord/);
  assert.match(worker, /engagementDeps\(profile\)/);
});

test("history rows expose channel name and clickable post URL", () => {
  const target = {
    target_id: "et_1",
    profile: "miami",
    platform: "youtube",
    creator_id: "UCabc",
    creator_name: "TripVerse",
    post_id: "qH7IQboSKuc",
    post_url: "https://www.youtube.com/watch?v=qH7IQboSKuc",
    selected_comment: "Nice walls",
    suggested_comments: ["Nice walls"],
  };
  const action = buildActionRecord({
    target,
    actionType: "comment",
    comment: "Nice walls",
    approvalStatus: "approved",
    executionStatus: "published",
    publishedId: "Ugxyz",
  });
  assert.equal(action.creator_name, "TripVerse");
  assert.equal(action.post_url, "https://www.youtube.com/watch?v=qH7IQboSKuc");

  const legacy = enrichEngagementHistory(
    [{ action_id: "ea_old", target_id: "et_1", platform: "youtube", post_id: "qH7IQboSKuc", creator_id: "UCabc" }],
    [target]
  );
  assert.equal(legacy[0].creator_name, "TripVerse");
  assert.equal(legacy[0].post_url, "https://www.youtube.com/watch?v=qH7IQboSKuc");

  const ui = fs.readFileSync(path.join(here, "../studio-web/assets/engagement-1008.js"), "utf8");
  assert.match(ui, /<th>Channel<\/th>/);
  assert.match(ui, /Open post/);
  assert.match(ui, /row\.post_url/);
  const service = fs.readFileSync(path.join(here, "engagement-service.mjs"), "utf8");
  assert.match(service, /enrichEngagementHistory/);
});

test("Stage B checkbox on approve/comment persists per profile", () => {
  const service = fs.readFileSync(path.join(here, "engagement-service.mjs"), "utf8");
  const ui = fs.readFileSync(path.join(here, "../studio-web/assets/engagement-1008.js"), "utf8");
  assert.match(service, /payload\.stage_b_enabled === true/);
  assert.match(service, /stage_b_disabled:\s*true/);
  assert.match(ui, /stage_b_enabled:\s*stageBChecked\(\)/);
  assert.match(ui, /engagementStageB[\s\S]*addEventListener\("change"/);
});

test("Comment is one-click approve+publish; Approve Comment button is gone", () => {
  const service = fs.readFileSync(path.join(here, "engagement-service.mjs"), "utf8");
  const ui = fs.readFileSync(path.join(here, "../studio-web/assets/engagement-1008.js"), "utf8");
  assert.match(ui, /primary-button" data-action="comment"/);
  assert.doesNotMatch(ui, /Approve Comment/);
  assert.match(service, /Approve used to only queue/);
  assert.match(service, /One-click Comment \(and Stage B Approve\) locks the chosen text/);
  assert.match(service, /Click Comment to publish where supported/);
});

test("YouTube engage probes uploader health for engagement build before comment", () => {
  const service = fs.readFileSync(path.join(here, "engagement-service.mjs"), "utf8");
  assert.match(service, /\/health/);
  assert.match(service, /\/engagement\/i\.test\(version\)/);
  assert.match(service, /YouTube uploader is stale/);
  assert.match(service, /\/youtube\/engage\/comment/);
  assert.match(service, /YouTube did not return a comment id/);
  assert.match(service, /actionType === "comment" \|\| actionType === "like"/);
});
