import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const worker = readStudioWorkerSource();

test("workspace does not falsely mark AME completion from 100% progress alone", () => {
  const block = worker.slice(
    worker.indexOf("function item4HealStaleCompressionAssets"),
    worker.indexOf("function item4HasVideoMasters"),
  );
  assert.match(block, /compression_progress: 100/);
  assert.match(block, /asset\\?\\.preview_public_url/);
  assert.match(block, /previewSize <= 95 \\* 1024 \\* 1024/);
  assert.doesNotMatch(block, /progress >= 95 \\|\\| previewReady/);
  assert.match(block, /item4HealStaleCompressionAssets\\(assets\\)/);
});

test("oversized AME output remains eligible for another compression attempt", () => {
  const block = worker.slice(
    worker.indexOf("function item4AssetCompressionPending"),
    worker.indexOf("function item4AssetsNeedStudioCompress"),
  );
  assert.match(block, /compression_provider/);
  assert.match(block, /adobe-media-encoder/);
  assert.match(block, /95 \\* 1024 \\* 1024/);
});
