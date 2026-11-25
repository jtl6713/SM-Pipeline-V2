import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
const match = source.match(/export async function deleteAssetLibraryItem\(request, env, url\) \{[\s\S]*?(?=\/\*__STUDIO_WORKER_END:deleteAssetLibraryItem__\*\/)/);
assert.ok(match, "delete handler source");
const recordId = "recTdibIyhNnqDFdT";
const asset = { id: "asset-uuid", airtable_record_id: recordId, asset_name: "Calle Ocho 2", media_class: "Graphic", google_drive_file_id: "drive-file" };
function harness({ objectRefs = [], legacyRefs = [], outputRefs = [], transferRefs = [], retire = false, driveFails = false } = {}) {
  const calls = [];
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const context = {
    HttpError, studioSupabaseConfigured: () => true, studioReadCacheDropPrefix: (key) => calls.push(["cache", key]),
    respond: (_request, _env, body) => body,
    trashStudioAssetOnDrive: async () => { calls.push(["trash"]); return driveFails ? { ok: false, error: "Drive unavailable" } : { ok: true, trashed: true }; },
    driveTrashLooksGone: () => false,
    supabaseRest: async (_env, path, options = {}) => {
      calls.push([options.method || "GET", path]);
      if (options.method === "PATCH") return [{ ...asset, ...JSON.parse(options.body) }];
      if (options.method === "DELETE") return [asset];
      if (path.startsWith("media_assets?")) return [asset];
      if (path.startsWith("production_requests?")) return decodeURIComponent(path).includes("media_asset_record_id") ? objectRefs : legacyRefs;
      if (path.startsWith("platform_outputs?")) return outputRefs;
      if (path.startsWith("studio_media_transfer_queue?")) return transferRefs;
      throw Error("Unexpected path " + path);
    },
  };
  const handler = vm.runInNewContext("(" + match[0].replace("export ", "").trim() + ")", context);
  return { calls, run: () => handler({ json: async () => ({ retire_only: retire }) }, {}, new URL("https://studio.test/api/library/" + recordId)) };
}
test("object-form Production reference blocks physical deletion before Drive trash", async () => {
  const h = harness({ objectRefs: [{ id: "request" }] });
  await assert.rejects(h.run(), /referenced by Production request/);
  assert.equal(h.calls.some(([method]) => ["trash", "DELETE", "PATCH"].includes(method)), false);
});
test("output-only reference names the output and blocks Drive trash", async () => {
  const h = harness({ outputRefs: [{ output_number: 10969 }] });
  await assert.rejects(h.run(), /#10969/);
  assert.equal(h.calls.some(([method]) => method === "trash"), false);
});
test("explicit retirement preserves source file and returns verified result", async () => {
  const h = harness({ objectRefs: [{ id: "request" }], retire: true });
  const result = await h.run();
  assert.equal(result.retired, true);
  assert.equal(result.deleted, false);
  assert.equal(h.calls.some(([method]) => method === "PATCH"), true);
  assert.equal(h.calls.some(([method]) => ["trash", "DELETE"].includes(method)), false);
  assert.equal(h.calls.some(([method]) => method === "cache"), true);
});
test("unreferenced deletion trashes Drive before deleting Supabase row", async () => {
  const h = harness();
  assert.equal((await h.run()).deleted, true);
  const methods = h.calls.map(([method]) => method);
  assert.ok(methods.indexOf("trash") < methods.indexOf("DELETE"));
});
test("Drive failure preserves Supabase row", async () => {
  const h = harness({ driveFails: true });
  await assert.rejects(h.run(), /Google Drive trash failed/);
  assert.equal(h.calls.some(([method]) => method === "DELETE"), false);
});
test("ordinary library search excludes retired rows, ID lookups remain available", () => {
  const reads = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const start = reads.indexOf("function listSupabaseAssetLibraryRecords");
  const body = reads.slice(start, reads.indexOf("function listSupabaseLibraryBatchExistingNames", start));
  assert.ok(body.indexOf("if (Array.isArray(ids)") < body.indexOf("or=(active.is.null,active.eq.true,do_not_use.is.null,do_not_use.eq.false)"));
});
test("search card provides visible errors and explicit retirement action", () => {
  const web = readFileSync(new URL("../studio-web/assets/app-item4-1008.js", import.meta.url), "utf8");
  const start = web.indexOf("function bindLibraryDeleteButtons");
  const body = web.slice(start, web.indexOf("function publishedLibraryConfirmCopy", start));
  assert.match(body, /role", "alert"/);
  assert.match(body, /Remove from library only/);
  assert.match(body, /retire_only: true/);
  assert.match(body, /result\?\.retired !== true/);
});
