import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("promoted ideas are identified by Airtable status or by content link", () => {
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

test("promotion row refresh updates the Current ideas list and count", () => {
  const start = src.indexOf("function refreshIdeaListRow(record) {");
  const end = src.indexOf("function bindIdeaRowButtons(scope)", start);
  const body = src.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /wasPromoted !== ideaIsPromoted\(next\)/);
  assert.match(body, /renderIdeasTable\(list, ideasCache\)/);
});

test("Ideas shows only current intake and uses the empty state after all ideas are promoted", () => {
  const predicateStart = src.indexOf("function ideaIsPromoted(idea) {");
  const predicateEnd = src.indexOf("function ideaCanModify(idea)", predicateStart);
  const renderStart = src.indexOf("function renderIdeasTable(target, records)");
  const renderEnd = src.indexOf("function contentRenderLabel(record)", renderStart);
  const render = new Function("sortedIdeaRecords", "renderIdeaSection", "ideasCurrentSectionOpen",
    "bindIdeaRowButtons", src.slice(predicateStart, predicateEnd) + src.slice(renderStart, renderEnd)
    + "\nreturn renderIdeasTable;")(
    (records) => records,
    ({ title, records }) => `${title}: ${records.map((record) => record.id).join(", ")}`,
    true,
    () => {},
  );
  const target = { querySelectorAll: () => [] };
  const promoted = [{ id: "promoted", status: "Promoted" }, { id: "linked", content_item_links: ["recContent"] }];
  render(target, [...promoted, { id: "draft", status: "Approved", production_request_links: ["recDraft"] }]);
  assert.equal(target.innerHTML, '<div class="idea-window-stack">Current ideas: draft</div>');
  render(target, promoted);
  assert.match(target.innerHTML, /No ideas are currently in the intake queue/);
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
