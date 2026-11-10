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
  assert.match(ui, /\[4,6,8\]/);
  assert.match(ui, /Array\.from\(\{length:27\}/);
  assert.match(ui, /bytedance-seedance-v2\.5/);
  assert.match(ui, /veo-3\.1-generate-001/);
  assert.match(ui, /Generated audio/);
  assert.match(ui, /Reference image/);
  assert.match(ui, /Reference video/);
  assert.match(ui, /Reference audio/);
  assert.match(ui, /browseSceneVideoReferences/);
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


test("video quote locks synchronously and reports status by its own button", () => {
  const start = ui.slice(ui.indexOf("async function generateSceneVideo(index)"),
    ui.indexOf("async function decideSceneVideo(index"));
  assert.ok(start.includes("current.videoRequestBusy = true;"));
  assert.ok(start.indexOf("current.videoRequestBusy = true;") < start.indexOf("await save();"),
    "must lock before save and before the quote's network call");
  assert.match(start, /if \(current\.busy \|\| current\.videoRequestBusy \|\|/);
  assert.match(start, /paidPostStarted = true;/);
  assert.match(start, /paidReceiptReceived = true;/);
  assert.match(start, /current\.videoSubmissionUncertain\[videoSceneIdentity\(index\)\] = true;/);
  assert.match(ui, /generateButton\.disabled = current\.videoRequestBusy \|\| uncertain;/);
  assert.match(ui, /videoProgress\.setAttribute\("aria-live","polite"\);/);
  assert.match(ui, /videoProgress\.id = "storyFirstVideoProgress-" \+ index;/);
  assert.match(ui, /\[data-story-video-generate\]/);
  assert.match(start, /await checkSceneVideo\(index, true\);/);
  assert.match(ui, /Paid submission may have reached ElevenLabs/);
});


test("admin reconciliation is exact-scoped, cannot generate, and requires original run receipt", () => {
  assert.match(ui, /Reconcile No-Charge Attempt \(Admin\)/);
  assert.match(ui, /async function reconcileUnbilledVideoAttempt\(index\)/);
  assert.match(ui, /expected_run_id: job\.run_id/);
  assert.match(ui, /no_charge_confirmed:true/);
  assert.match(ui, /provider_post_absent_confirmed:true/);
  assert.match(ui, /no_provider_generation_confirmed:true/);
  assert.match(ui, /result\.paid_generation_submitted !== false/);
  assert.match(server, /requirePermission\(authorization, "tenant_admin"\)/);
  assert.match(server, /videoAction === "reconcile-unbilled"/);
  assert.match(server, /studio\/story-first\/ai-video\/v1\//);
  assert.match(server, /"If-None-Match": "\*"/);
  assert.match(server, /await writeJob\(reviewed\.next, found\.etag\)/);
  const code = ui.slice(ui.indexOf("async function reconcileUnbilledVideoAttempt("),
    ui.indexOf("async function decideSceneVideo("));
  assert.doesNotMatch(code, /generateSceneVideo\(|video\/start|submitStoryVideo\(/);
});


test("Phase 2A method gate and scene handler both recognize POST video/reconcile-unbilled", () => {
  // An admin recovery UI button can otherwise emit 405 before the route runs.
  const gateLine = worker.split("\n").find(line =>
    line.includes("const isStoryFirstSceneMediaRoute ="));
  assert.ok(gateLine, "top-level route allowlist must exist");
  const gateLiteral = gateLine.match(/= (\/\^[^\n]+\$\/)\.test\(url\.pathname\)/);
  assert.ok(gateLiteral, "extract and validate the actual Phase 2A regex");
  const gate = new RegExp(gateLiteral[1].slice(1,-1));
  const handlerSource = server.slice(server.indexOf("export async function storyFirstSceneMediaRoute("));
  const handlerLiteral = handlerSource.match(/const path = (\/\^[^\n]+\$\/)\.exec\(url\.pathname\)/);
  assert.ok(handlerLiteral, "extract and validate the actual scene route regex");
  const handler = new RegExp(handlerLiteral[1].slice(1,-1));

  const expected = [
    "/api/story-first/ideas/recTgiblVhRnCfNuf/scenes/1/video/reconcile-unbilled",
    "/api/story-first/ideas/recTgiblVhRnCfNuf/scenes/1/video/status",
    "/api/story-first/ideas/recTgiblVhRnCfNuf/scenes/1/video/quote",
    "/api/story-first/ideas/recTgiblVhRnCfNuf/scenes/1/video/start",
  ];
  for (const path of expected) {
    assert.ok(gate.test(path), "Phase 2A must accept " + path);
    assert.ok(handler.test(path), "Scene handler must accept " + path);
  }
  for (const path of [
    "/api/story-first/ideas/recTgiblVhRnCfNuf/scenes/0/video/reconcile-unbilled",
    "/api/story-first/ideas/recTgiblVhRnCfNuf/scenes/1/video/reset",
    "/api/story-first/ideas/recTgiblVhRnCfNuf/scenes/1/video/reconcile-unbilled/extra",
  ]) {
    assert.equal(gate.test(path),false);
    assert.equal(handler.test(path),false);
  }
  assert.match(worker, /\(isStoryFirstSceneMediaRoute && request\.method === "POST"\)/,
    "Phase 2A must allow POST for matched media routes");
  assert.match(worker, /if \(isStoryFirstSceneMediaRoute\) \{[\s\S]*?return await storyFirstSceneMediaRoute\(/,
    "matched request must dispatch to scene handler");
  assert.match(handlerSource, /if \(videoAction === "reconcile-unbilled"\) \{\s*if \(request\.method !== "POST"\)[\s\S]*?requirePermission\(authorization, "tenant_admin"\)/,
    "recovery remains admin-only and POST-only");
});
