import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerFunctions = fs.readFileSync(path.join(here, "worker-functions-01.mjs"), "utf8");

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
const ideaLibraryIsEligibleImage = () => false;
const ideaLibraryIsEligibleVideo = () => false;
const reject = extractedFunction("ideaLibraryRejectReason", {
  f,
  googleDriveFileId,
  ideaLibraryFileBytes,
  ideaLibraryIsEligibleImage,
  ideaLibraryIsEligibleVideo,
  ITEM4_MAX_FILE_BYTES: 25 * 1024 * 1024,
  ITEM4_MAX_CLIP_FILE_BYTES: 200 * 1024 * 1024,
});

function asset(fields = {}) {
  return {
    id: "recTestAsset00001",
    fields: {
      "Asset Name": "Chicago Test Asset",
      "Google Drive File ID": "driveFileId1234567890",
      Media_Class: "Image",
      MIME_Type: "image/jpeg",
      Rights_Status: "Owned",
      Asset_Status: "Available",
      Raw_Source_Eligibility: "Eligible",
      Drive_Access_Status: "Public",
      Asset_Role: "Raw Photo",
      Active: true,
      Do_Not_Use: false,
      File_Size_Bytes: 400000,
      ...fields,
    },
  };
}

const goldenHourIds = [
  "recVL46KTaLLefNzd",
  "receoP41M6mfmUGTM",
  "recXpMZ9APuThWWiA",
  "receJNGFZP7RAtBtm",
  "recgahJUVfHF137cz",
  "recdbmbHlwKvVEDtG",
  "rectwUMUdaUI0CkBp",
];

test("approved storyboard keeps the seven Golden Hour selections despite soft catalog flags", () => {
  const fixtures = [
    asset({ "Asset Name": "Chicago Winters 6" }),
    asset({ "Asset Name": "Chicago Riverwalk 8" }),
    asset({ "Asset Name": "The Bean 17" }),
    asset({
      "Asset Name": "CTA Train 19",
      Media_Class: "Video",
      MIME_Type: "video/mp4",
      Asset_Role: "Raw Footage",
      Exclusion_Reasons: ["Watermarked/Branded"],
      File_Size_Bytes: 7682795,
      Duration_Seconds: 9,
    }),
    asset({
      "Asset Name": "North Avenue Beach 1",
      Exclusion_Reasons: ["Low Quality", "Watermarked/Branded"],
      File_Size_Bytes: 190432,
    }),
    asset({
      "Asset Name": "Chicago Before the City Wakes StoryFirst Demo Scene 1 5ccf6",
      Raw_Source_Eligibility: "Not Applicable",
      Asset_Role: "Other",
      MIME_Type: "image/png",
      File_Size_Bytes: 2901820,
    }),
    asset({ "Asset Name": "Miru 10" }),
  ];
  assert.equal(fixtures.length, 7);
  fixtures.forEach((row, index) => {
    assert.equal(
      reject(row, { allowVideo: true, approvedStoryboard: true }),
      null,
      "scene " + (index + 1) + " / " + goldenHourIds[index] + " must remain attachable",
    );
  });
});

test("approved storyboard still blocks hard exclusions and unsafe media", () => {
  assert.match(
    reject(asset({ Exclusion_Reasons: ["Wrong Subject"] }), { approvedStoryboard: true }) || "",
    /exclusion/i,
  );
  assert.match(
    reject(asset({ Do_Not_Use: true }), { approvedStoryboard: true }) || "",
    /Do Not Use/i,
  );
  assert.match(
    reject(asset({ Potential_Match_Notes: "QA-ASSET-THIRD-PARTY-OVERLAY: REVIEW required" }), {
      approvedStoryboard: true,
    }) || "",
    /third-party overlay/i,
  );
  assert.match(
    reject(asset({ "Google Drive File ID": "" }), { approvedStoryboard: true }) || "",
    /Drive master/i,
  );
  assert.match(
    reject(asset({ "Asset Name": "Fill crop __1080x1920__" }), { approvedStoryboard: true }) || "",
    /derived asset/i,
  );
});

test("automatic matching remains strict for Watermarked/Branded alone", () => {
  assert.notEqual(
    reject(asset({ Exclusion_Reasons: ["Watermarked/Branded"] }), { allowLowQuality: true }),
    null,
  );
});
