/**
 * Regression: a Needs Eyes output such as Chicago Reel #9593 must always have
 * a visible batch-selection control, and the UI must state exactly why a row
 * cannot be selected instead of showing a misleading active Approve button.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, "assets/factory-desk.js"), "utf8");
const css = readFileSync(join(here, "assets/factory-layout-0680.css"), "utf8");
function between(start, end) {
  const a = js.indexOf(start), b = js.indexOf(end, a + start.length);
  assert.ok(a !== -1 && b > a, `Cannot locate ${start}`);
  return js.slice(a, b);
}
const src = [
  between("  function canReviewActions(", "  function canDelete("),
  between("  function canSelectBatchOutput(", "  function factoryProfileId("),
  between("  function factoryBatchSelectionReason(", "  function contentGroupKey("),
].join("\n");

const chicagoReel = {
  id: "recMichigan9593", kind: "output", output_id: 9593,
  title: "Michigan Avenue Stroll - Part 1",
  profile_id: "recChicago", profile_name: "ChicagoShining - Chicago",
  platform: "Instagram", studio_output_type: "Reel",
  output_status: "Ready for Review", review_status: "Review Sent",
  render_status: "Rendered", studio_state: "Ready for Review",
};
function setup() {
  const state = {
    selectedOutputs: new Set(), batchApprovalsEnabled: true,
    batchGlobal: {
      enabled: true, allowed_platforms: ["Instagram"],
      allowed_output_types_by_platform: { Instagram: ["Reel", "Story"] },
    },
  };
  let accepted = {};
  const ctx = {
    state, recentFactoryAccepted: () => accepted,
    canPreview: () => true, canDelete: () => false,
    cardLabel: card => card.title || String(card.id),
    esc: value => String(value ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"),
  };
  const renderCard = vm.runInNewContext(src + "\nrenderCard", ctx);
  return { state, renderCard, accept: (id) => { accepted = {[id]: Date.now()}; } };
}
function selectionTag(html) {
  const input = html.match(/<input[^>]*data-factory-select-output="[^"]+"[^>]*>/)?.[0];
  assert.ok(input, "Needs Eyes output must show its checkbox regardless of eligibility");
  return input;
}
test("Chicago Reel #9593: review-ready output has an enabled selectable checkbox", () => {
  const { state, renderCard } = setup();
  const html = renderCard(chicagoReel, {lane:"needs_eyes"});
  assert.match(selectionTag(html), /data-factory-select-output="recMichigan9593"/);
  assert.doesNotMatch(selectionTag(html), /\bdisabled\b/);
  assert.match(html, /data-factory-approve="recMichigan9593"/);
  assert.doesNotMatch(html, /factory-batch-unavailable/);
  state.selectedOutputs.add(chicagoReel.id);
  assert.match(selectionTag(renderCard(chicagoReel, {lane:"needs_eyes"})), /\bchecked\b/);
});
test("Review hold, failed render and not-ready Airtable state show disabled selection and Approve", () => {
  const { renderCard } = setup();
  const cases = [
    [{review_hold_active:true}, /Review-held revision/],
    [{do_not_publish:true}, /Publishing hold/],
    [{render_status:"Failed"}, /Render status is Failed/],
    [{output_status:"In Production"}, /Airtable Output Status is In Production/],
    [{render_status:"Waiting in Render Queue"}, /Render is still queued/],
  ];
  for (const [override, reason] of cases) {
    const html = renderCard({...chicagoReel,...override},{lane:"needs_eyes"});
    assert.match(selectionTag(html), /\bdisabled\b/);
    assert.match(html, /data-factory-approve="recMichigan9593" disabled/);
    assert.match(html, reason);
    assert.match(html, /class="factory-batch-unavailable" role="status"/);
    assert.match(html, /data-factory-send-back="recMichigan9593"/);
  }
});
test("Server policy exclusion disables only batch selection, not legitimate individual approval", () => {
  const { state, renderCard } = setup();
  const html = renderCard({...chicagoReel, platform:"TikTok", studio_output_type:"Video Draft"},{lane:"needs_eyes"});
  assert.match(selectionTag(html), /\bdisabled\b/);
  assert.match(html, /TikTok is not enabled for batch approval/);
  assert.doesNotMatch(html, /data-factory-approve="recMichigan9593" disabled/);
  state.batchApprovalsEnabled = false;
  const disabled = renderCard(chicagoReel,{lane:"needs_eyes"});
  assert.match(selectionTag(disabled), /\bdisabled\b/);
  assert.match(disabled, /Batch approvals are disabled by the server/);
});
test("Recently submitted output cannot be selected or approved again from search results", () => {
  const { accept, renderCard } = setup();
  accept(chicagoReel.id);
  const html = renderCard(chicagoReel,{lane:"needs_eyes"});
  assert.match(selectionTag(html), /\bdisabled\b/);
  assert.match(html, /Already accepted for approval/);
  assert.match(html, /data-factory-approve="recMichigan9593" disabled/);
});
test("Mobile styling keeps ineligible checkbox and explanation visible", () => {
  assert.match(css, /\.factory-media-select \.factory-output-select\{/);
  assert.match(css, /\.factory-output-select input:disabled\{/);
  assert.match(css, /\.factory-line-actions \.factory-batch-unavailable\{/);
  assert.doesNotMatch(css, /\.factory-batch-unavailable[^}]*display:none/);
});
