import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("Pipeline content controls and release build are integrated natively", () => {
  assert.ok(html.includes('id="pipelineContentControls"'));
  assert.ok(!html.includes("pipeline-content-pagination-2536.js"));
  assert.ok(html.includes("v=0.6.1030-content-pages"));
  assert.ok(ui.includes('BUILD_ID = "item4-0.6.1030-content-pages"'));
});
test("created-date, group size, and Next/Previous are wired to one paged endpoint", () => {
  for(const id of ["pipelineContentFrom","pipelineContentTo","pipelineContentSize","pipelineContentPrev","pipelineContentNext"])
    assert.ok(html.includes('id="' + id + '"') && ui.includes(id));
  for(const size of ['value="10"','value="20"','value="25"','value="50"']) assert.ok(html.includes(size));
  for(const key of ["created_from","created_to","per_page","content_page"]) assert.ok(ui.includes(key));
  assert.ok(ui.includes("pipelineContentPageOffset + pipelineContentPageSize"));
  assert.ok(ui.includes("pipelineContentPageOffset - pipelineContentPageSize"));
  assert.ok(ui.includes("pipelineContentPageScope()"));
});
test("output groups remain sorted across states, not partitioned into archived groups", () => {
  const a=ui.indexOf("const body = (() => {",ui.indexOf("function renderOutputsTable"));
  const b=ui.indexOf("const head =",a);
  const body=ui.slice(a,b);
  assert.ok(body.includes("groupedPipelineRecords(source)"));
  assert.ok(!body.includes("partitionPipelineGroups(source)"));
  assert.match(html, /#pipelineScheduleOverview\{display:none!important\}/);
});
