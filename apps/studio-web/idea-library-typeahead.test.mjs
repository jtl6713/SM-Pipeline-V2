import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("idea library search sequence + pins", async () => {
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  const worker = await readFile(path.join(here, "../studio-api/worker.js"), "utf8");
  assert.match(app, /ideaLibraryLoadSequence/);
  assert.match(app, /Ignore stale responses so a slow empty-query open cannot wipe a later "Museum" search/);
  assert.match(app, /item4-0.6.645-ops-queue-dense/);
  assert.match(html, /UI build 0\.6\.644/);
  assert.match(worker, /0\.10\.557-ops-profiles-load/);
  assert.match(worker, /studio_idea_library_typeahead_v1: true/);
  assert.match(worker, /ideaLibrarySearchHit/);
  assert.match(worker, /ideaLibrarySearchFilterKeys\(queryTokens\)/);
});
