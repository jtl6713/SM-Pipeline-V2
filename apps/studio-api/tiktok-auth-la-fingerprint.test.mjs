import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("LA TikTok auth Worker accepts pipeline secret SHA-256 fingerprint", async () => {
  const source = await readFile(path.join(here, "../tiktok-auth-la/worker.js"), "utf8");
  assert.match(source, /PIPELINE_SECRET_SHA256 = "206163e803094104e8de49871a138636b2978653a9935feea94f85e2454d666e"/);
  assert.match(source, /async function requirePipelineSecret/);
  assert.match(source, /fingerprintMatch/);
  assert.match(source, /legacyMatch/);
  assert.match(source, /await requirePipelineSecret\(request, env\)/);
});
