import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/story-first-workspace.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./assets/story-first-workspace.css", import.meta.url), "utf8");
const start = source.indexOf("  function rankSceneBrowseResults(scene, rows, search)");
const end = source.indexOf("  async function findSceneAssets(", start);
assert.ok(start >= 0 && end > start, "ranked browse helper must be independently testable");

const rank = vm.runInNewContext(
  "(() => {" + source.slice(start, end) + "; return rankSceneBrowseResults; })()",
  { eligibility: (_scene, row) => row.eligible === true },
);

test("typed Riverwalk search ranks title, location, description before opaque tags", () => {
  const scene = { media: "still" };
  const rows = [
    { id: "rec1", name: "Chicago Winters 8", eligible: true },
    { id: "rec2", name: "Chicago Riverwalk Sunset", eligible: true },
    { id: "rec3", name: "Downtown Winter", location: "Riverwalk", eligible: true },
    { id: "rec4", name: "Chicago Skyline", description: "Along the Riverwalk", eligible: true },
    { id: "rec5", name: "Unlicensed Riverwalk", eligible: false },
  ];
  const ranked = rank(scene, rows, "Riverwalk");
  assert.deepEqual(Array.from(ranked, x => x.id), ["rec2", "rec3", "rec4", "rec1"]);
  assert.equal(ranked[0].reason, "Asset name matches search");
  assert.equal(ranked[1].reason, "Location matches search");
  assert.equal(ranked[2].reason, "Description matches search");
  assert.match(ranked[3].reason, /Catalog keyword match/);
});

test("empty browse retains original catalog order and eligibility", () => {
  const rows = [
    { id: "recFirst", eligible: true },
    { id: "recBlocked", eligible: false },
    { id: "recSecond", eligible: true },
  ];
  const ranked = rank({}, rows, "");
  assert.deepEqual(Array.from(ranked, x => x.id), ["recFirst", "recSecond"]);
  assert.match(ranked[0].reason, /manually verify visual/);
});

test("scene preview tries canonical Worker first, Drive thumbnail second and readable final failure", () => {
  assert.match(source, /const proxyPreview=root\+"\/api\/media-assets\//);
  assert.match(source, /img\.src=proxyPreview/);
  assert.match(source, /const thumbnail=hasDriveId\?"https:\/\/drive\.google\.com\/thumbnail/);
  assert.match(source, /img\.addEventListener\("error"/);
  assert.match(source, /attemptedDriveThumbnail=true/);
  assert.match(source, /story-first-preview-unavailable/);
  assert.match(source, /Verify the original in Google Drive before selecting/);
  assert.match(source, /open\.textContent="View original in Drive"/);
  assert.match(css, /#storyFirstPanel \.story-first-preview-warning/);
});

test("manual browse preserves profile, rights and media suitability gates", () => {
  assert.match(source, /rows\.filter\(row => eligibility\(scene, row\)\)/);
  assert.match(source, /return browse \? rankSceneBrowseResults\(scene, result\.records, query\)/);
  assert.match(source, /asset\.content_profile_id !== assertProfile\(\)/);
  assert.match(source, /asset\.rights_status/);
  assert.match(source, /asset\.google_drive_file_id/);
});
