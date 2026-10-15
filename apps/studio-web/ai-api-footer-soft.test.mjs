import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const footer = fs.readFileSync(path.join(here, "assets/ai-api-footer.js"), "utf8");
const worker = readStudioWorkerSource();

test("AI API footer keeps last known preference when status fetch fails", () => {
  assert.match(footer, /CACHE_KEY = "studio\.ai_api_status_v1"/);
  assert.match(footer, /stale: true/);
  assert.match(footer, /· cached/);
  assert.doesNotMatch(footer, /innerHTML = .*status unavailable/);
  assert.match(footer, /preferred_provider: current \|\| "OpenAI"/);
});

test("Worker AI API status soft-fails Airtable and uses preference cache", () => {
  assert.match(worker, /studioAiApiPreferenceCache/);
  assert.match(worker, /settings_cached/);
  assert.match(worker, /Promise\.all\(\[\s*studioSettingsByName\(env, "AI_API_PREFERRED_PROVIDER"/);
});
