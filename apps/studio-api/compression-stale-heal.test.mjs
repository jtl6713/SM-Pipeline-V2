import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("workspace heal clears stale compressing@95 when Drive authority exists", () => {
  const block = worker.slice(
    worker.indexOf("function item4HealStaleCompressionAssets"),
    worker.indexOf("function item4HasVideoMasters"),
  );
  assert.match(block, /compression_progress: 100/);
  assert.match(block, /progress >= 95 \|\| previewReady/);
  assert.match(block, /item4HealStaleCompressionAssets\(assets\)/);
});
