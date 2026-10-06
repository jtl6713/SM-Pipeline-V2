import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(here, "worker.js");

test("ChicagoShining Asset Manager uploads fail closed without a watermarked derivative", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function uploadAssetLibraryItems");
  const end = source.indexOf("async function findAssetLibraryUsages", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /profileName:\s*f\(uploadProfile, "Profile_Name"\)/);
  assert.match(handler, /studioProfileRequiresChicagoWatermark\(uploadProfile\)\s*&&\s*!drive\?\.watermarked/);
  assert.match(handler, /The asset was not added to the Studio library/);
});

test("ChicagoShining existing library assets are watermarked before Production attachment", async () => {
  const source = await readFile(workerPath, "utf8");
  assert.match(source, /async function ensureChicagoWatermarkedLibraryAsset/);
  assert.match(source, /\/jobs\/studio-asset-watermark/);
  assert.match(source, /if \(!response\.ok \|\| !payload\?\.watermarked \|\| !payload\?\.google_drive_file_id\)/);
  assert.match(source, /media = await ensureChicagoWatermarkedLibraryAsset\(env, media, record\)/);
  assert.match(source, /media = await ensureChicagoWatermarkedLibraryAsset\(env, media, requestRecord\)/);
});

test("watermark enforcement is profile aware rather than globally Chicago-branded", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("function studioProfileRequiresChicagoWatermark");
  const end = source.indexOf("async function item4ProductionProfileRecord", start);
  assert.ok(start >= 0 && end > start);
  const helper = source.slice(start, end);

  assert.match(helper, /Profile_Name/);
  assert.match(helper, /normalized\.startsWith\("chicagoshining"\)/);
});


test("assigning an existing asset to ChicagoShining upgrades it before profile save", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function assignLibraryAssetProfile");
  const end = source.indexOf("const LIBRARY_CLASSIFY_ALL_LIMIT", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /record = await ensureChicagoWatermarkedLibraryAssetForProfile\(env, record, profile\)/);
  const watermarkIndex = handler.indexOf("ensureChicagoWatermarkedLibraryAssetForProfile");
  const profilePatchIndex = handler.indexOf("Content_Profile: [profile.id]");
  assert.ok(watermarkIndex >= 0 && profilePatchIndex > watermarkIndex);
});
