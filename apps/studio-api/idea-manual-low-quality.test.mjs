import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerFunctions = fs.readFileSync(path.join(here, "worker-functions-01.mjs"), "utf8");
const ui = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");

function extractedFunction(name, globals) {
  const start = workerFunctions.indexOf("export function " + name + "(");
  const end = workerFunctions.indexOf("/*__STUDIO_WORKER_END:" + name + "__*/", start);
  assert.ok(start >= 0 && end > start, name + " must retain the Worker split marker");
  const source = workerFunctions.slice(start, end).trim().replace(/^export /, "");
  return vm.runInNewContext("(" + source + ")", globals);
}

const f = (record, field) => record.fields[field];
const googleDriveFileId = (record) => record.fields["Google Drive File ID"] || "";
const ideaLibraryFileBytes = (record) => Number(record.fields.File_Size_Bytes || 0);
const eligible = extractedFunction("ideaLibraryIsEligibleImage", { f, googleDriveFileId });
const reject = extractedFunction("ideaLibraryRejectReason", {
  f, ideaLibraryIsEligibleImage: eligible, ideaLibraryIsEligibleVideo: () => false,
  ideaLibraryFileBytes, ITEM4_MAX_FILE_BYTES: 25 * 1024 * 1024,
  ITEM4_MAX_CLIP_FILE_BYTES: 200 * 1024 * 1024,
});
function lurie(fields = {}) {
  return {
    id: "recE51DLnmt5zbOao",
    fields: {
      "Asset Name": "Lurie Gardens 2",
      "Google Drive File ID": "lurieGarden2Drive",
      Media_Class: "Image",
      MIME_Type: "image/jpeg",
      Classification_Status: "Classified",
      Raw_Source_Eligibility: "Eligible",
      Asset_Status: "Available",
      Active: true,
      Rights_Status: "Owned",
      Exclusion_Reasons: ["Low Quality"],
      Quality_Score: 6,
      ...fields,
    },
  };
}

test("Lurie 2, 5, and 6 Low Quality-only images are operator-selectable, not automation eligible", () => {
  for (const name of ["Lurie Gardens 2", "Lurie Gardens 5", "Lurie Gardens 6"]) {
    const asset = lurie({ "Asset Name": name });
    assert.equal(eligible(asset), false, "automatic matcher must continue excluding " + name);
    assert.equal(eligible(asset, { allowLowQuality: true }), true, name + " should be manually selectable");
    assert.match(reject(asset) || "", /not a classified eligible library image/);
    assert.equal(reject(asset, { allowLowQuality: true }), null, name + " must pass explicitly approved attach");
  }
});

test("strict quality-only exception cannot bypass unrelated exclusions or unusable media", () => {
  const disallowed = [
    { Exclusion_Reasons: ["Low Quality", "Wrong Subject"] },
    { Exclusion_Reasons: ["Watermarked/Branded"] },
    { Exclusion_Reasons: ["Wrong Subject"] },
    { Exclusion_Reasons: "Low Quality, Burned-in Text/Captions" },
    { Do_Not_Use: true },
    { Active: false },
    { Classification_Status: "Needs Classification" },
    { Raw_Source_Eligibility: "Ineligible" },
    { Asset_Status: "Unavailable" },
    { "Google Drive File ID": "" },
    { Potential_Match_Notes: "QA-ASSET-THIRD-PARTY-OVERLAY: REVIEW required" },
  ];
  for (const fields of disallowed) {
    const asset = lurie(fields);
    assert.equal(eligible(asset, { allowLowQuality: true }), false, JSON.stringify(fields));
    assert.notEqual(reject(asset, { allowLowQuality: true }), null, JSON.stringify(fields));
  }
  assert.equal(eligible(lurie({ Exclusion_Reasons: [{ name: "Low Quality" }] })), false);
  assert.equal(eligible(lurie({ Exclusion_Reasons: [{ name: "Low Quality" }] }), { allowLowQuality: true }), true);
  assert.equal(eligible(lurie({ Exclusion_Reasons: [] })), true, "ordinary eligible images remain eligible");
});

test("manual browse and suggestions include quality-only images but never precheck them", () => {
  const browse = workerFunctions.slice(
    workerFunctions.indexOf("export async function getMediaLibraryStills"),
    workerFunctions.indexOf("/*__STUDIO_WORKER_END:getMediaLibraryStills__*/"),
  );
  const suggestions = workerFunctions.slice(
    workerFunctions.indexOf("export async function getIdeaLibrarySuggestions"),
    workerFunctions.indexOf("/*__STUDIO_WORKER_END:getIdeaLibrarySuggestions__*/"),
  );
  assert.match(browse, /ideaLibraryIsEligibleImage\(record, \{ allowLowQuality: true \}\)/);
  assert.match(suggestions, /ideaLibraryIsEligibleImage\(record, \{ allowLowQuality: true \}\)/);
  assert.match(suggestions, /preselected: row\.preselected && ideaLibraryIsEligibleImage\(record\)/);
  const mapper = workerFunctions.slice(
    workerFunctions.indexOf("export function mapIdeaLibraryAsset"),
    workerFunctions.indexOf("/*__STUDIO_WORKER_END:mapIdeaLibraryAsset__*/"),
  );
  assert.match(mapper, /quality_warning:/);
  assert.match(mapper, /"Low Quality"/);
});

test("only an explicit manual POST opts into low-quality attachment, with validation before watermarking", () => {
  const attach = workerFunctions.slice(
    workerFunctions.indexOf("export async function attachItem4LibraryAssets"),
    workerFunctions.indexOf("/*__STUDIO_WORKER_END:attachItem4LibraryAssets__*/"),
  );
  const pre = attach.indexOf("const preflight = ideaLibraryRejectReason(media, { allowVideo, allowLowQuality })");
  const watermark = attach.indexOf("media = await ensureChicagoWatermarkedLibraryAsset");
  assert.ok(pre >= 0 && watermark > pre, "server checks exclusions before side-effecting watermark creation");
  assert.match(attach, /const allowLowQuality = payload\?\.allow_low_quality === true/);
  const internal = workerFunctions.slice(
    workerFunctions.indexOf("export async function attachItem4LibraryAssetIds"),
    workerFunctions.indexOf("/*__STUDIO_WORKER_END:attachItem4LibraryAssetIds__*/"),
  );
  assert.doesNotMatch(internal, /allow_low_quality/);
  assert.match(ui, /media_asset_ids: mediaAssetIds,[\s\S]{0,120}allow_low_quality: true/);
  assert.match(ui, /media_asset_ids: toAdd, allow_video: true, allow_low_quality: true/);
  assert.match(ui, /Low quality · manual choice/);
});
