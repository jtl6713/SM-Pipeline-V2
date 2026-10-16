import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizedOutputState } from "./worker-functions-01.mjs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(root, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("a stored post URL clears Manual Action Required", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "TikTok",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Ready to Publish",
      TikTok_Draft_Status: "Draft Delivered — Manual Action Required",
      Manual_Completion_Status: "Required",
      Music_Status: "Manual Action Required",
      Platform_Post_URL: "https://www.tiktok.com/t/ZPLSb2yDG/",
    },
  });
  assert.equal(state, "Published");
});

test("manual completion Not Required does not match Required", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "Instagram",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Ready to Schedule",
      Review_Status: "Approved",
      Manual_Completion_Status: "Not Required",
    },
  });
  assert.equal(state, "Scheduled");
});

test("a TikTok draft without a post URL stays Manual Action Required", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "TikTok",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Ready to Publish",
      TikTok_Draft_Status: "Draft Delivered — Manual Action Required",
      Manual_Completion_Status: "Required",
      Music_Status: "Manual Action Required",
    },
  });
  assert.equal(state, "Manual Action Required");
});

test("overview and Pipeline share the live-post clear", () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /function loadManualActionPipelineOutputs/);
  assert.match(worker, /overlayLiveTikTokPublishRows\(env, mappedAll\)/);
  assert.match(worker, /schemaVersion: 4/);
  assert.match(app, /function outputHasLivePostUrl/);
  assert.match(app, /function pipelineGroupLivePost/);
  assert.match(app, /pipeline-content-post-link/);
  assert.match(app, /filter === "attention" \|\| filter === "manual"/);
  assert.match(app, /tiktokLiveUrl\(record\)\)\) return false/);
  assert.match(app, /This TikTok is already live\. The public URL is saved\./);
  assert.match(app, /This video is already live\. The watch URL is saved\./);
});
