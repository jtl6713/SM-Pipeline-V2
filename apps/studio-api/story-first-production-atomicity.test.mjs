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
  assert.match(ensure, /replaceAll:true,allowVideo:true,requireAll:true,approvedStoryboard:true/);
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
  assert.ok(ensure.indexOf("return await item4UpdateRequestState") > ensure.indexOf("const missing ="), "creative directives must be committed after asset validation");
});

test("explicitly approved storyboard media uses a guarded classification exception", () => {
  const policy = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  assert.match(policy, /approvedStoryboard = false/);
  assert.match(policy, /if \(approvedStoryboard\)/);
  assert.match(policy, /has uncleared rights/);
  assert.match(policy, /requires third-party overlay review/);
  assert.match(policy, /is missing its Drive master/);
  assert.match(ensure, /approvedStoryboard: true/);
  assert.match(attach, /ideaLibraryRejectReason\(media, \{ allowVideo, approvedStoryboard \}\)/);
});

test("approved storyboard bypasses first-party watermark runner but retains third-party policy", () => {
  assert.match(attach, /const storyboardBrandingPending = approvedStoryboard/);
  assert.match(attach, /if \(!approvedStoryboard\) \{\s*media = await ensureChicagoWatermarkedLibraryAsset/);
  assert.match(attach, /branding_status: storyboardBrandingPending/);
  assert.match(attach, /branding_warning: storyboardBrandingPending/);
  assert.ok(attach.indexOf("ideaLibraryRejectReason(media, { allowVideo, approvedStoryboard })") <
    attach.indexOf("const storyboardBrandingPending"), "third-party overlay preflight must precede watermark warning");
  assert.match(attach, /if \(requireAll &&/);
});
