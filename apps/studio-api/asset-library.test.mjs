import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateLibraryBatchNames,
  collectJsonDriveIds,
  coerceLibraryDurationSeconds,
  libraryBatchNameFilterFormula,
  libraryDriveFilename,
  libraryRecordFileBytes,
  maxLibraryBatchSequence,
  mediaAssetIsHeic,
  mapPublishedLibraryFile,
  normalizeLibraryBatchBase,
  parseLibraryBatchSequence,
  stripLibraryAssetExtension,
  publishedDurationSeconds,
  publishedFileReleaseGuard,
  publishedLibraryFilterFormula,
  parseLibraryDateParam,
  resolveLibraryListSort,
  libraryAddedDateFilterFormula,
  publishedLibraryObjectKey,
  publicMediaObjectKey,
  publishedReleaseFields,
  sanitizeLibraryAssetName,
  LIBRARY_CROSS_SCOPE_SETTING,
  libraryCrossScopeEnabled,
  resolveLibraryCrossScopeFlag,
  firstLinkedRecordId,
  resolveLibraryUploadProfileId,
  mediaAssetProfileScopeFormula,
  combineAirtableFormulas,
  ideaLibraryExcludeDerivedStillFormula,
  libraryClassifyPendingFormula,
} from "./asset-library.mjs";

function output(fields) {
  return { id: "recOUT1", fields };
}

test("published list formula requires Published_At and blank Test_Run_ID", () => {
  const formula = publishedLibraryFilterFormula("");
  assert.match(formula, /\{Test_Run_ID\}=BLANK\(\)/);
  assert.match(formula, /\{Published_At\}!=""/);
  assert.doesNotMatch(formula, /finished content/i);
  const searched = publishedLibraryFilterFormula("Instagram Reel");
  assert.match(searched, /Output_Title/);
  assert.match(searched, /instagram reel/);
});

test("published mapper marks released rows and omits invented 30s duration", () => {
  const live = mapPublishedLibraryFile(output({
    Output_Title: "Riverwalk night",
    Platform: "Instagram",
    Platform_Output_Type: "Reel",
    Published_At: "2026-09-01T12:00:00.000Z",
    Platform_Post_URL: "https://instagram.com/p/abc",
    Final_File_ID: "driveFinal1",
    Final_File_URL: "https://drive.google.com/file/d/driveFinal1/view",
    Studio_Preview_URL: "https://media.chicagoshining.com/studio/previews/recOUT1/out.mp4",
    Render_Total_Frames: 1260,
    File_Size_Bytes: 3100243,
  }));
  assert.equal(live.record_type, "platform_output");
  assert.equal(live.media_kind, "video");
  assert.equal(live.file_released, false);
  assert.equal(live.duration_seconds, 42);
  assert.equal(live.platform_post_url, "https://instagram.com/p/abc");
  assert.equal(live.file_size_bytes, 3100243);

  const released = mapPublishedLibraryFile(output({
    Platform: "Instagram",
    Platform_Output_Type: "Reel",
    Published_At: "2026-09-01T12:00:00.000Z",
    Platform_Post_URL: "https://instagram.com/p/abc",
    Final_File_ID: "",
    Final_File_URL: "",
    Studio_Effective_Video_Duration_Seconds: 30,
  }));
  assert.equal(released.file_released, true);
  assert.equal(released.duration_seconds, null);
  assert.equal(released.name, "Instagram Reel");
});

test("native still packages without a Final_File are photos", () => {
  const row = mapPublishedLibraryFile(output({
    Platform: "Instagram",
    Studio_Output_Type: "Carousel",
    Platform_Output_Type: "Instagram Carousel",
    Published_At: "2026-09-01T12:00:00.000Z",
    Thumbnail_URL: "https://media.chicagoshining.com/publish/cover.jpg",
    Render_Status: "Native Photo Route",
  }));
  assert.equal(row.media_kind, "photo");
  assert.equal(row.duration_seconds, null);
});

