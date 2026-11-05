import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const ui = fs.readFileSync(path.join(dirname, "assets/app-item4-1008.js"), "utf8");

function attachmentFunction(api, { progress = [], sleepMs = async () => {} } = {}) {
  const begin = ui.indexOf("  async function attachSelectedLibraryAssetsOneByOne(");
  const end = ui.indexOf("  async function openProductionRequestWithLibrary(", begin);
  assert.ok(begin >= 0 && end > begin, "resumable attach helper must remain before Manage Idea caller");
  const fn = ui.slice(begin, end).trim();
  return vm.runInNewContext("(" + fn + ")", {
    api,
    sleepMs,
    ideaLibraryPickerItems: [
      { id: "recAAAAAAAAAAAAAA", name: "Lurie Gardens 1" },
      { id: "recBBBBBBBBBBBBBB", name: "Lurie Gardens 5" },
    ],
    item4LibraryItems: [
      { id: "recCCCCCCCCCCCCCC", name: "Lurie Gardens 6" },
    ],
  });
}

test("resumable per-asset attach persists other Lurie selections after one 500", async () => {
  const calls = [];
  const progress = [];
  const api = async (url, options) => {
    const ids = JSON.parse(options.body).media_asset_ids;
    calls.push({ url, options, ids });
    if (ids[0] === "recBBBBBBBBBBBBBB") {
      const error = new Error("Request failed (500)");
      error.status = 500;
      throw error;
    }
    return { ok: true, attached: 1, record: { id: "recPRODUCTION0000" } };
  };
  const attach = attachmentFunction(api);
  const result = await attach("recPRODUCTION0000", [
    "recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB", "recCCCCCCCCCCCCCC",
  ], { onProgress: (step) => progress.push(JSON.parse(JSON.stringify(step))) });
  assert.equal(result.attached, 2);
  assert.deepEqual(Array.from(result.succeeded), ["recAAAAAAAAAAAAAA", "recCCCCCCCCCCCCCC"]);
  assert.deepEqual(Array.from(result.failed, ({ id, name, status }) => ({ id, name, status })), [
    { id: "recBBBBBBBBBBBBBB", name: "Lurie Gardens 5", status: 500 },
  ]);
  assert.deepEqual(progress.map((p) => p.name), [
    "Lurie Gardens 1", "Lurie Gardens 5", "Lurie Gardens 6",
  ]);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.match(call.url, /\/production-requests\/recPRODUCTION0000\/assets\/library$/);
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.retries, 1, "never auto-replay a possibly committed POST");
    assert.equal(call.options.timeoutMs, 45000);
    assert.equal(call.ids.length, 1, "one selected asset per durable API transaction");
    const body = JSON.parse(call.options.body);
    assert.equal(body.allow_low_quality, true);
    assert.equal(body.allow_video, true);
  }
});

test("duplicate IDs are deduped and an unexpected failure remains associated with its image", async () => {
  const calls = [];
  const api = async (_url, options) => {
    calls.push(JSON.parse(options.body).media_asset_ids[0]);
    throw new Error("Service temporarily unavailable");
  };
  const attach = attachmentFunction(api);
  const result = await attach("recPRODUCTION0000", [
    "recAAAAAAAAAAAAAA", "recAAAAAAAAAAAAAA", "not-a-record", "recBBBBBBBBBBBBBB",
  ], {});
  assert.deepEqual(calls, ["recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB"]);
  assert.equal(result.attached, 0);
  assert.equal(result.failed.length, 2);
  assert.equal(result.failed[0].name, "Lurie Gardens 1");
  assert.equal(result.failed[1].name, "Lurie Gardens 5");
});

test("Ideas and Production use the same resumable attachment and verify authoritative state", () => {
  const manage = ui.slice(
    ui.indexOf("  async function openProductionRequestWithLibrary("),
    ui.indexOf('  $("item4VibeRetryVideo")?.addEventListener', ui.indexOf("  async function openProductionRequestWithLibrary(")),
  );
  const production = ui.slice(
    ui.indexOf('  $("item4LibraryAddButton")?.addEventListener("click", async () => {'),
    ui.indexOf('  $("item4BuildPlan")?.addEventListener', ui.indexOf('  $("item4LibraryAddButton")?.addEventListener("click", async () => {')),
  );
  assert.match(manage, /await attachSelectedLibraryAssetsOneByOne/);
  assert.match(manage, /const missing = selected\.filter\(\(id\) => !attached\.has\(id\)\)/);
  assert.match(production, /await attachSelectedLibraryAssetsOneByOne/);
  assert.match(production, /await loadItem4Workspace\(activeProductionRequest, \{ allowAssetChanges: true \}\)/);
  assert.match(production, /const missing = toAdd\.filter\(\(id\) => !now\.has\(id\)\)/);
  assert.ok(production.indexOf("if (missing.length)") < production.indexOf("for (const mediaId of toRemove)"),
    "never remove existing media after an incomplete add");
  assert.match(production, /No existing assets were removed/);
  assert.match(production, /Retry Apply selection for the remaining images/);
  assert.match(production, /renderItem4LibraryPicker\(\)/);
  assert.match(ui, /const BUILD_ID = "item4-\d+\.\d+\.\d+-[a-z0-9-]+"/);
});
