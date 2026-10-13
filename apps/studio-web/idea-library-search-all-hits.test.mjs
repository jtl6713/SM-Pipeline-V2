import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("typed library search is not idea-ranked", async () => {
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const worker = await readFile(path.join(here, "../studio-api/worker.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(app, /item4-0.6.668-vibe-cut-16x9/);
  assert.match(html, /UI build 0\.6\.668/);
  assert.match(app, /search is not limited to this idea/);
  assert.match(app, /\{ flat: operatorSearch \}/);
  assert.match(app, /\(operatorSearch \|\| quoted\.phrase\) \? \[\] : suggested/);
  assert.match(worker, /0\.10\.571-vibe-cut-finished-short-remount/);
  assert.match(worker, /studio_idea_library_search_all_hits_v1: true/);
  assert.match(worker, /operator_search: operatorSearch/);
  assert.match(worker, /Typed search is operator choice only/);
  assert.match(worker, /suggested: operatorSearch \? \[\] : capped\.filter/);
  assert.match(worker, /\{Search_Keywords\},' ',\{AI_Tags\}/);
  assert.match(worker, /\(phrase \|\| queryTokens\.length\) \? 200 : 60/);
});
