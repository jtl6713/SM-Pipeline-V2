import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("./assets/story-first-workspace.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../studio-api/worker.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../studio-api/worker-functions-03.mjs", import.meta.url), "utf8");

test("Script a Short retains image and uploaded-media choices while adding opt-in AI video", () => {
  assert.match(ui, /Generate this AI image/);
  assert.match(ui, /Generate AI Image or Video/);
  assert.match(ui, /Review Video Cost & Generate/);
  assert.match(ui, /4 seconds/);
  assert.match(ui, /6 seconds/);
  assert.match(ui, /8 seconds/);
  assert.match(ui, /9:16 Vertical/);
  assert.match(ui, /16:9 Horizontal/);
  assert.match(ui, /Check Existing Video Job/);
  assert.match(ui, /Choose Existing Asset/);
  assert.match(ui, /I.ll Supply the Media/);
});

test("paid video requires a reviewed quote and direct human authorization", () => {
  assert.match(ui, /sceneUrl\(index, "video\/quote"\)/);
  assert.match(ui, /estimated_credits/);
  assert.match(ui, /confirm\("Generate one "/);
  assert.match(ui, /approve_paid_generation: true/);
  assert.match(server, /requireStoryVideoPaidApproval\(quote, body\)/);
  assert.match(server, /state: "submitting"/);
  assert.match(server, /writeJob\(job, prior\.etag\)/);
  assert.match(server, /submission_uncertain/);
});

test("Worker admits scene video endpoints, not autonomous publishing", () => {
  assert.ok(worker.includes("video\\/(?:quote|start|status|preview|accept|decline)"));
  assert.match(server, /storyVideoJobKey\(ideaId, sceneNumber\)/);
  assert.match(server, /Video is not ready for explicit acceptance/);
  assert.match(server, /studioProfileRequiresChicagoWatermark\(profile\)/);
  assert.match(server, /Rights_Status: "Licensed"/);
  assert.match(server, /state: "media_approved"/);
  assert.match(server, /A paid AI video is active or pending review/);
});

test("review preview and status are visible before Asset Manager registration", () => {
  assert.match(ui, /preview\.controls = true/);
  assert.match(ui, /Accept Video/);
  assert.match(ui, /Decline Video/);
  assert.match(server, /Content-Type": "video\/mp4"/);
  assert.match(server, /promoteStudioAssetToDrive/);
  assert.match(server, /AIRTABLE_MEDIA_TABLE_ID/);
  assert.match(html, /Generated AI images and video clips are reviewed inline/);
});