test("release-file refuses unpublished, missing live URL, and master-id collision", () => {
  assert.equal(publishedFileReleaseGuard(output({
    Final_File_ID: "driveFinal1",
    Platform_Post_URL: "https://instagram.com/p/abc",
  })).status, 409);

  assert.equal(publishedFileReleaseGuard(output({
    Published_At: "2026-09-01T12:00:00.000Z",
    Final_File_ID: "driveFinal1",
  })).status, 409);

  const master = publishedFileReleaseGuard(output({
    Published_At: "2026-09-01T12:00:00.000Z",
    Platform_Post_URL: "https://instagram.com/p/abc",
    Final_File_ID: "masterDrive9",
    Output_Status: "Published",
  }), { masterDriveIds: ["masterDrive9"] });
  assert.equal(master.status, 409);
  assert.match(master.error, /ITEM4-MASTER|STUDIO_MASTER/);

  const rendering = publishedFileReleaseGuard(output({
    Published_At: "2026-09-01T12:00:00.000Z",
    Platform_Post_URL: "https://instagram.com/p/abc",
    Final_File_ID: "driveFinal1",
    Output_Status: "In Production",
  }));
  assert.equal(rendering.status, 409);

  const ok = publishedFileReleaseGuard(output({
    Published_At: "2026-09-01T12:00:00.000Z",
    Platform_Post_ID: "1799",
    Final_File_ID: "driveFinal1",
    Output_Status: "Published",
  }), { masterDriveIds: ["otherMaster"] });
  assert.equal(ok.ok, true);
  assert.equal(ok.already_released, false);

  const gone = publishedFileReleaseGuard(output({
    Published_At: "2026-09-01T12:00:00.000Z",
    Platform_Post_URL: "https://instagram.com/p/abc",
    Final_File_ID: "",
    Final_File_URL: "",
  }));
  assert.equal(gone.ok, true);
  assert.equal(gone.already_released, true);
});

test("published object key prefers the R2 MP4 and ignores cover JPEGs", () => {
  assert.equal(publicMediaObjectKey("https://media.chicagoshining.com/studio/previews/out.mp4"), "studio/previews/out.mp4");
  assert.equal(publicMediaObjectKey("https://media.chicagoshining.com/publish/cover.jpg"), "");
  assert.equal(publishedLibraryObjectKey(output({
    Thumbnail_URL: "https://media.chicagoshining.com/publish/cover.jpg",
    Studio_Preview_URL: "https://media.chicagoshining.com/studio/previews/recOUT1/out.mp4",
  })), "studio/previews/recOUT1/out.mp4");
  assert.equal(publishedLibraryObjectKey(output({
    Studio_Preview_URL: "https://media.chicagoshining.com/publish/cover.jpg",
    Studio_Preview_R2_Key: "studio/previews/platform-output/recOUT1/out.mp4",
  })), "studio/previews/platform-output/recOUT1/out.mp4");
  assert.equal(publishedLibraryObjectKey(output({
    Final_File_URL: "https://drive.google.com/file/d/driveFinal1/view",
  })), "");
});

test("library file bytes prefer File_Size_Bytes and fall back to File_Size_MB", () => {
  assert.equal(libraryRecordFileBytes(output({ File_Size_Bytes: 3100243, File_Size_MB: 2.96 })), 3100243);
  assert.equal(libraryRecordFileBytes(output({ File_Size_MB: 2.96 })), 3103785);
  assert.equal(libraryRecordFileBytes(output({ File_Size_Bytes: [512000] })), 512000);
  assert.equal(libraryRecordFileBytes(output({})), 0);
});

test("release stamp clears Drive fields and keeps reporting fields out of the patch", () => {
  const fields = publishedReleaseFields();
  assert.equal(fields.Final_File_ID, null);
  assert.equal(fields.Final_File_URL, null);
  assert.equal(fields.Output_URL, null);
  assert.equal(fields.Final_File_Storage_Status, "Released");
  assert.equal("Published_At" in fields, false);
  assert.equal("Platform_Post_URL" in fields, false);
  assert.equal("Platform_Post_ID" in fields, false);
});

test("finished passthrough JSON drive ids are collected for the master guard", () => {
  const ids = collectJsonDriveIds(JSON.stringify({
    clips: [{ google_drive_file_id: "masterDrive9", source: "finished_passthrough" }],
  }), { finishedOnly: true });
  assert.deepEqual(ids, ["masterDrive9"]);
});

test("blank duration is not coerced to zero", () => {
  assert.equal(coerceLibraryDurationSeconds(null), null);
  assert.equal(coerceLibraryDurationSeconds(0), null);
  assert.equal(coerceLibraryDurationSeconds(42.4), 42);
  assert.equal(publishedDurationSeconds({ fields: { Studio_Effective_Video_Duration_Seconds: 30 } }), null);
});

test("library rename sanitizes stem and Drive filename", () => {
  assert.deepEqual(sanitizeLibraryAssetName("  Oak Street Beach.jpg "), { ok: true, name: "Oak Street Beach" });
  assert.equal(sanitizeLibraryAssetName("").ok, false);
  assert.equal(sanitizeLibraryAssetName("a/b").ok, false);
  assert.equal(libraryDriveFilename("Oak Street Beach", "jpg"), "Oak-Street-Beach.jpg");
  assert.equal(libraryDriveFilename("Oak Street Beach", ".PNG"), "Oak-Street-Beach.png");
});

