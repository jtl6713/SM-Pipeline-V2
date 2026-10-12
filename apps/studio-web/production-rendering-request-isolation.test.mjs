import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const index = fs.readFileSync(path.join(here, "index.html"), "utf8");
const start = app.indexOf("  function clearProductionMediaOnRequestChange(record) {");
const end = app.indexOf("\n  function populateProductionRequestForm(", start);
assert.ok(start > 0 && end > start, "request-switch cleanup must be implemented");
const helper = app.slice(start, end);

function harness({ currentId = "previous-request", loadedId = "previous-request" } = {}) {
  const dom = Object.fromEntries([
    "prRenderFrameOverrides", "item4AssetStrip", "item4VariantGallery", "item4OutputPlan",
    "ezPhotoStrip", "item4AssetStatus", "item4PlanStatus", "item4VariantStatus",
    "item4VariantError", "prRenderClearFrameOverrides", "item4VariantProgress",
  ].map(id => [id, { innerHTML: '<img src="previous-run-photo.jpg">', textContent: "Old photo", hidden: false, disabled: false }]));
  const context = {
    dom,
    cancelled: 0,
    stopped: 0,
    clearTimeout() { context.cancelled += 1; },
    escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;"); },
  };
  const script = `
    let activeProductionRequest = { id: ${JSON.stringify(currentId)} };
    let item4WorkspaceRequestId = ${JSON.stringify(loadedId)};
    let item4Workspace = { assets: [{ name: "Old photo" }] };
    let item4WorkspaceRevision = 2;
    let item4WorkspaceLoadSequence = 7;
    let item4WorkspaceRetryTimer = 11;
    let item4BridgePreflight = { ready: true };
    let item4AssetStripSignature = "prior-signature";
    let item4PlanOverrides = { Instagram: "Reel" };
    let item4PrepareError = "prior error";
    let item4PreparingVariants = true;
    const $ = (id) => dom[id] || null;
    function stopItem4MasterPolling() { stopped++; }
    function stopItem4VariantPolling() { stopped++; }
    ${helper}
    ({ switchTo: clearProductionMediaOnRequestChange,
       snapshot: () => ({ loadedId: item4WorkspaceRequestId, workspace: item4Workspace,
         revision: item4WorkspaceRevision, sequence: item4WorkspaceLoadSequence,
         signature: item4AssetStripSignature, cancelled, stopped, dom }) });
  `;
  return vm.runInNewContext(script, context);
}

test("switching requests immediately replaces old Rendering photos with an explicit loading state", () => {
  const h = harness();
  assert.equal(h.switchTo({ id: "new-request" }), true);
  const state = h.snapshot();
  assert.equal(state.workspace, null);
  assert.equal(state.loadedId, null);
  assert.equal(state.revision, 3);
  assert.equal(state.sequence, 8);
  assert.equal(state.signature, "");
  assert.equal(state.stopped, 2);
  assert.equal(state.cancelled, 1);
  for (const id of ["prRenderFrameOverrides", "item4AssetStrip", "item4VariantGallery", "item4OutputPlan"]) {
    assert.match(state.dom[id].innerHTML, /Loading photos for this Production Request/);
    assert.doesNotMatch(state.dom[id].innerHTML, /previous-run-photo\.jpg/);
  }
  assert.equal(state.dom.ezPhotoStrip.hidden, true);
  assert.equal(state.dom.ezPhotoStrip.innerHTML, "");
  assert.equal(state.dom.prRenderClearFrameOverrides.disabled, true);
});

test("refreshing the same request does not wipe its thumbnails or interrupt polling", () => {
  const h = harness({ currentId: "same", loadedId: "same" });
  assert.equal(h.switchTo({ id: "same" }), false);
  const state = h.snapshot();
  assert.match(state.dom.prRenderFrameOverrides.innerHTML, /previous-run-photo\.jpg/);
  assert.equal(state.revision, 2);
  assert.equal(state.stopped, 0);
});

test("stale workspace from another request is cleared even when current ID matches", () => {
  const h = harness({ currentId: "new", loadedId: "old" });
  assert.equal(h.switchTo({ id: "new" }), true);
  assert.equal(h.snapshot().loadedId, null);
});

test("Production waits for its current workspace before drawing frame cards", () => {
  const populate = app.slice(app.indexOf("function populateProductionRequestForm("), app.indexOf("function populateProductionRequestForm(") + 6500);
  assert.ok(populate.indexOf("clearProductionMediaOnRequestChange(record)") < populate.indexOf("activeProductionRequest = record"));
  assert.match(populate, /if \(!changingRequest\) renderProductionFrameOverrides/);
  const load = app.slice(app.indexOf("async function loadItem4Workspace("), app.indexOf("function item4UploadFileExtension(", app.indexOf("async function loadItem4Workspace(")));
  assert.match(load, /activeProductionRequest\?\.id !== record\.id \|\| revision !== item4WorkspaceRevision/);
  assert.match(load, /sequence !== item4WorkspaceLoadSequence/);
  assert.match(load, /renderItem4Workspace\(status\)/);
  const variantPoll = app.slice(app.indexOf("async function pollItem4Variants("), app.indexOf("function startItem4VariantPolling(", app.indexOf("async function pollItem4Variants(")));
  assert.match(variantPoll, /activeProductionRequest\?\.id !== requestId \|\| revision !== item4WorkspaceRevision/);
});

test("UI and cache-busting strings agree for Production media isolation build", () => {
  assert.ok(app.includes('const BUILD_ID = "item4-0.6.657-lazy-js"'));
  assert.ok(index.includes("UI build 0.6.657"));
  assert.ok(index.includes("app-item4-1008.js?v=0.6.657-lazy-js"));
});
