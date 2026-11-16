import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const functions = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
const start = functions.indexOf("export async function deleteAssetLibraryItem(");
const end = functions.indexOf("/*__STUDIO_WORKER_END:deleteAssetLibraryItem__*/", start);
assert.ok(start >= 0 && end > start, "extracted Asset Manager delete handler exists");
const handler = functions.slice(start, end);

test("Asset Manager DELETE commits to Supabase instead of the frozen Airtable archive", () => {
  assert.match(handler, /media_assets\?airtable_record_id=eq\./);
  assert.match(handler, /method: "DELETE"/);
  assert.match(handler, /return=representation/);
  assert.match(handler, /deleted\.length !== 1/);
  assert.doesNotMatch(handler, /airtableFetch\s*\(/);
  assert.doesNotMatch(handler, /findAssetLibraryUsages\s*\(/);
});

test("Asset Manager DELETE checks Supabase references before Drive trash or catalog deletion", () => {
  assert.match(handler, /production_requests\?master_assets=cs\./);
  assert.match(handler, /platform_outputs\?selected_assets_text=ilike/);
  assert.match(handler, /studio_media_transfer_queue\?or=/);
  assert.ok(handler.indexOf("const [requests, outputs, transfers]") < handler.indexOf("trashStudioAssetOnDrive("));
  assert.ok(handler.indexOf("trashStudioAssetOnDrive(") < handler.indexOf('method: "DELETE"'));
  assert.match(handler, /driveTrashLooksGone\(drive\)/);
});

test("Asset Manager DELETE rejects unconfirmed mutation and evicts the Library page cache", () => {
  assert.match(handler, /Supabase did not confirm this asset was deleted/);
  assert.match(handler, /studioReadCacheDropPrefix\("library:page:"\)/);
  assert.match(handler, /read_source: "supabase"/);
  assert.match(handler, /deleted: true/);
});
