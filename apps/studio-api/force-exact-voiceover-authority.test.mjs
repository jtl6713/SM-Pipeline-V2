import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Force exact Production script invalidates stale generated voiceover", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("async function syncProductionRequestDirectivesToContentItem");
  const end = worker.indexOf("async function syncProductionRequestDirectivesRoute", start);
  assert.ok(start >= 0 && end > start);
  const handler = worker.slice(start, end);
  assert.match(handler, /requestedScriptMode === "Force exact"/);
  assert.match(handler, /fields\.Voiceover_Script = requestedScript/);
  assert.match(handler, /fields\.Script_Status = "Generated"/);
  assert.match(handler, /fields\.Voiceover_URL = null/);
  assert.match(handler, /fields\.Voiceover_Google_Drive_File_ID = null/);
  assert.match(handler, /previousRequestedScript !== requestedScript/);
  assert.match(handler, /previousVoiceoverScript !== requestedScript/);
  assert.match(handler, /timedScriptNotesChanged/);
  assert.match(handler, /invalidateVoiceover/);
  assert.match(handler, /options\.invalidateVoiceover/);
});

test("Promoted timed-script Apply always invalidates voiceover for remeasure", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("async function applyPromotedTimedScriptRoute");
  const end = worker.indexOf("async function productionRequestPreferredMusic", start);
  assert.ok(start >= 0 && end > start);
  const handler = worker.slice(start, end);
  assert.match(handler, /invalidateVoiceover:\s*true/);
  assert.match(handler, /VO-driven/);
});