test("library batch base strips a trailing number the operator typed", () => {
  assert.deepEqual(normalizeLibraryBatchBase("  Space Museum 15 "), { ok: true, name: "Space Museum" });
  assert.deepEqual(normalizeLibraryBatchBase("Space Museum"), { ok: true, name: "Space Museum" });
  assert.equal(normalizeLibraryBatchBase("").ok, false);
});

test("library batch sequence continues after existing Airtable names", () => {
  assert.equal(parseLibraryBatchSequence("Space Museum", "Space Museum"), 1);
  assert.equal(parseLibraryBatchSequence("Space Museum 15", "Space Museum"), 15);
  assert.equal(parseLibraryBatchSequence("space museum 2", "Space Museum"), 2);
  assert.equal(parseLibraryBatchSequence("Space Museum Cafe 3", "Space Museum"), null);
  assert.equal(maxLibraryBatchSequence([
    "Space Museum 1",
    "Space Museum 15",
    "Other Beach 9",
    "Space Museum",
  ], "Space Museum"), 15);
  assert.deepEqual(
    allocateLibraryBatchNames("Space Museum", 3, ["Space Museum 1", "Space Museum 15"]),
    ["Space Museum 16", "Space Museum 17", "Space Museum 18"]
  );
  assert.deepEqual(allocateLibraryBatchNames("Space Museum", 2, []), ["Space Museum 1", "Space Museum 2"]);
  assert.match(libraryBatchNameFilterFormula("Space Museum"), /space museum/);
  assert.match(libraryBatchNameFilterFormula("Space Museum"), /REGEX_MATCH/);
});

test("library batch numbering continues from highest number no matter the file extension", () => {
  assert.equal(stripLibraryAssetExtension("Navy Pier 12.JPG"), "Navy Pier 12");
  assert.equal(stripLibraryAssetExtension("Navy Pier 12.mp4"), "Navy Pier 12");
  assert.equal(parseLibraryBatchSequence("Navy Pier 12.jpg", "Navy Pier"), 12);
  assert.equal(parseLibraryBatchSequence("Navy Pier 3.HEIC", "Navy Pier"), 3);
  assert.equal(parseLibraryBatchSequence("Navy Pier.mp4", "Navy Pier"), 1);
  assert.equal(parseLibraryBatchSequence("Navy Pier 12.jpg", "Navy Pier.jpg"), 12);
  assert.equal(maxLibraryBatchSequence([
    "Navy Pier 1.jpg",
    "Navy Pier 8.MP4",
    "Navy Pier 3.heic",
    "Navy Pier 8.png",
    "Other Spot 99.mov",
  ], "Navy Pier"), 8);
  assert.deepEqual(
    allocateLibraryBatchNames("Navy Pier", 2, [
      "Navy Pier 1.jpg",
      "Navy Pier 8.mp4",
      "Navy Pier 3.HEIC",
    ]),
    ["Navy Pier 9", "Navy Pier 10"]
  );
  assert.deepEqual(
    allocateLibraryBatchNames("Navy Pier.mov", 1, ["Navy Pier 4.png"]),
    ["Navy Pier 5"]
  );
  assert.match(libraryBatchNameFilterFormula("Navy Pier"), /\[\.\]/);
});

test("library upload profile prefers the form field and refuses a silent default", () => {
  assert.deepEqual(
    resolveLibraryUploadProfileId({
      formProfileId: "recProfileLa2",
      urlProfileId: "recProfileChicago1",
    }),
    { ok: true, profileId: "recProfileLa2" }
  );
  assert.deepEqual(
    resolveLibraryUploadProfileId({ urlProfileId: "recProfileLa2" }),
    { ok: true, profileId: "recProfileLa2" }
  );
  assert.equal(resolveLibraryUploadProfileId({}).ok, false);
  assert.match(resolveLibraryUploadProfileId({}).error, /Content Profile/);
  assert.equal(resolveLibraryUploadProfileId({ formProfileId: "chicago" }).ok, false);
});

