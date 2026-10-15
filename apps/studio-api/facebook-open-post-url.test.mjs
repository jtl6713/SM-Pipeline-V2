import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();

test("Facebook Reel cover heal preserves a live URL for Studio Open post", () => {
  assert.match(worker, /const postId = String\(f\(record, "Platform_Post_ID"\) \|\| videoId \|\| ""\)\.trim\(\)/);
  assert.match(worker, /https:\/\/www\.facebook\.com\/reel\/\$\{encodeURIComponent\(postId\)\}\//);
  assert.match(worker, /\.\.\.\(postUrl \? \{ Platform_Post_URL: postUrl \} : \{\}\)/);
});

test("Pipeline output mapping exposes Facebook platform post identity", () => {
  assert.match(worker, /platform_post_url: f\(record, "Platform_Post_URL"\),\s+platform_post_id: f\(record, "Platform_Post_ID"\),/);
});
