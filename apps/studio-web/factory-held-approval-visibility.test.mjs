import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./assets/factory-layout-0680.css", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name + " exists");
  const declarationEnd = source.indexOf(") {", start);
  assert.ok(declarationEnd > start, name + " declaration ends");
  const open = declarationEnd + 2;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(name + " is incomplete");
}

function harness() {
  const state = {
    selectedOutputs: new Set(),
    batchApprovalsEnabled: true,
    batchGlobal: {
      enabled: true,
      allowed_platforms: ["Instagram", "Facebook"],
      allowed_output_types_by_platform: {
        Instagram: ["Reel", "Story", "Single Image", "Carousel"],
        Facebook: ["Reel", "Story"],
      },
    },
  };
  const context = {
    state, recentFactoryAccepted: () => ({}),
    esc: text => String(text ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;"),
    canDelete: () => false, canPreview: () => true, cardLabel: card => card.title,
  };
  const names = ["canReviewActions", "factoryApprovalUnavailableReason",
    "canSelectBatchOutput", "renderCard"];
  const functions = vm.runInNewContext(names.map(extractFunction).join("\n") +
    "\n({canReviewActions, factoryApprovalUnavailableReason, canSelectBatchOutput, renderCard})", context);
  return { state, ...functions };
}
const ready = (extra = {}) => ({
  id: "recPnNYghmcJYivOA", kind: "output", output_id: 9593,
  title: "Michigan Avenue Stroll - Part 1", profile_name: "ChicagoShining - Chicago",
  platform: "Instagram", studio_output_type: "Reel", output_status: "Ready for Review",
  review_status: "Review Sent", render_status: "Rendered",
  studio_state: "Ready for Review", review_hold_active: false, do_not_publish: false,
  ...extra,
});
const card = (fn, row) => fn(row, {lane:"needs_eyes"});

test("9593: active Rendering Review hold never offers selectable or clickable approval", () => {
  const f = harness();
  const row = ready({review_hold_active:true,do_not_publish:true});
  assert.equal(f.canReviewActions(row), false);
  const html = card(f.renderCard, row);
  assert.match(html, /input type="checkbox" disabled/);
  assert.doesNotMatch(html, /data-factory-select-output=/);
  assert.doesNotMatch(html, /data-factory-approve=/);
  assert.match(html, /disabled[^>]*>Approval on hold<\/button>/);
  assert.match(html, /Rendering Review hold is active/);
  assert.match(html, /factory-line-state[^>]*>Rendering Review hold</);
  assert.match(html, /data-factory-preview=/);
  assert.match(html, /data-factory-send-back=/);
});

test("normal review-ready Instagram Reel remains selectable and approvable", () => {
  const f = harness();
  const html = card(f.renderCard, ready());
  assert.match(html, /data-factory-select-output="recPnNYghmcJYivOA"/);
  assert.match(html, /data-factory-approve="recPnNYghmcJYivOA"/);
  assert.doesNotMatch(html, /Approval on hold|factory-approval-unavailable/);
});

test("Do Not Publish alone also disables approval without losing the reason", () => {
  const f = harness();
  const html = card(f.renderCard, ready({do_not_publish:true}));
  assert.match(html, /input type="checkbox" disabled/);
  assert.match(html, /Do Not Publish is enabled/);
  assert.doesNotMatch(html, /data-factory-approve=/);
  assert.match(html, /Publishing blocked/);
});

test("incomplete or previously approved rows may display in Needs Eyes but cannot approve", () => {
  const f = harness();
  for (const fields of [
    {output_status:"In Production"},
    {render_status:"Waiting in Render Queue"},
    {render_status:"Failed"},
    {review_status:"Approved"},
  ]) {
    const html = card(f.renderCard, ready(fields));
    assert.match(html, /input type="checkbox" disabled/);
    assert.doesNotMatch(html, /data-factory-approve=/);
    assert.match(html, /factory-approval-unavailable/);
  }
});

test("unsupported batch format explains the missing selection without disabling individual review", () => {
  const f = harness();
  const html = card(f.renderCard, ready({studio_output_type:"Unsupported"}));
  assert.match(html, /input type="checkbox" disabled/);
  assert.match(html, /Batch selection is not authorized/);
  assert.match(html, /data-factory-approve=/);
});

test("Factory protects event handler and keeps disabled notices mobile readable", () => {
  assert.match(source, /if \(!canReviewActions\(card\)\) \{\s*setStatus\(factoryApprovalUnavailableReason\(card\), true\)/);
  assert.match(css, /\.factory-approval-unavailable\{/);
  assert.match(css, /grid-column:1\/-1/);
  assert.match(css, /\.factory-media-select input:disabled/);
});
