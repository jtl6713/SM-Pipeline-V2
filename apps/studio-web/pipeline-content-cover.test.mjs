import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("Pipeline has exactly one shared cover download directly below the group thumbnail", () => {
  const group = app.slice(app.indexOf("function renderPipelineGroupTbody("), app.indexOf("function renderPipelineArchivedSection("));
  assert.match(group, /const coverUrl = \[/);
  assert.match(group, /\.map\(\(record\) => phase6ThumbnailDownloadUrl\(record\)\)\.find\(Boolean\)/);
  assert.match(group, /const coverDownload = coverUrl/);
  assert.equal((group.match(/class="pipeline-content-download-cover"/g) || []).length, 1);
  assert.match(group, /href="\$\{escapeHtml\(coverUrl\)\}" download/);
  assert.match(group, /\$\{media\}\$\{coverDownload\}/);
  assert.match(css, /#outputsList \.pipeline-content-download-cover\{/);
});

test("Output-level more menu no longer repeats Download Cover for every platform", () => {
  const start = app.indexOf("const pipelineRow =");
  const end = app.indexOf("const body = (() => {", start);
  assert.ok(start >= 0 && end > start);
  const row = app.slice(start, end);
  assert.doesNotMatch(row, /phase6ThumbnailDownloadUrl|coverDownloadUrl|coverLink|pipeline-cover-download/);
  assert.match(row, /const moreMenu = postLink/);
  assert.match(row, /\$\{postLink\}<\/div><\/details>/);
});
