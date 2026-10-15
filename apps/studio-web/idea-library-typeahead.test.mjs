import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("idea library search sequence + pins", async () => {
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  const worker = readStudioWorkerSource();
  assert.match(app, /ideaLibraryLoadSequence/);
  assert.match(app, /Ignore stale responses so a slow empty-query open cannot wipe a later "Museum" search/);
  assert.match(app, /item4-0.6.696-approve-binding-dirty/);
  assert.match(html, /UI build 0.6.696/);
  assert.match(worker, /0.10.621-approve-binding-dirty/);
  assert.match(worker, /studio_idea_library_typeahead_v1: true/);
  assert.match(worker, /ideaLibrarySearchHit/);
  assert.match(worker, /ideaLibrarySearchFilterKeys\(queryTokens\)/);
});
