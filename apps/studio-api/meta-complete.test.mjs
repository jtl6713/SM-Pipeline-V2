import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMetaPostUrl,
  metaCompleteEligibility,
  metaNeedsUrlEntry,
  metaManualPublishFields,
} from "./meta-complete.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const worker04 = fs.readFileSync(path.join(dir, "worker-functions-04.mjs"), "utf8");
const workerJs = fs.readFileSync(path.join(dir, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(dir, "../studio-web/assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(dir, "../studio-web/index.html"), "utf8");

const nycArchIg = {
  platform: "Instagram",
  do_not_publish: false,
  publish_status: "Ready to Publish",
  output_status: "Approved for Publishing",
  manual_completion_status: "",
  platform_post_url: "",
  manual_published_url: "",
  studio_state: "Manual Action Required",
  manual_fallback_required: true,
};

test("Manual_Fallback Instagram opens meta URL entry", () => {
  assert.equal(metaCompleteEligibility(nycArchIg), null);
  assert.equal(metaNeedsUrlEntry(nycArchIg), true);
  assert.equal(isMetaPostUrl("https://www.instagram.com/p/ABC123/", "Instagram"), true);
  assert.equal(isMetaPostUrl("https://www.facebook.com/x/posts/1", "Facebook"), true);
  assert.equal(isMetaPostUrl("https://www.tiktok.com/@x/video/1", "Instagram"), false);
});

test("meta complete rejects already-published and non-meta", () => {
  assert.equal(metaCompleteEligibility({ ...nycArchIg, platform: "TikTok" }), "not_meta");
  assert.equal(metaCompleteEligibility({ ...nycArchIg, do_not_publish: true }), "do_not_publish");
  assert.equal(metaCompleteEligibility({
    ...nycArchIg,
    publish_status: "Published",
    manual_fallback_required: false,
    studio_state: "Published",
  }), "already_published");
  assert.equal(metaCompleteEligibility({
    ...nycArchIg,
    platform_post_url: "https://www.instagram.com/p/live/",
  }), "already_published");
  assert.equal(metaCompleteEligibility({
    ...nycArchIg,
    manual_fallback_required: false,
    studio_state: "Scheduled",
    publish_status: "Scheduled",
  }), "manual_completion_not_required");
});

test("metaManualPublishFields clears Manual_Fallback_Required", () => {
  const fields = metaManualPublishFields({
    url: "https://www.instagram.com/p/ABC123/",
    now: "2026-11-13T12:00:00.000Z",
    platform: "Instagram",
  });
  assert.equal(fields.Manual_Fallback_Required, false);
  assert.equal(fields.Publish_Status, "Published");
  assert.equal(fields.Platform_Post_URL, "https://www.instagram.com/p/ABC123/");
  assert.equal(fields.Publish_Error_Message, "");
});

test("Worker wires /meta-complete and UI surfaces Instagram URL paste", () => {
  assert.match(worker04, /export async function markStudioMetaComplete/);
  assert.match(worker04, /studioReadOutputRecordForManualComplete/);
  assert.match(worker04, /Manual_Fallback_Required:\s*false/);
  assert.match(workerJs, /isOutputMetaCompleteWrite/);
  assert.match(workerJs, /markStudioMetaComplete/);
  assert.match(workerJs, /\/meta-complete\$/);
  assert.match(html, /id="creativeMetaComplete"/);
  assert.match(app, /function metaNeedsUrlEntry/);
  assert.match(app, /manual_fallback_required === true/);
  assert.match(app, /\/meta-complete/);
  assert.match(app, /renderCreativeMetaComplete/);
  assert.match(app, /pipelineMetaCompleteCell/);
  assert.match(app, /Manual fallback/);
});
