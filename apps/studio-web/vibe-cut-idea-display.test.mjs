import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = path.dirname(fileURLToPath(import.meta.url));
const app = readFileSync(path.join(base, "assets/app-item4-1008.js"), "utf8");
const ez = readFileSync(path.join(base, "assets/ez-plan.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(ez, sandbox);
const plan = sandbox.window.ChicagoShiningEzPlan;

function displayStructure(record) {
  const start = app.indexOf("function ideaIsVibeVideo(");
  const end = app.indexOf("function ideaPhotoWaitActive(", start);
  const structureStart = app.indexOf("function ideaStructureLabel(");
  const structureEnd = app.indexOf("function ideaProductionLabel(", structureStart);
  assert.ok(start >= 0 && end > start && structureStart >= 0 && structureEnd > structureStart);
  return vm.runInNewContext(
    app.slice(start, end) + "\n" + app.slice(structureStart, structureEnd) + "\nideaStructureLabel(record);",
    { record },
  );
}

test("Vibe Cut counts zero photos but requires exactly one VIDEO upload", () => {
  assert.equal(plan.ezWizardPhotoCount({ inputKind: "vibe-cut", photoCount: 8 }), 0);
  assert.equal(plan.ezWizardExpectedUploads({ inputKind: "vibe-cut", photoWait: true }), 1);
  assert.equal(plan.ezWizardRequiresUploads({ inputKind: "vibe-cut" }), true);
  assert.equal(plan.ezWizardPhotoCount({ inputKind: "multiple-photos", photoCount: 5 }), 5);
});

test("vertical Vibe plan routes to all six video/story outputs", () => {
  const output = plan.ezWizardResolvePackage({
    inputKind: "vibe-cut", sourceAspect: "vertical", sourceVideoWidth: 1552, sourceVideoHeight: 2064,
  });
  assert.equal(output.master_content_type, "Vertical Short Video");
  const keys = [...new Set([...output.items.map(row => row.platform + "::" + row.output_type), ...output.extras])];
  assert.equal(new Set(keys).size, 6);
  assert.deepEqual([...keys].sort(), [
    "Instagram::Reel", "Instagram::Story", "Facebook::Reel",
    "Facebook::Story", "TikTok::Video Draft", "YouTube::Short",
  ].sort());
  assert.ok(!keys.some(key => /Carousel|Photo|Multi-Image/.test(key)));
});

test("horizontal Vibe plan routes to Longform and both YouTube outputs", () => {
  const output = plan.ezWizardResolvePackage({
    inputKind: "vibe-cut", sourceVideoWidth: 1920, sourceVideoHeight: 1080,
  });
  assert.equal(output.master_content_type, "Longform Video");
  assert.deepEqual([...new Set([...output.items.map(x => x.platform + "::" + x.output_type), ...output.extras])].sort(),
    ["YouTube::Standard Video", "YouTube::Short"].sort());
});

test("legacy video with stale Target range never renders ?-? photos", () => {
  const record = {
    content_type: "Vertical Short Video", carousel_slide_count_mode: "Target range",
    carousel_slide_count_min: null, carousel_slide_count_max: null,
    photo_wait_status: "Waiting", summary: "origin=ez-button; ez-input=vibe-cut",
    video_duration: 15,
  };
  const label = displayStructure(record);
  assert.match(label, /1 source video/);
  assert.match(label, /15-second Vibe Cut/);
  assert.doesNotMatch(label, /photos|Carousel|Photo Set|\?/);
});

test("legitimate photo carousels keep good ranges, missing ranges show neutral state", () => {
  const image = { content_type: "Carousel", carousel_slide_count_mode: "Target range", photo_wait_status: "Not Needed" };
  assert.equal(displayStructure({ ...image, carousel_slide_count_min: 5, carousel_slide_count_max: 8 }), "5–8 photos");
  assert.equal(displayStructure({ ...image, carousel_slide_count_min: null, carousel_slide_count_max: null }), "Photo count not set");
  assert.equal(displayStructure({ ...image, photo_wait_status: "Waiting", carousel_slide_count_min: 5 }), "0 / 5 photos");
});

test("creation sends exact source aspect, profile, and video configuration", () => {
  assert.match(app, /input_kind: pending\?\.inputKind \|\| ezIntakeKind/);
  assert.match(app, /source_video_width: aspectBundle\?\.width/);
  assert.match(app, /source_video_height: aspectBundle\?\.height/);
  assert.match(app, /content_profile_id: selectedProfileId/);
  assert.match(app, /Vibe Cut requires one source video/);
  assert.match(app, /function ideaIsVideoWorkflow/);
  assert.match(app, /!ideaIsVideoWorkflow\(r\) &&/);
  assert.match(app, /ideaIsVideoWorkflow\(idea\) \?/);
  assert.match(app, /location_change_confirmed: Boolean\(primaryLocationUserEdited\)/);
});
