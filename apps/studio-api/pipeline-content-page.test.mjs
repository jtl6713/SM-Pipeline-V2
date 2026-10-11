import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  orderedContentIdsFromOutputRecords,
  pageContentIds,
  parsePipelineContentPage,
  pipelineContentDiscoveryLimit,
  PIPELINE_CONTENT_PAGE_DEFAULT,
} from "./pipeline-content-page.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("content page helpers slice newest Content Items", () => {
  const rows = [
    { id: "o6", content: "recC" },
    { id: "o5", content: "recC" },
    { id: "o4", content: "recB" },
    { id: "o3", content: "recA" },
    { id: "o2", content: "recA" },
    { id: "o1", content: "recD" },
  ];
  const ordered = orderedContentIdsFromOutputRecords(rows, (row) => row.content);
  assert.deepEqual(ordered, ["recC", "recB", "recA", "recD"]);
  const page = pageContentIds(ordered, 0, 2);
  assert.deepEqual(page.ids, ["recC", "recB"]);
  assert.equal(page.has_more, true);
  assert.equal(page.returned, 2);
  const page2 = pageContentIds(ordered, 2, 2);
  assert.deepEqual(page2.ids, ["recA", "recD"]);
  assert.equal(page2.has_more, false);
});

test("parsePipelineContentPage defaults to 10", () => {
  const params = new URLSearchParams("");
  const parsed = parsePipelineContentPage(params);
  assert.equal(parsed.contentLimit, PIPELINE_CONTENT_PAGE_DEFAULT);
  assert.equal(parsed.contentOffset, 0);
  const custom = parsePipelineContentPage(new URLSearchParams("content_limit=25&content_offset=10"));
  assert.equal(custom.contentLimit, 25);
  assert.equal(custom.contentOffset, 10);
  const capped = parsePipelineContentPage(new URLSearchParams("content_limit=999"));
  assert.equal(capped.contentLimit, 50);
});

test("discovery limit scales with content page", () => {
  assert.equal(pipelineContentDiscoveryLimit(0, 10), 120);
  assert.ok(pipelineContentDiscoveryLimit(20, 10) >= 200);
  assert.equal(pipelineContentDiscoveryLimit(0, 10, { max: 100 }), 100);
});

test("Worker and UI page Pipeline browse by Content Item", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
  const html = await readFile(path.join(here, "../studio-web/index.html"), "utf8");
  assert.match(worker, /version: "0.10.520-pipeline-content-page"/);
  assert.match(worker, /studio_pipeline_content_page_v1: true/);
  assert.match(worker, /parsePipelineContentPage/);
  assert.match(worker, /pageContentIds/);
  assert.match(worker, /has_more_content/);
  assert.match(worker, /skip the open-output 1000 scan/);
  assert.match(app, /BUILD_ID = "item4-0.6.582-pipeline-content-page"/);
  assert.match(app, /PIPELINE_CONTENT_PAGE_SIZE = 10/);
  assert.match(app, /content_limit=\$\{PIPELINE_CONTENT_PAGE_SIZE\}/);
  assert.match(app, /data-pipeline-load-more-content/);
  assert.match(app, /pipelineViewFilter = "approval"/);
  assert.match(html, /data-pipeline-quick-view="approval" class="is-active"/);
  assert.match(html, /UI build 0.6.582/);
});
