import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();

test("workspace heal clears stale compressing@95 when Drive authority exists", () => {
  const block = worker.slice(
    worker.indexOf("function item4HealStaleCompressionAssets"),
    worker.indexOf("function item4HasVideoMasters"),
  );
  assert.match(block, /compression_progress: 100/);
  assert.match(block, /progress >= 95 \|\| previewReady/);
  assert.match(block, /item4HealStaleCompressionAssets\(assets\)/);
});
