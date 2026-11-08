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
  assert.match(ensure, /const matchesStoryboard = \(record\) =>/);
  assert.match(ensure, /item4AssetManifest\(record\)/);
  assert.match(ensure, /actual\.length === ids\.length/);
  assert.match(ensure, /actual\.every\(\(id, index\) => id === ids\[index\]\)/);
  assert.match(ensure, /await airtableFetch\(env, PRODUCTION_REQUEST_TABLE, requestRecord\.id\)/);
  assert.match(ensure, /for \(let attempt = 0; attempt < 2; attempt\+\+\)/);
});

test("story-first preserves ordered scene voiceover, time and selected asset ID", () => {
  assert.match(ensure, /time:row\.time, voiceover:row\.voiceover, visual:row\.visual, media:row\.media/);
  assert.match(ensure, /asset_id:row\.assigned_asset_id/);
  assert.match(ensure, /Script_Mode: "Force exact", Requested_Script: script/);
  assert.ok(ensure.indexOf("return await item4UpdateRequestState") > ensure.indexOf("if (!confirmed)"), "creative directives must be committed after asset validation");
});

test("seven-scene editorial metadata survives the handoff into the Production draft", () => {
  for (const key of ["scene_label","on_screen_text","on_screen_text_instagram",
    "voiceover_instagram","music_only_last_seconds"]) {
    assert.ok(ensure.includes(key+":row."+key) ||
      ensure.includes(key+":Number(row."+key), "Producer handoff omitted "+key);
  }
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

test("production handoff explicitly imports its media eligibility validator", () => {
  const importEnd = handoff.indexOf('from "./worker-functions-01.mjs";');
  assert.ok(importEnd > 0, "production worker must import its shared policy functions");
  const importStart = handoff.lastIndexOf("import {", importEnd);
  const importNames = handoff.slice(importStart, importEnd);
  assert.ok(importNames.split(",").some(name => name.trim() === "ideaLibraryRejectReason"),
    "story-first preflight must not reference an undefined validator");
  const policy = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  assert.ok(policy.includes("export function ideaLibraryRejectReason("));
});
