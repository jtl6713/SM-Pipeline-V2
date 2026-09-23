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
  assert.match(html, /0\.6\.368-homepage-output-titles/);
});
