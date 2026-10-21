import assert from "node:assert/strict";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";

const source = readStudioWorkerSource();

test("library photos cannot override a Vibe Cut source while photo-wait is running", () => {
  assert.ok(source.includes('reason: "vibe-cut-uploaded-video-only"'));
  assert.ok(source.includes("if (studioIsVibeCut(latest))"));
  assert.ok(source.includes("if (studioIsVibeCut(requestRecord))"));
});

test("vibe source upload replaces stale photos and clears their old crop plan", () => {
  assert.ok(source.includes("JSON.stringify(vibeCut ? [draft] : [...existing, draft])"));
  assert.ok(source.includes('Studio_Master_Media_Assets: []'));
  assert.ok(source.includes('Studio_Variant_Manifest_JSON: null'));
});

test("vibe plan allows validated photo montage while retaining source guards", () => {
  assert.ok(source.includes("validateVibeCutSourceAssets(assets, { allowPhotoMontage:") && source.includes("allow-vibe-cut-photo-montage=1"));
  assert.ok(source.includes("Vibe Cut requires its original uploaded and processed video"));
  assert.ok(source.includes("if (studioIsVibeCut(record)) return false;"));
});
