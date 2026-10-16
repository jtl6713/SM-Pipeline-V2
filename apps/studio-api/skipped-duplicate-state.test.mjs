import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizedOutputState } from "./worker-functions-01.mjs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(root, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("a skipped rendered package does not stay Ready for Review", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "Instagram",
      Output_Status: "Skipped",
      Review_Status: "Review Sent",
      Render_Status: "Rendered",
      Publish_Status: "Not Ready",
      Final_File_URL: "https://media.chicagoshining.com/studio/previews/example/current.mp4",
      Do_Not_Publish: true,
    },
  });
  assert.equal(state, "Skipped");
});

test("a live URL still wins over a skipped status", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "TikTok",
      Output_Status: "Skipped",
      Platform_Post_URL: "https://www.tiktok.com/t/example/",
    },
  });
  assert.equal(state, "Published");
});

test("factory delete removes the unpublished content package", () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /Removed \$\{count\} unpublished outputs from this content package/);
  assert.match(worker, /Review_Status: "Skipped"/);
  assert.match(worker, /Scheduled_Post_Date: null/);
  assert.match(app, /outputStatus === "skipped" \|\| outputStatus === "cancelled" \|\| outputStatus === "rejected"/);
  assert.match(app, /if \(record\?\.do_not_publish\) return false/);
});