test("library profile scope formula isolates Content_Profile unless cross-scope is on", () => {
  assert.equal(LIBRARY_CROSS_SCOPE_SETTING, "LIBRARY_INCLUDE_CROSS_SCOPE");
  assert.equal(libraryCrossScopeEnabled("on"), true);
  assert.equal(libraryCrossScopeEnabled("0"), false);
  assert.equal(resolveLibraryCrossScopeFlag({ searchParams: new URLSearchParams("cross_scope=1") }, "0"), true);
  assert.equal(resolveLibraryCrossScopeFlag({ searchParams: new URLSearchParams("") }, "on"), true);
  assert.equal(firstLinkedRecordId(["recProfileChicago1"]), "recProfileChicago1");
  assert.equal(firstLinkedRecordId([{ id: "recProfileLa2" }]), "recProfileLa2");
  assert.equal(mediaAssetProfileScopeFormula("recProfileChicago1", { crossScope: true }), null);
  assert.match(
    mediaAssetProfileScopeFormula("recProfileChicago1"),
    /Content_Profile.*recProfileChicago1/
  );
  assert.match(mediaAssetProfileScopeFormula("recProfileChicago1"), /BLANK/);
  assert.doesNotMatch(
    mediaAssetProfileScopeFormula("recProfileChicago1", { includeUnscoped: false }),
    /BLANK/
  );
  assert.equal(
    combineAirtableFormulas("AND({Active})", mediaAssetProfileScopeFormula("recProfileChicago1")),
    `AND(AND({Active}),${mediaAssetProfileScopeFormula("recProfileChicago1")})`
  );
  const named = mediaAssetProfileScopeFormula("recT2rbKX3MF7cVFU", {
    profileName: "ChicagoShining - Chicago",
  });
  assert.match(named, /recT2rbKX3MF7cVFU/);
  assert.match(named, /ChicagoShining - Chicago/);
  assert.match(named, /^OR\(/);
});

test("photo-wait / library scans exclude fill-crop and aspect-ratio derived stills", () => {
  const clause = ideaLibraryExcludeDerivedStillFormula();
  assert.match(clause, /fill-crop/);
  assert.match(clause, /REGEX_MATCH/);
  assert.ok(clause.includes("__[0-9]+x[0-9]+__"));
  assert.doesNotMatch(clause, /Streeterville/);
});

test("library HEIC originals are flagged so previews use Drive JPEG thumbs", () => {
  assert.equal(mediaAssetIsHeic({ name: "Lincoln Park Zoo 4.HEIC" }), true);
  assert.equal(mediaAssetIsHeic({ mimeType: "image/heic", fileExtension: "HEIC" }), true);
  assert.equal(mediaAssetIsHeic({ mimeType: "image/heif", name: "walk.heif" }), true);
  assert.equal(mediaAssetIsHeic({ mimeType: "image/jpeg", name: "Lincoln Park Zoo 4.jpg" }), false);
});


test("library date param accepts only real YYYY-MM-DD days", () => {
  assert.equal(parseLibraryDateParam("2026-09-12"), "2026-09-12");
  assert.equal(parseLibraryDateParam("2026-13-01"), null);
  assert.equal(parseLibraryDateParam("09/12/2026"), null);
  assert.equal(parseLibraryDateParam(""), null);
});

test("library list sort works for media and published catalogues", () => {
  assert.deepEqual(resolveLibraryListSort(""), {
    sort: "newest",
    sortField: "Intake_Date",
    sortDirection: "desc",
  });
  assert.deepEqual(resolveLibraryListSort("oldest"), {
    sort: "oldest",
    sortField: "Intake_Date",
    sortDirection: "asc",
  });
  assert.deepEqual(resolveLibraryListSort("name-asc"), {
    sort: "name_asc",
    sortField: "Asset Name",
    sortDirection: "asc",
  });
  assert.deepEqual(resolveLibraryListSort("name_desc", { published: true }), {
    sort: "name_desc",
    sortField: "Output_Title",
    sortDirection: "desc",
  });
  assert.deepEqual(resolveLibraryListSort("newest", { published: true }), {
    sort: "newest",
    sortField: "Published_At",
    sortDirection: "desc",
  });
});

test("classify-all pending formula includes false Classified stubs", () => {
  const formula = libraryClassifyPendingFormula("AND({Media_Class}='Image')");
  assert.match(formula, /Needs Classification/);
  assert.match(formula, /Classification Error/);
  assert.match(formula, /Search_Keywords/);
  assert.match(formula, /Classified/);
  assert.match(formula, /Content_Profile/);
  assert.equal(libraryClassifyPendingFormula(""), null);
});

test("library added-date filter is inclusive and combines with search independently", () => {
  assert.equal(libraryAddedDateFilterFormula("", ""), null);
  const fromOnly = libraryAddedDateFilterFormula("2026-09-01", "");
  assert.match(fromOnly, /Intake_Date/);
  assert.match(fromOnly, /2026-09-01/);
  assert.match(fromOnly, /IS_AFTER/);
  const both = libraryAddedDateFilterFormula("2026-09-01", "2026-09-12", "Published_At");
  assert.match(both, /Published_At/);
  assert.match(both, /2026-09-01/);
  assert.match(both, /2026-09-12/);
  assert.match(both, /IS_BEFORE/);
});
