import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("Pipeline content controls and release build are integrated natively", () => {
  assert.ok(html.includes('id="pipelineContentControls"'));
  assert.ok(!html.includes("pipeline-content-pagination-2536.js"));
  // Release identity is deliberately not pinned to this feature's first
  // version: a newer Studio deployment must retain these Pipeline controls.
  const version = html.match(/id="uiBuildLabel">UI build (\d+\.\d+\.\d+)/)?.[1];
  assert.ok(version, "Studio UI release label exists");
  const minimum = [0, 6, 1031];
  const actual = version.split(".").map(Number);
  assert.ok(actual[0] > minimum[0] || (actual[0] === minimum[0] && (
    actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2])
  )), "Pipeline pagination survives current or newer Studio releases");
  const cacheKeys = [...html.matchAll(/\?v=([0-9]+\.[0-9]+\.[0-9]+-[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  assert.equal(new Set(cacheKeys).size, 1, "Studio asset cache keys agree");
  assert.ok(ui.includes('BUILD_ID = "item4-' + cacheKeys[0] + '"'));
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
  assert.ok(body.includes("Platform Outputs · ${escapeHtml(state)} ${created}/${planned}"));
  assert.ok(body.includes("Platform Outputs · Blocked 0/0 — no enabled output plan"));
  assert.ok(!body.includes("No platform outputs generated yet"));
  assert.ok(ui.includes("pipelineContentRecords.filter(content => !represented.has"));
  assert.ok(ui.includes("outputsResult.content_groups"));
  assert.ok(!body.includes("partitionPipelineGroups(source)"));
  assert.match(html, /#pipelineScheduleOverview\{display:none!important\}/);
});
