import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("promoted ideas are archived by Airtable status or by content link", () => {
  const start = src.indexOf("function ideaIsPromoted(idea) {");
  const end = src.indexOf("function ideaCanModify(idea)", start);
  assert.ok(start >= 0 && end > start);
  const isPromoted = new Function(src.slice(start, end) + "\nreturn ideaIsPromoted;")();
  assert.equal(isPromoted({ status: "Promoted" }), true);
  assert.equal(isPromoted({ status: "Approved", promoted_content_record_id: "recContent" }), true);
  assert.equal(isPromoted({ status: "Approved", content_item_links: ["recContent"] }), true);
  assert.equal(isPromoted({ status: "Approved", production_request_links: ["recDraft"] }), false);
  assert.equal(isPromoted({ status: "Generated" }), false);
});

test("promotion row refresh re-partitions the Ideas list and its counts", () => {
  const start = src.indexOf("function refreshIdeaListRow(record) {");
  const end = src.indexOf("function bindIdeaRowButtons(scope)", start);
  const body = src.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /wasPromoted !== ideaIsPromoted\(next\)/);
  assert.match(body, /renderIdeasTable\(list, ideasCache\)/);
});

test("opening Ideas requires an authoritative live listing, never a stale snapshot", () => {
  const start = src.indexOf("async function loadIdeas() {");
  const end = src.indexOf("function productionPageActive()", start);
  const body = src.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /\/api\/ideas\?limit=100&fresh=1/);
  assert.match(body, /result\?\.live !== true/);
  assert.doesNotMatch(body, /refreshing && !result\.records\.length/);
});
