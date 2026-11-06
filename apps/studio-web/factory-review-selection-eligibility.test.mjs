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
    [{review_hold_active:true}, /Publishing approval is held/],
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
test("held, not-publishable V2 can receive an independent creative-only Factory action",()=>{
  const {renderCard}=setup();
  const html=renderCard({...chicagoReel,review_hold_active:true,
    do_not_publish:true},{lane:"needs_eyes"});
  assert.match(html,/data-factory-approve="recMichigan9593" disabled/);
  assert.match(html,/data-factory-accept-held="recMichigan9593"/);
  assert.match(html,/Accept V2 \(QA hold\)/);
  assert.match(html,/Publishing approval held:/);
  assert.match(selectionTag(html),/\bdisabled\b/);
});
test("incomplete review package never offers a live Approve action", () => {
  const { renderCard } = setup();
  const html = renderCard({
    ...chicagoReel, review_package_ready: false,
    review_package_readiness: "BLOCKED",
    review_package_missing: ["Studio_Preview_URL"],
  }, { lane: "needs_eyes" });
  assert.match(selectionTag(html), /disabled/);
  assert.match(html, /Review package incomplete: Studio_Preview_URL/);
  assert.match(html, /data-factory-approve="recMichigan9593" disabled/);
  assert.match(html, /Review blocked/);
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
test("Authoritative Ready for Review remains actionable even if stale browser acceptance hint exists", () => {
  const { accept, renderCard } = setup();
  accept(chicagoReel.id);
  const html = renderCard(chicagoReel,{lane:"needs_eyes"});
  assert.doesNotMatch(selectionTag(html), /\bdisabled\b/);
  assert.doesNotMatch(html, /Already accepted for approval/);
  assert.match(html, /data-factory-approve="recMichigan9593"/);
  assert.doesNotMatch(html, /data-factory-approve="recMichigan9593" disabled/);
  // Browser memory still prevents an uncertain re-submit for a non-RFR row.
  const stale = renderCard({ ...chicagoReel, output_status:"Rendered" }, {lane:"needs_eyes"});
  assert.match(selectionTag(stale), /\bdisabled\b/);
  assert.match(stale, /Already accepted for approval/);
});
test("Mobile styling keeps ineligible checkbox and explanation visible", () => {
  assert.match(css, /\.factory-media-select \.factory-output-select\{/);
  assert.match(css, /\.factory-output-select input:disabled\{/);
  assert.match(css, /\.factory-line-title \.factory-batch-unavailable\{/);
  assert.doesNotMatch(css, /\.factory-batch-unavailable[^}]*display:none/);
});

test("Held #9593 explains the blocked checkbox directly beneath Output #, above actions", () => {
  const { renderCard } = setup();
  const html = renderCard({...chicagoReel, review_hold_active:true,do_not_publish:true}, {lane:"needs_eyes"});
  const reason = html.indexOf('class="factory-batch-unavailable" role="status"');
  const title = html.indexOf('class="factory-line-title"');
  const profile = html.indexOf("ChicagoShining - Chicago", title);
  const actions = html.indexOf('class="factory-line-actions"');
  assert.ok(title >= 0 && reason > title && reason < profile && profile < actions,
    "Hold explanation must be near the title, not beyond the action buttons and fixed mobile footer");
  assert.ok(html.includes("Publishing approval held:</strong> Publishing approval is held for media QA."));
  assert.match(selectionTag(html), /aria-describedby="factory-batch-reason-recMichigan9593"/);
  assert.match(html, /id="factory-batch-reason-recMichigan9593"/);
  assert.equal((html.match(/class="factory-batch-unavailable"/g)||[]).length,1,
    "Do not duplicate the warning after the actions");
  assert.ok(css.includes(".factory-line-title:has(.factory-batch-unavailable)"));
  assert.match(css, /white-space:normal;overflow:visible;text-overflow:clip/);
});

test("Reel preview visual belongs to the exact output row beside its title", () => {
  const {renderCard} = setup();
  const contentItem = "recYhIjy4BW0U3WaW";
  const sharedCover = "https://media.chicagoshining.com/studio/previews/thumbnails/" + contentItem + "/cover-9x16.png";
  const reel = {
    ...chicagoReel, id:"recPnNYghmcJYivOA", content_item_id:contentItem,
    thumbnail_url:sharedCover, review_hold_active:true
  };
  const html = renderCard(reel, {lane:"needs_eyes"});
  const heading = html.indexOf('class="factory-output-heading"');
  const thumbnail = html.indexOf('data-factory-preview="recPnNYghmcJYivOA"', heading);
  const title = html.indexOf('class="factory-output-title-name"', thumbnail);
  const number = html.indexOf("Output #9593", title);
  const reason = html.indexOf('class="factory-batch-unavailable"', number);
  const actions = html.indexOf('class="factory-line-actions"', reason);
  assert.ok(heading > 0 && heading < thumbnail && thumbnail < title &&
    title < number && number < reason && reason < actions,
    "Output preview, title and hold reason must form one output-level unit before actions");
  assert.match(html, /aria-label="Preview Output #9593:/);
  assert.ok(html.includes('class="factory-output-visual-label">Shared cover</small>'));
  assert.doesNotMatch(html.slice(0,heading), /factory-line-thumb/,
    "The thumbnail must not be detached under the selection checkbox");
  assert.ok(css.includes(".factory-band-eyes .factory-output-heading{"));
  assert.ok(css.includes(".factory-output-visual .factory-line-thumb{"));
});

test("Two sibling platform outputs use distinct output previews even with one shared cover", () => {
  const {renderCard} = setup();
  const source = "https://media.chicagoshining.com/studio/previews/thumbnails/recContentSibling123/cover-9x16.png";
  const base = {...chicagoReel, content_item_id:"recContentSibling123",
    thumbnail_url:source, review_hold_active:false};
  const reel = renderCard({...base,id:"recOutputReel001",output_id:9593},{lane:"needs_eyes"});
  const story = renderCard({...base,id:"recOutputStory02",output_id:9594,studio_output_type:"Story"},{lane:"needs_eyes"});
  assert.match(reel, /data-factory-preview="recOutputReel001"/);
  assert.doesNotMatch(reel, /data-factory-preview="recOutputStory02"/);
  assert.match(story, /data-factory-preview="recOutputStory02"/);
  assert.doesNotMatch(story, /data-factory-preview="recOutputReel001"/);
  assert.match(reel, /Shared cover/);
  assert.match(story, /Shared cover/);
});

test("Group selection skips disabled row checkboxes", () => {
  assert.match(js, /querySelectorAll\("\[data-factory-select-output\]:not\(:disabled\)"\)/);
});
