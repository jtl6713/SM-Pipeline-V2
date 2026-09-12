import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PIPELINE_COLUMN_FILTER_KEYS,
  blankPipelineColumnFilters,
  pipelineColumnDisplayBucket,
  pipelineColumnFilterSummary,
  pipelineColumnFiltersActive,
  recordMatchesPipelineColumnFilters,
  uniqueSortedColumnValues,
} from "./pipeline-column-filters.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0621.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

const rows = [
  {
    output: "370",
    platform: "Instagram",
    type: "Reel 9:16",
    state: "Ready for Review",
    render: "Rendered",
    review: "Ready for Review",
    publish: "Not published",
    progress: "100%",
    creative: "Open review",
  },
  {
    output: "371",
    platform: "TikTok",
    type: "Story 9:16",
    state: "Rendering",
    render: "Rendering",
    review: "—",
    publish: "—",
    progress: "2/6",
    creative: "Not ready yet",
  },
  {
    output: "372",
    platform: "YouTube",
    type: "Short 9:16",
    state: "Published",
    render: "Rendered",
    review: "Approved",
    publish: "Published",
    progress: "100%",
    creative: "Open review",
  },
];

test("blank filters start empty for every pipeline column", () => {
  const filters = blankPipelineColumnFilters();
  assert.deepEqual(Object.keys(filters), PIPELINE_COLUMN_FILTER_KEYS);
  assert.equal(pipelineColumnFiltersActive(filters), false);
  assert.equal(pipelineColumnDisplayBucket(""), "—");
  assert.equal(pipelineColumnDisplayBucket(" Reel 9:16 "), "Reel 9:16");
});

test("column filters AND together and ignore empty selections", () => {
  const filters = {
    ...blankPipelineColumnFilters(),
    platform: "Instagram",
    type: "Reel 9:16",
  };
  const matched = rows.filter((row) => recordMatchesPipelineColumnFilters(row, filters));
  assert.deepEqual(matched.map((row) => row.output), ["370"]);
  assert.equal(recordMatchesPipelineColumnFilters(rows[1], { ...filters, platform: "" }), false);
});

test("output filter matches a substring of the output id or title", () => {
  const filters = { ...blankPipelineColumnFilters(), output: "70" };
  assert.equal(recordMatchesPipelineColumnFilters({ ...rows[0], outputSearch: "370 Riverwalk reel" }, filters), true);
  assert.equal(recordMatchesPipelineColumnFilters({ ...rows[1], outputSearch: "371 Story" }, filters), false);
});

test("progress and creative use the same displayed labels as the table", () => {
  const filters = { ...blankPipelineColumnFilters(), progress: "2/6", creative: "Not ready yet" };
  assert.equal(recordMatchesPipelineColumnFilters(rows[1], filters), true);
  assert.equal(recordMatchesPipelineColumnFilters(rows[0], filters), false);
});

test("unique option lists stay sorted and collapse blanks", () => {
  assert.deepEqual(uniqueSortedColumnValues(["TikTok", "", "Instagram", "Instagram"]), ["—", "Instagram", "TikTok"]);
  assert.deepEqual(
    pipelineColumnFilterSummary({ platform: "Instagram", type: "Reel 9:16" }, { platform: "Platform", type: "Type / ratio" }),
    ["Platform Instagram", "Type / ratio Reel 9:16"],
  );
});

test("Pipeline UI binds a filter control for every column header", () => {
  assert.match(app, /data-pipeline-col-filter="\$\{escapeHtml\(key\)\}"/);
  for (const key of PIPELINE_COLUMN_FILTER_KEYS) {
    assert.match(app, new RegExp(`pipelineColumnHeader\\("${key}"`));
  }
  assert.match(app, /pipelineColumnFilters/);
  assert.match(html, /pipelineFilterClear/);
  assert.match(html, /Type in Output or use the dropdown under each heading to filter/);
});
