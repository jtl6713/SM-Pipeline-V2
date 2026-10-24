import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");

test("Asset Manager requires clean receipt before Airtable creation", () => {
  const route = source.slice(
    source.indexOf("export async function uploadAssetLibraryItems("),
    source.indexOf("/*__STUDIO_WORKER_END:uploadAssetLibraryItems__*/")
  );
  assert.ok(route.includes('drive?.provenance_screen?.decision !== "clean"'));
  assert.ok(route.includes('The asset was not added to the Studio library'));
  assert.ok(route.indexOf('drive?.provenance_screen?.decision !== "clean"') <
    route.indexOf("const created = await airtableFetch"));
  assert.ok(route.includes("Potential_Match_Notes: drive.provenance_screen"));
});
