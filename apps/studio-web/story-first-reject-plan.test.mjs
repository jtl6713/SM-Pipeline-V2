import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const html = read("./index.html");
const app = read("./assets/story-first-workspace.js");
const start = app.indexOf("  function rejectPlan() {");
const end = app.indexOf("\n  async function propose(e) {", start);
assert.ok(start > -1 && end > start, "Reject-plan function must be defined next to story generation");
const implementation = app.slice(start, end);

function harness({ saved = false, busy = false, confirm = true } = {}) {
  const elements = new Map();
  for (const id of ["storyFirstSummary", "storyFirstBrief", "scriptedShortPrompt",
    "storyFirstSaved", "storyFirstShots", "storyFirstWorkspace",
    "scriptedShortResult", "storyFirstPropose", "scriptedShortPropose", "scriptedShortMessage"]) {
    elements.set(id, { value: "", hidden: false, disabled: true, textContent: "",
      className: "", replaceChildren() { this.cleared = true; },
      dispatchEvent() { this.dispatched = true; },
      scrollIntoView() { this.scrolled = true; },
      focus() { this.focused = true; } });
  }
  elements.get("storyFirstSummary").value = "Make a better short about the skyline";
  elements.get("scriptedShortPrompt").value = "Old prompt";
  const removes = [], reports = [], confirmations = [];
  const current = {
    story: { scenes: [{ n: 1, voiceover: "Old proposal" }] },
    record: saved ? { id: "recSavedIdea" } : null,
    profile: "recProfile123",
    title: "Old title", summary: "Old brief", busy,
    planRevision: 4, proposing: false, candidates: { 0: ["old"] },
    attempted: new Set([0]), browsing: { 0: true },
    pendingUpload: {}, generatedAssets: {}, libraryRows: ["old"],
    wideResults: {}, uploadedAssets: {}, selectedAssetNames: {},
    expandedScenes: new Set([0]),
  };
  const context = { current, $: id => elements.get(id), profileId: () => "recProfile123",
    isId: id => /^rec[A-Za-z0-9]+$/.test(id),
    window: { confirm: message => { confirmations.push(message); return confirm; } },
    localStorage: { removeItem: key => removes.push(key) },
    report: message => reports.push(message),
    Event: class Event { constructor(type) { this.type = type; } },
    Set,
  };
  const run = vm.runInNewContext(implementation + "\nrejectPlan;", context);
  return { run, elements, removes, reports, confirmations, current };
}

test("whole-plan rejection is visible at the top and bottom of the real story-first workspace", () => {
  assert.match(html, /id="storyFirstRejectPlan"/);
  assert.match(html, /id="storyFirstRejectPlanBottom"/);
  const workspace = html.slice(html.indexOf('id="storyFirstWorkspace"'), html.indexOf('id="storyFirstWorkspace"') + 1500);
  assert.match(workspace, /storyFirstRejectPlan/);
  assert.match(app, /\$\("storyFirstRejectPlan"\)\.addEventListener\("click", rejectPlan\)/);
  assert.match(app, /\$\("storyFirstRejectPlanBottom"\)\.addEventListener\("click", rejectPlan\)/);
});

test("rejecting an unsaved plan clears all scenes and selections but keeps original brief editable", () => {
  const h = harness();
  h.run();
  assert.equal(h.current.story, null);
  assert.equal(h.current.record, null);
  assert.equal(h.current.planRevision, 5);
  assert.equal(h.current.title, "");
  assert.equal(h.current.attempted.size, 0);
  assert.equal(h.current.expandedScenes.size, 0, "reject collapses all scene details");
  assert.equal(h.current.libraryRows.length, 0);
  assert.equal(h.elements.get("storyFirstWorkspace").hidden, true);
  assert.equal(h.elements.get("scriptedShortResult").hidden, true);
  assert.equal(h.elements.get("scriptedShortPrompt").value, "Make a better short about the skyline");
  assert.equal(h.elements.get("scriptedShortPrompt").focused, true);
  assert.equal(h.elements.get("scriptedShortPropose").disabled, false);
  assert.equal(h.removes[0], "studio.story_first_resume.recProfile123");
  assert.match(h.reports.at(-1), /Plan rejected/);
});

test("a saved plan is closed locally without deleting Airtable, assets or production records", () => {
  const h = harness({ saved: true });
  h.run();
  assert.equal(h.current.story, null);
  assert.match(h.confirmations[0], /remain in Airtable/);
  assert.match(h.reports[0], /saved Idea remains available/);
  assert.doesNotMatch(implementation, /fetch\(|call\(|DELETE|\/api\/outputs|\/production-request/);
});

test("confirmation cancel and in-progress writes leave the plan unchanged", () => {
  for (const params of [{ confirm: false }, { busy: true }]) {
    const h = harness(params);
    const original = h.current.story;
    h.run();
    assert.equal(h.current.story, original);
    assert.equal(h.current.planRevision, 4);
    assert.equal(h.current.expandedScenes.has(0), true, "cancel/busy must preserve disclosure state");
    assert.equal(h.removes.length, 0);
  }
});

test("late AI proposal replies cannot re-display a rejected or cross-profile plan", () => {
  assert.match(app, /const generation = \+\+current\.planRevision/);
  assert.match(app, /if \(generation !== current\.planRevision \|\| profileId\(\) !== id\) return;/);
  assert.match(app, /current\.planRevision \+= 1;\s+current\.proposing = false;/);
  assert.match(app, /if\s*\(\s*current\.story\s*!==\s*original\s*\)\s*return;/);
});
