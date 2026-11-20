import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const slice = (a, b) => {
  const start = src.indexOf(a);
  const end = src.indexOf(b, start + a.length);
  assert.ok(start >= 0 && end > start, `missing Factory helper ${a}`);
  return src.slice(start, end);
};

test("a blocked sibling does not disable eligible content selection", () => {
  const bar = slice("  function renderContentBar(", "  function renderLane(");
  assert.match(bar, /batchReady\.length \? "disabled" : ""/);
  assert.doesNotMatch(bar, /!batchReady\.length \|\| pending\.length/);
  assert.match(bar, /Approve eligible/);
  assert.match(bar, /readyContentCards\(group\)/);
});

test("Approve eligible submits only independently ready outputs", () => {
  const group = slice("  async function approveContentGroup(", "  async function ");
  assert.match(group, /await loadFactoryDesk\(true\)/);
  assert.match(group, /const ready = readyContentCards\(\{ cards \}\)/);
  assert.match(group, /record_ids: ready\.map\(\(card\) => card\.id\)/);
  assert.doesNotMatch(group, /if \(pending\.length\)/);
  assert.doesNotMatch(group, /cards\.some\(card => card\.review_hold_active === true\)/);
});

test("individual output publisher holds remain fail-closed", () => {
  const eligibility = slice("  function canReviewActions(", "  function canDelete(");
  assert.match(eligibility, /card\.review_hold_active === true \|\| card\.do_not_publish === true/);
});
