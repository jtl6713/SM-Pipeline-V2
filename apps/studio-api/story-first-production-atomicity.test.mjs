import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handoff = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const library = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
function body(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "expected function boundary missing");
  return source.slice(a, b);
}
const ensure = body(handoff, "export async function ensureStoryFirstProductionMedia(", "/*__STUDIO_WORKER_END:ensureStoryFirstProductionMedia__*/");
const attach = body(library, "export async function applyLibraryAssetsToProductionRequest(", "/*__STUDIO_WORKER_END:applyLibraryAssetsToProductionRequest__*/");

test("story-first handoff requests atomic library attachment", () => {
  assert.match(ensure, /replaceAll:true,allowVideo:true,requireAll:true/);
  assert.match(attach, /if \(requireAll && \(blockedAssetIds\.length \|\| appended\.length !== \[\.\.\.new Set\(mediaIds\)\]\.length\)\)/);
  assert.ok(attach.indexOf("if (requireAll &&") < attach.indexOf("const updated = await item4UpdateRequestState"), "partial manifest must be rejected before write");
});

test("scene handoff checks exact IDs rather than just asset count", () => {
  assert.match(ensure, /const expected = new Set\(ids\)/);
  assert.match(ensure, /const actual = new Set\(/);
  assert.match(ensure, /const missing = \[\.\.\.expected\]\.filter\(id => !actual\.has\(id\)\)/);
  assert.match(ensure, /missing\.length \|\| actual\.size !== expected\.size/);
  assert.match(ensure, /missingScenes\.join\(", "\)/);
});

test("story-first preserves ordered scene voiceover, time and selected asset ID", () => {
  assert.match(ensure, /time:row\.time, voiceover:row\.voiceover, visual:row\.visual, media:row\.media/);
  assert.match(ensure, /asset_id:row\.assigned_asset_id/);
  assert.match(ensure, /Script_Mode: "Force exact", Requested_Script: script/);
});
