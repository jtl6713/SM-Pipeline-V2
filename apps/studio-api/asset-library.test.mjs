import assert from "node:assert/strict";
import test from "node:test";

import {
  collectJsonDriveIds,
  coerceLibraryDurationSeconds,
  libraryRecordFileBytes,
  mapPublishedLibraryFile,
  publishedDurationSeconds,
  publishedFileReleaseGuard,
  publishedLibraryFilterFormula,
  publishedReleaseFields,
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
