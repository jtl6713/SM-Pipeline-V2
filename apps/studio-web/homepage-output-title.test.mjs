import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

function pipelineOutputListTitle(record) {
  const id = String(record?.output_id || "").trim();
  const title = String(record?.output_title || record?.content_title || "").trim();
  const idLabel = id ? `Output ${id}` : "Output";
  return title ? `${idLabel} · ${title}` : idLabel;
}

test("homepage output list helper keeps the ID and adds the title", () => {
  assert.equal(
    pipelineOutputListTitle({ output_id: "439", output_title: "Riverwalk at dusk" }),
    "Output 439 · Riverwalk at dusk"
  );
  assert.equal(
    pipelineOutputListTitle({ output_id: "440", content_title: "Lakefront sunrise" }),
    "Output 440 · Lakefront sunrise"
  );
  assert.equal(pipelineOutputListTitle({ output_id: "441" }), "Output 441");
});

test("live Studio JS renders output title in the recent-outputs list", () => {
  assert.match(app, /function pipelineOutputListTitle\(/);
  assert.match(app, /title-cell">\$\{escapeHtml\(pipelineOutputListTitle\(r\)\)\}/);
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  assert.ok(build);
  assert.match(html, new RegExp(`app-item4-0625\\.js\\?v=${build.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
});

test("creative editor heading shows platform, output number, and title with bullets", () => {
  assert.match(app, /function creativeEditorOutputHeading\(output = \{\}\)/);
  assert.match(app, /output\?\.output_title \|\| output\?\.content_title/);
  assert.match(app, /return parts\.join\(" • "\)/);
  assert.match(app, /creativeEditorTitle"\)\.textContent = creativeEditorOutputHeading\(output\)/);
});

test("opening a platform output jumps immediately to the top of the page", () => {
  const openEditor = app.match(/async function openCreativeEditor\(recordId\) \{[\s\S]*?const data = await api/);
  assert.ok(openEditor, "openCreativeEditor should be present");
  assert.match(openEditor[0], /creativeEditorPanel"\)\.hidden = false;\s*window\.scrollTo\(0, 0\);/);
  assert.doesNotMatch(app, /creativeEditorPanel"\)\.scrollIntoView\(\{ behavior: "smooth"/);
});


test("pipeline output puts Download Cover on a new line when Open post is present", () => {
  assert.match(app, /const coverDownloadUrl = phase6ThumbnailDownloadUrl\(r\)/);
  assert.match(app, /pipeline-cover-download/);
  assert.match(app, /pipeline-post-action-links/);
  assert.match(app, /postLink && coverLink \? "<br>" : ""/);
  assert.match(app, /\$\{actionLinks\}<\/td>/);
});


test("production media supports drag-and-drop reorder with persisted asset_ids", () => {
  assert.match(app, /draggable="true"/);
  assert.match(app, /data-item4-drag-handle/);
  assert.match(app, /function bindItem4AssetDragReorder\(host, sortedAssets\)/);
  assert.match(app, /addEventListener\("dragstart"/);
  assert.match(app, /addEventListener\("drop"/);
  assert.match(app, /addEventListener\("pointerdown"/);
  assert.match(app, /moveItem4AssetTo\(draggedId, targetIndex\)/);
  assert.match(app, /body: JSON\.stringify\(\{ asset_ids: ordered\.map\(\(asset\) => asset\.id\) \}\)/);
});


test("Production library never auto-checks new recommendations after entry", () => {
  assert.match(app, /item4LibrarySelected = new Set\(item4AttachedMediaIds\(\)\)/);
  assert.match(app, /Once an idea is in Production, the attached asset set is authoritative/);
  assert.match(app, /seedLibrarySelection\([\s\S]*?item4AttachedMediaIds\(\)[\s\S]*?false\s*\)/);
});


test("Production source ordering is drag-only with no arrow controls", () => {
  assert.match(app, /data-item4-drag-handle/);
  assert.match(app, /function bindItem4AssetDragReorder\(host, sortedAssets\)/);
  assert.doesNotMatch(app, /data-item4-reorder=/);
  assert.doesNotMatch(app, /aria-label="Move earlier"/);
  assert.doesNotMatch(app, /aria-label="Move later"/);
});

test("Production shows a live narration duration estimate", () => {
  assert.match(app, /function narrationEstimateSeconds\(text\)/);
  assert.match(app, /Math\.round\(\(words \/ 150\) \* 60\)/);
  assert.match(app, /function syncProductionNarrationEstimate\(\)/);
  assert.match(app, /prRequestedScript/);
  assert.match(app, /prNarrationEstimate/);
});


test("Production manual output matrix stays authoritative over plan recommendations", () => {
  assert.match(app, /function productionOutputSelectionKeys\(\)/);
  assert.match(app, /function restoreProductionOutputSelection\(keys\)/);
  assert.match(app, /const manualOutputSelection = productionOutputMatrixLoaded \? productionOutputSelectionKeys\(\) : \[\]/);
  assert.match(app, /restoreProductionOutputSelection\(manualOutputSelection\)/);
  assert.match(app, /await saveProductionRequestOutputs\(activeProductionRequest\)/);
  assert.doesNotMatch(app, /applyDefaultOutputsForPlatform\(input\.value, \{ replace: true \}\)/);
});

test("Rendered still-source video outputs classify as Photo Set instead of Carousel", () => {
  assert.match(app, /function productionOutputSelectionIsVideoPhotoSet\(\)/);
  assert.match(app, /nativeStillTypes = new Set\(\["Single Image", "Carousel", "Multi-Image Post", "Multi-Photo", "Single Photo"\]\)/);
  assert.match(app, /renderedVideoTypes = new Set\(\["Reel", "Story", "Video Draft", "Short", "Slideshow Reel", "Slideshow Video"\]\)/);
  assert.match(app, /const next = "Photo Set"/);
});


test("Home dashboard exposes only actionable counts and filtered destinations", () => {
  assert.match(app, /label: "Manual Action Required".*filter: "manual"/s);
  assert.match(app, /label: "Failed".*filter: "failed"/s);
  assert.match(app, /label: "Awaiting Approval".*filter: "approval"/s);
  assert.match(app, /label: "Ideas Not Yet in Production".*page: "ideas"/s);
  assert.doesNotMatch(app, /label: "Platform outputs"/);
  assert.doesNotMatch(app, /label: "Active outputs"/);
  assert.doesNotMatch(app, /label: "Published"/);
  assert.match(app, /if \(filter === "manual"\) return state === "Manual Action Required"/);
  assert.match(app, /if \(filter === "failed"\) return state === "Failed"/);
  assert.match(app, /if \(filter === "approval"\) return creativeCanApproveForPublishing\(record\) && !pipelineRecordIsAzAutoQueue\(record\)/);
  assert.match(app, /const awaitingApprovalCount = outputs\.filter\(\(record\) => pipelineRecordMatchesFilter\(record, "approval"\)\)\.length/);
  assert.doesNotMatch(app, /filter === "approval"[^\n]*review_status[^\n]*Pending/);
});

test("Home metric cards use count tones and poll every few seconds", () => {
  assert.match(app, /function dashboardCardTone\(view, number\)/);
  assert.match(app, /if \(view === "manual" \|\| view === "failed"\)/);
  assert.match(app, /if \(count <= 2\) return "warn"/);
  assert.match(app, /if \(view === "approval"\)/);
  assert.match(app, /if \(count <= 5\) return "warn"/);
  assert.match(app, /if \(view === "ideas"\)/);
  assert.match(app, /if \(count <= 4\) return "warn"/);
  assert.match(app, /metric-tone-\$\{escapeHtml\(tone\)\}/);
  assert.match(app, /const DASHBOARD_POLL_MS = 5000/);
  assert.match(app, /function scheduleDashboardPoll\(/);
  assert.match(app, /function ensureDashboardPoll\(/);
  assert.match(app, /Promise\.resolve\(tick\)\.finally\(scheduleDashboardPoll\)/);
  assert.match(app, /const tick = dashboardInflight \? Promise\.resolve\(\) : loadDashboard\(true\)/);
  const css = fs.readFileSync(path.join(here, "assets", "styles-phase7-0621.css"), "utf8");
  assert.match(css, /\.metric-button\.metric-tone-ok/);
  assert.match(css, /\.metric-button\.metric-tone-warn/);
  assert.match(css, /\.metric-button\.metric-tone-critical/);
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  assert.ok(build);
  assert.match(html, new RegExp(`app-item4-0625\\.js\\?v=${build.replace(/[.*+?^${}()|[\\]\\^]/g, "\\$&")}`));
  assert.match(html, /styles-phase7-0621\.css\?v=0\.6\.439-home-card-live-poll/);
});


test("idea photo matching tolerates slow server work without surfacing signal timed out", () => {
  assert.match(app, /match-photos[\s\S]*timeoutMs: 120000/);
  assert.match(app, /if \(isTimeoutError\(error\)\)/);
  assert.match(app, /Listening is still active; Studio will keep checking automatically/);
});
