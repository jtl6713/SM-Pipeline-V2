import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const footer = fs.readFileSync(path.join(here, "assets", "ai-api-footer.js"), "utf8");

test("Studio footer exposes OpenAI/Azure preference control", () => {
  assert.match(html, /id="aiApiFooter"/);
  assert.match(html, /ai-api-footer\.js/);
  assert.match(footer, /AI API:/);
  assert.match(footer, /Preferred/);
  assert.match(footer, /OpenAI/);
  assert.match(footer, /Azure/);
  assert.match(footer, /\/api\/ai-api/);
  assert.match(footer, /method: "PATCH"/);
});
