import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");

test("Pipeline package heading prefers content_title over a sibling output_title", () => {
  const start = app.indexOf("function renderPipelineGroupTbody(");
  const end = app.indexOf("function renderPipelineArchivedSection(");
  assert.ok(start >= 0 && end > start);
  const group = app.slice(start, end);
  assert.match(
    group,
    /const title = String\(content\?\.title \|\| first\.content_title \|\| first\.output_title \|\| "Untitled content"\)\.trim\(\);/,
  );
  assert.doesNotMatch(
    group,
    /const title = String\(content\?\.title \|\| first\.output_title \|\| first\.content_title/,
  );
});

test("pipelineContentGroupLabel also prefers content_title before output_title", () => {
  const start = app.indexOf("function pipelineContentGroupLabel(");
  const end = app.indexOf("function pipelineContentGroupRecords(");
  assert.ok(start >= 0 && end > start);
  const fn = app.slice(start, end);
  assert.match(
    fn,
    /const title = String\(content\?\.title \|\| first\.content_title \|\| first\.output_title \|\| ""\)\.trim\(\);/,
  );
});
