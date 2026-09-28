import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

function pipelineOutputListTitle(record) {
  const id = String(record?.output_id || "").trim();
  const title = String(record?.output_title || record?.content_title || "").trim();
  const idLabel = id ? `Output ${id}` : "Output";
  return title ? `${idLabel} · ${title}` : idLabel;
}

test("homepage output list helper keeps the ID and adds the title", () => {
  assert.equal(
    pipelineOutputListTitle({ output_id: "439", output_title: "Riverwalk at dusk" }),
    "Output 439 · Riverwalk at dusk"
  );
  assert.equal(
    pipelineOutputListTitle({ output_id: "440", content_title: "Lakefront sunrise" }),
    "Output 440 · Lakefront sunrise"
  );
  assert.equal(pipelineOutputListTitle({ output_id: "441" }), "Output 441");
});

test("live Studio JS renders output title in the recent-outputs list", () => {
  assert.match(app, /function pipelineOutputListTitle\(/);
  assert.match(app, /title-cell">\$\{escapeHtml\(pipelineOutputListTitle\(r\)\)\}/);
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  assert.ok(build);
  assert.match(html, new RegExp(`app-item4-0625\\.js\\?v=${build.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
});

test("creative editor heading shows platform, output number, and title with bullets", () => {
  assert.match(app, /function creativeEditorOutputHeading\(output = \{\}\)/);
  assert.match(app, /output\?\.output_title \|\| output\?\.content_title/);
  assert.match(app, /return parts\.join\(" • "\)/);
  assert.match(app, /creativeEditorTitle"\)\.textContent = creativeEditorOutputHeading\(output\)/);
});

test("opening a platform output jumps immediately to the top of the page", () => {
  const openEditor = app.match(/async function openCreativeEditor\(recordId\) \{[\s\S]*?const data = await api/);
  assert.ok(openEditor, "openCreativeEditor should be present");
  assert.match(openEditor[0], /creativeEditorPanel"\)\.hidden = false;\s*window\.scrollTo\(0, 0\);/);
  assert.doesNotMatch(app, /creativeEditorPanel"\)\.scrollIntoView\(\{ behavior: "smooth"/);
});


test("pipeline output puts Download Cover on a new line when Open post is present", () => {
  assert.match(app, /const coverDownloadUrl = phase6ThumbnailDownloadUrl\(r\)/);
  assert.match(app, /pipeline-cover-download/);
  assert.match(app, /pipeline-post-action-links/);
  assert.match(app, /postLink && coverLink \? "<br>" : ""/);
  assert.match(app, /\$\{actionLinks\}<\/td>/);
});
