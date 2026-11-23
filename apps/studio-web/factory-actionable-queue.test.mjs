import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, "assets/factory-desk.js"), "utf8");
const index = readFileSync(join(here, "index.html"), "utf8");
const start = js.indexOf("  function factoryHasHumanReviewAction(");
const end = js.indexOf("  const FACTORY_WAITING_SELECTION_KEY", start);
assert.ok(start >= 0 && end > start, "Review/attention partition functions exist");

function partition(cards, submitted = []) {
  const ctx = {
    factorySubmittedApprovalIds: () => new Set(submitted),
    canReviewActions: (card) => card.ready === true,
  };
  vm.createContext(ctx);
  const helperStart = js.indexOf("  function canReviewHeldOutput(");
  const helperEnd = js.indexOf("  function canReleaseForApproval(", helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  vm.runInContext(js.slice(start, end) + "\n" + js.slice(helperStart, helperEnd), ctx);
  return {
    ready: Array.from(ctx.factoryVisibleNeedsEyes(cards), card => card.id),
    attention: Array.from(ctx.factoryReviewAttentionCards(cards), card => card.id),
  };
}

test("only individually approvable outputs remain in Needs Eyes", () => {
  const cards = [
    { kind: "output", id: "recReady", ready: true },
    { kind: "output", id: "recBlocked", ready: false },
    { kind: "output", id: "recHeld", ready: false, review_hold_active: true },
    { kind: "request", id: "recRequest" },
  ];
  assert.deepEqual(partition(cards), {
    ready: ["recReady"], attention: ["recBlocked", "recHeld"],
  });
});

test("submitted outputs do not reappear in either queue", () => {
  const cards = [
    { kind: "output", id: "recReady", ready: true },
    { kind: "output", id: "recBlocked", ready: false },
  ];
  assert.deepEqual(partition(cards, ["recReady", "recBlocked"]), { ready: [], attention: [] });
});

test("Needs Attention provides diagnostics and exact-output remediation without approval", () => {
  assert.match(js, /data-factory-make-ready/);
  assert.match(js, /await openStudioTarget\(card\)/);
  assert.match(js, /const manualCards = \[\.\.\.\(desk\.lanes\?\.manual \|\| \[\]\)\]/);
  assert.match(js, /if \(!inManual\.has\(String\(card\.id \|\| ""\)\)\) manualCards\.push\(card\)/);
  assert.match(js, /if \(reviewAllowed \|\| needsEyesOutput\)/);
  assert.match(js, /if\(reviewActionOutput && card\.review_hold_active===true/);
  assert.match(js, /reviewActionOutput && canReviewHeldOutput\(card\)/);
  assert.match(js, /reviewActionOutput && canRejectHeldOutput\(card\)/);
  assert.match(index, /id="factoryLaneManualHeading">Needs Attention/);
});


test("Museum Mile 2212: six rendered safety-held outputs stay in Needs Eyes for creative review", () => {
  const states = ["Not Ready","Not Ready","Not Ready","Ready to Publish","Ready to Publish","Publishing"];
  const cards = states.map((publish_status, i) => ({
    id: "recMuseumMile" + String(10827+i), kind: "output",
    output_id: 10827+i, ready: false, do_not_publish: true,
    safety_hold_active: true, review_hold_active: false, review_package_ready: true,
    output_status: "Ready for Review", review_status: null, render_status: "Rendered",
    publish_status, auto_publish_enabled: false,
    scheduled_post_date: null, studio_scheduled_at: null,
    youtube_scheduled_publish_at: null, published_at: null, platform_post_url: null,
  }));
  const result = partition(cards);
  assert.deepEqual(result.ready, cards.map(card => card.id));
  assert.deepEqual(result.attention, []);
});

test("held review remains unselectable for publishing and unsafe held records remain in attention", () => {
  const base = {
    kind:"output", do_not_publish:true, ready:false,
    output_status:"Ready for Review", review_status:null,
    render_status:"Rendered", publish_status:"Not Ready",
    review_hold_active:false, review_package_ready:true,
    auto_publish_enabled:false, published_at:null, platform_post_url:null,
  };
  const cards = [
    { ...base, id:"recCreativeSafe", safety_hold_active:true },
    { ...base, id:"recAlreadyScheduled", scheduled_post_date:"2026-11-21T14:00:00Z" },
    { ...base, id:"recAutoPublish", auto_publish_enabled:true },
    { ...base, id:"recPublishInFlightNoSafety", publish_status:"Publishing" },
    { ...base, id:"recProviderPosted", platform_post_url:"https://example.com/post" },
    { ...base, id:"recHeldV2", review_hold_active:true },
    { ...base, id:"recCreativelyDecided", held_review_decision:"approve" },
  ];
  const result = partition(cards);
  assert.deepEqual(result.ready, ["recCreativeSafe"]);
  assert.deepEqual(result.attention, cards.slice(1).map(card => card.id));
});

test("#10855 unheld returned-to-review carousel stays visible even with historical browser acceptance", () => {
  const returned = {
    id:"recO494MDnQ1Tk51b", kind:"output", output_id:10855,
    title:"Free Ferry Views or a Liberty Island Visit?",
    output_status:"Ready for Review", review_status:"Review Sent",
    publish_status:"Not Ready", render_status:"Native Photo Route",
    do_not_publish:false, auto_publish_enabled:false,
    review_package_ready:true, review_hold_active:false,
    safety_hold_active:false, scheduled_post_date:null,
    studio_scheduled_at:null, youtube_scheduled_publish_at:null,
    published_at:null, platform_post_url:null, ready:true,
  };
  assert.deepEqual(partition([returned], [returned.id]), {
    ready:[returned.id], attention:[],
  }, "Reopened canonical review must not vanish behind a terminal or pending UI fence");
  for (const override of [
    {do_not_publish:true,ready:false},
    {output_status:"Approved for Publishing",ready:false},
    {review_package_ready:false,ready:false},
    {published_at:"2026-11-22T13:00:00Z",ready:false},
    {scheduled_post_date:"2026-11-24T15:00:00Z",ready:false},
  ]) {
    const card={...returned,...override};
    const found=partition([card],[card.id]);
    assert.deepEqual(found.ready, [], "Unsafe/unfinished state cannot override submission fence");
  }
});

test("Factory keeps real in-flight claim fences while showing reopened rows", () => {
  assert.match(js, /function factoryActiveSubmissionIds\(\)/);
  assert.match(js, /factoryActiveSubmissionIds\(\)\.has\(String\(card\?\.id \|\| ""\)\)/);
  assert.match(js, /visibleNeedsEyes\.sort\(\(a, b\) => Number\(factoryUnheldReviewCandidate\(b\)\)/);
});
