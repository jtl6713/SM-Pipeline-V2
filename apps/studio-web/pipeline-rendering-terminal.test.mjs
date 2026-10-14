import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

function appFunction(name) {
  const start = app.indexOf("  function " + name + "(");
  assert.notEqual(start, -1, name + " must exist in Pipeline");
  const end = app.indexOf("\n  }", start);
  assert.ok(end > start, "cannot extract " + name);
  return app.slice(start, end + "\n  }".length);
}

const runtime = vm.runInNewContext(
  [
    "const pipelineViewFilter = 'rendering';",
    "const pipelineColumnFilters = {};",
    "const activeCreativeOutput = null;",
    "function pipelineStudioStateLabel(r) { return r.studio_state; }",
    "function pipelineRenderLabel(r) { return r.render_status; }",
    "function pipelinePublishStatusLabel(r) { return r.publish_status; }",
    "function pipelineRecordIsAzAutoQueue() { return false; }",
    "function pipelineRecordIsScheduled() { return false; }",
    "function pipelineRecordMatchesColumnFilters() { return true; }",
    appFunction("creativeIsPublished"),
    appFunction("pipelineIsRetryingRender"),
    appFunction("pipelineMixRerenderInProgress"),
    appFunction("pipelineOutputIsPublished"),
    appFunction("pipelineOutputRenderComplete"),
    appFunction("pipelineOutputRenderInFlight"),
    appFunction("pipelineRecordMatchesFilter"),
    appFunction("pipelineContentGroupKey"),
    appFunction("filteredPipelineRecords"),
    "({pipelineOutputIsPublished, pipelineOutputRenderComplete, pipelineOutputRenderInFlight, pipelineRecordMatchesFilter, filteredPipelineRecords})",
  ].join("\n\n"),
  {}
);

const published825 = {
  id: "recfmARJ0mg3PHkpX",
  output_id: 825,
  content_item_links: ["content199"],
  studio_state: "Published",
  output_status: "In Production",
  render_status: "Ready for Render",
  publish_status: "Published",
  published_at: "2026-09-30T16:13:15.000Z",
};
const published826 = {
  id: "recV6YbByT5nLQgb4",
  output_id: 826,
  content_item_links: ["content199"],
  studio_state: "Published",
  output_status: "Approved for Publishing",
  render_status: "Rendered",
  publish_status: "Published",
  published_at: "2026-09-28T21:03:35.178Z",
};

test("LA archived content 199 / outputs 825 and 826 cannot enter Rendering", () => {
  assert.equal(runtime.pipelineOutputRenderInFlight(published825), false);
  assert.equal(runtime.pipelineOutputRenderComplete(published825), true);
  assert.equal(runtime.pipelineRecordMatchesFilter(published825, "rendering"), false);
  assert.equal(runtime.pipelineRecordMatchesFilter(published826, "rendering"), false);
  assert.equal(runtime.filteredPipelineRecords([published825, published826]).length, 0);
});

test("Published status wins even if a cached studio state or render label is stale", () => {
  for (const variant of [
    { studio_state: "Rendering", output_status: "In Production", render_status: "Rendering", publish_status: "Published" },
    { studio_state: "Queued", output_status: "Published", render_status: "Ready for Render", publish_status: "" },
    { studio_state: "Waiting in render queue", output_status: "In Production", render_status: "Waiting in Render Queue", published_at: "2026-09-28T21:03:35.178Z" },
    { studio_state: "Published", output_status: "In Production", render_status: "Rendering", publish_status: "" },
  ]) {
    const row = { id: "out", ...variant };
    assert.equal(runtime.pipelineOutputRenderInFlight(row), false);
    assert.equal(runtime.pipelineRecordMatchesFilter(row, "rendering"), false);
  }
});

test("Real rendering, queue wait, and rerendering records stay visible", () => {
  const rows = [
    { studio_state: "Rendering", render_status: "Rendering", output_status: "In Production" },
    { studio_state: "Waiting in render queue", render_status: "Waiting in Render Queue", output_status: "In Production" },
    { studio_state: "Ready for Review", render_status: "Rendering", review_status: "Changes Requested", output_status: "In Production" },
    { studio_state: "Queued", render_status: "Ready for Render", output_status: "In Production" },
  ];
  for (const row of rows) {
    assert.equal(runtime.pipelineOutputRenderInFlight(row), true);
    assert.equal(runtime.pipelineRecordMatchesFilter(row, "rendering"), true);
  }
});

test("Unpublished sibling of archived content can render without importing a fully published group", () => {
  const live = { id: "live", content_item_links: ["other-content"], studio_state: "Rendering", render_status: "Rendering", output_status: "In Production" };
  const published = { ...published825 };
  const selected = runtime.filteredPipelineRecords([published, published826, live]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "live");
});

test("UI version and cache busts are aligned", () => {
  assert.ok(app.includes('BUILD_ID = "item4-0.6.676-factory-revision-unlock"'));
  assert.ok(html.includes("UI build 0.6.676"));
  assert.ok(html.includes("app-item4-1008.js?v=0.6.676-factory-revision-unlock"));
});
