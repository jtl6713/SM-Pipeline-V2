import assert from "node:assert/strict";
import test from "node:test";

import { attachCompressionJobs, dropFinishedCompressionRows } from "./operations-oversized.mjs";

test("attachCompressionJobs keeps compressing files even when they left the eligible scan", () => {
  const rows = attachCompressionJobs(
    [{ google_drive_file_id: "wait1", name: "Lincoln Park Zoo 25.MOV", file_size_mb: 134.35, source: "intake_folder" }],
    [{ google_drive_file_id: "busy1", name: "Lincoln Park Zoo 24.MOV", progress_percent: 55 }]
  );
  assert.equal(rows.length, 2);
  const busy = rows.find((row) => row.google_drive_file_id === "busy1");
  assert.equal(busy.compression.progress_percent, 55);
  assert.equal(busy.source, "intake_folder");
});

test("dropFinishedCompressionRows removes Drive ids whose job just finished", () => {
  const cache = [
    { google_drive_file_id: "done1", name: "Lincoln Park Zoo 24.MOV" },
    { google_drive_file_id: "wait1", name: "Lincoln Park Zoo 25.MOV" },
  ];
  const next = dropFinishedCompressionRows(
    cache,
    [{ google_drive_file_id: "done1" }],
    []
  );
  assert.deepEqual(next.map((row) => row.google_drive_file_id), ["wait1"]);
});
