import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("./assets/pipeline-content-pagination-2536.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("Pipeline controls load before core and share release cache key", () => {
 assert.match(html, /pipeline-content-pagination-2536\\.js\\?v=0\\.6\\.1029-pipeline-history/);
 assert.ok(html.indexOf("pipeline-content-pagination-2536.js") < html.indexOf("StudioLazyLoad.boot()"));
});
test("date, group size and paging controls are wired", () => {
 for(const name of ["pipelineContentFrom","pipelineContentTo","pipelineContentSize","pipelineContentPrev","pipelineContentNext"]) assert.ok(ui.includes(name));
 for(const size of ['value="10"','value="20"','value="25"','value="50"']) assert.ok(ui.includes(size));
 for(const key of ["created_from","created_to","per_page","content_page"]) assert.ok(ui.includes(key));
 assert.ok(ui.includes("state.offset += state.size"));
 assert.ok(ui.includes("state.offset - state.size"));
 assert.ok(ui.includes("has_more: false"));
});
test("legacy rolling seven-day grid hidden without removing publishing safeguards", () => {
 assert.match(html, /#pipelineScheduleOverview\\{display:none!important\\}/);
 assert.ok(!ui.includes("publish-now"));
});
