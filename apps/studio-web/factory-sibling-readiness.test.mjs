/**
 * Factory Content 924 regression: six authoritative review-ready outputs (incl.
 * both Stories) must not be blocked by stale/cross-content lane projections.
 * Real unfinished Story siblings still block group approval.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "assets/factory-desk.js"), "utf8");
const slice = (begin, end) => {
  const a = source.indexOf(begin), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Cannot find Factory helper ${begin}`);
  return source.slice(a, b);
};
const helpers = [
  slice("  function canReviewActions(", "  function canDelete("),
  slice("  function isStoryOutputCard(", "  function renderContentBar("),
].join("\n");
const factory = (lanes) => {
  const ctx = { state: { desk: { lanes: { auto_high: lanes.auto_high || [], manual: lanes.manual || [] } } }, recentFactoryAccepted: () => ({}) };
  return vm.runInNewContext(helpers + "\n({ pendingSiblingOutputsForGroup, pendingSiblingMeta, canReviewActions })", ctx);
};
const contentItem = "recContent924AaBbCc";
const profileId = "recNYCProfileAaBbCc";
const output = (id, output_id, extra = {}) => ({
  id, kind: "output", content_item_id: contentItem, content_id: "924",
  profile_id: profileId, studio_output_type: "Story", platform: "Instagram",
  output_id, output_status: "Ready for Review", render_status: "Rendered",
  review_status: "Review Sent", studio_state: "Ready for Review",
  final_file_url: "https://example.test/current.mp4",
  ...extra,
});
const sixReady = [
  output("recOutput5041AaBbCc", 5041, { studio_output_type: "Reel" }),
  output("recOutput5042AaBbCc", 5042, { studio_output_type: "Reel" }),
  output("recOutput5043AaBbCc", 5043, { studio_output_type: "Video Draft" }),
  output("recOutput5045AaBbCc", 5045, { studio_output_type: "Short" }),
  output("recOutput5047AaBbCc", 5047),
  output("recOutput5048AaBbCc", 5048),
];

test("C924: all six Airtable-ready outputs, including Stories, are not blocked by two phantom siblings", () => {
  const other = output("recPhantomOtherAaBb", 7771, {
    content_item_id: "recDifferentContentId", content_id: "924",
    output_status: "In Production", render_status: "Rendering",
  });
  const unlinked = output("recPhantomNoLinkAaBb", 7772, {
    content_item_id: null, content_id: "924",
    output_status: "In Production", render_status: "Rendering",
  });
  const f = factory({ auto_high: [other, unlinked] });
  assert.equal(f.pendingSiblingOutputsForGroup({ cards: sixReady }).length, 0);
  assert.equal(sixReady.every((card) => f.canReviewActions(card)), true);
});

test("duplicate ready outputs and already-review-ready cards in another lane never block Approve all", () => {
  const duplicate = output("recDuplicateProjection", 5047, {
    output_status: "In Production", render_status: "Rendering",
  });
  const readyStaleLane = output("recReadyOtherAaBbCc", 5049);
  const alreadyApproved = output("recApprovedOtherAaBb", 5050, {
    output_status: "Approved for Publishing", render_status: "Rendered",
  });
  const f = factory({ auto_high: [duplicate, readyStaleLane], manual: [alreadyApproved] });
  assert.equal(f.pendingSiblingOutputsForGroup({ cards: sixReady }).length, 0);
});

test("real unfinished Story stays blocked, even when its studio_state claims ready", () => {
  const unfinished = output("recUnfinishedStoryAaB", 5051, {
    output_status: "Ready for Review", render_status: "Waiting in Render Queue",
    studio_state: "Ready for Review",
  });
  const f = factory({ auto_high: [unfinished] });
  const pending = f.pendingSiblingOutputsForGroup({ cards: sixReady });
  assert.deepEqual(Array.from(pending, (card) => card.id), [unfinished.id]);
  assert.equal(f.pendingSiblingMeta(pending), "1 Story still rendering");
  assert.equal(f.canReviewActions(unfinished), false);
});

test("blocked/failed sibling is described accurately, not as rendering", () => {
  const failed = output("recFailedStoryAaBbCc", 5052, {
    output_status: "Failed", render_status: "Failed",
    studio_state: "Needs repair", stuck_kind: "render_failed",
  });
  const f = factory({ manual: [failed] });
  const pending = f.pendingSiblingOutputsForGroup({ cards: sixReady });
  assert.equal(pending.length, 1);
  assert.equal(f.pendingSiblingMeta(pending), "1 sibling output needs attention");
});

test("legacy cards without canonical links fall back to Content_ID with strict profile and state matching", () => {
  const legacyReady = sixReady.map((card) => ({ ...card, content_item_id: null }));
  const pendingStory = output("recLegacyPendingAaBb", 5053, {
    content_item_id: null, output_status: "In Production", render_status: "Rendering",
  });
  const foreignProfile = output("recForeignProfileAaBb", 5054, {
    content_item_id: null, profile_id: "recOtherProfileAABB",
    output_status: "In Production", render_status: "Rendering",
  });
  const f = factory({ auto_high: [pendingStory, foreignProfile] });
  assert.deepEqual(Array.from(f.pendingSiblingOutputsForGroup({ cards: legacyReady }), (card) => card.id), [pendingStory.id]);
});

test("Factory continually refreshes output readiness and checks the latest state before group approval", () => {
  assert.match(source, /loadFactoryDesk\(true\)[\s\S]*const cards = \(state\.desk\?\.lanes\?\.needs_eyes/);
  assert.match(source, /fetchJson\("\/api\/factory\/desk", \{ cache: "no-store" \}\)/);
  assert.match(source, /setInterval\(\(\) => \{[\s\S]*loadFactoryDesk\(true\)[\s\S]*\}, 45000\)/);
});
