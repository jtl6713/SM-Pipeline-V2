import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");
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

test("live Studio JS keeps pipeline output titles without a Home recent-outputs table", () => {
  assert.match(app, /function pipelineOutputListTitle\(/);
  assert.match(app, /pipelineOutputListTitle\(record\)/);
  assert.doesNotMatch(html, /id="recentOutputs"/);
  assert.doesNotMatch(html, /Recent platform outputs/);
  assert.doesNotMatch(app, /function renderDashboardPanel\(/);
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  assert.ok(build);
  assert.match(html, new RegExp(`app-item4-1008\\.js\\?v=${build.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
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


test("pipeline output keeps Open post and Download Cover in the compact more-actions menu", () => {
  assert.match(app, /const coverDownloadUrl = phase6ThumbnailDownloadUrl\(r\)/);
  assert.match(app, /pipeline-cover-download/);
  assert.match(app, /pipeline-row-more-menu/);
  assert.match(app, /Open post ↗/);
  assert.match(app, /Download cover/);
  assert.match(app, /\$\{moreMenu\}<\/td>/);
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
  assert.match(app, /if \(filter === "approval"\) \{\s*const approvalState = studio === "Ready for Review"/);
  assert.match(app, /const awaitingApprovalCount = outputs\.filter\(\(record\) => pipelineRecordMatchesFilter\(record, "approval"\)\)\.length/);
  assert.doesNotMatch(app, /filter === "approval"[^\n]*review_status[^\n]*Pending/);
  assert.doesNotMatch(app, /if \(filter === "approval"\) return creativeCanApproveForPublishing\(record\) && !pipelineRecordIsAzAutoQueue\(record\)/);
});

test("Home metric cards use count tones and Airtable-safe polling", () => {
  assert.match(app, /function dashboardCardTone\(view, number\)/);
  assert.match(app, /if \(view === "manual" \|\| view === "failed"\)/);
  assert.match(app, /if \(count <= 2\) return "warn"/);
  assert.match(app, /if \(view === "approval"\)/);
  assert.match(app, /if \(count <= 5\) return "warn"/);
  assert.match(app, /if \(view === "ideas"\)/);
  assert.match(app, /if \(count <= 4\) return "warn"/);
  assert.match(app, /metric-tone-\$\{escapeHtml\(tone\)\}/);
  assert.match(app, /const DASHBOARD_POLL_MS = 15000/);
  assert.match(app, /const DASHBOARD_POLL_MAX_MS = 60000/);
  assert.match(app, /let dashboardPollDelayMs = DASHBOARD_POLL_MS/);
  assert.match(app, /function scheduleDashboardPoll\(/);
  assert.match(app, /function ensureDashboardPoll\(/);
  assert.match(app, /Promise\.resolve\(tick\)\.finally\(scheduleDashboardPoll\)/);
  assert.match(app, /const tick = dashboardInflight \? Promise\.resolve\(\) : loadDashboard\(true\)/);
  assert.match(app, /if \(!force && dashboardInflight && dashboardInflightKey === key\)/);
  assert.match(app, /dashboardInflight = run;/);
  assert.doesNotMatch(app, /dashboardInflight = run\.finally/);
  assert.match(app, /api\(`\/api\/outputs\?limit=250&_=\$\{stamp\}`, \{ timeoutMs: 12000, retries: 0 \}/);
  assert.doesNotMatch(app, /Pipeline data is waiting on Airtable/);
  assert.doesNotMatch(html, /id="recentOutputs"/);
  assert.match(app, /showStudioPage\("outputs", \{ pipelineFilter: nextFilter \}\)/);
  assert.match(app, /pipelineOutputs = dashboardCache\.outputs\.slice\(\)/);
  assert.doesNotMatch(app, /await api\("\/api\/dashboard"/);
  assert.match(app, /function scheduledContentByPlatform\(/);
  assert.match(app, /function renderScheduledContentOverview\(/);
  assert.match(app, /const preferred = \["Facebook", "Instagram", "TikTok", "YouTube"\]/);
  assert.match(app, /count: counts\.get\(platform\) \|\| 0/);
  assert.match(html, /<h1>Scheduled content<\/h1>/);
  assert.match(html, /id="studioHubScheduled"/);
  assert.match(html, /id="studioHubLive"/);
  assert.match(html, /studio-hub-hello-head/);
  assert.match(html, /studio-hub-scheduled-platform">YouTube/);
  assert.doesNotMatch(html, /<h1>Overview<\/h1>/);
  const css = fs.readFileSync(path.join(here, "assets", "styles-phase7-0621.css"), "utf8");
  assert.match(css, /\.metric-button\.metric-tone-ok/);
  assert.match(css, /\.metric-button\.metric-tone-warn/);
  assert.match(css, /\.metric-button\.metric-tone-critical/);
  assert.match(css, /\.studio-hub-scheduled/);
  assert.match(css, /\.studio-hub-live/);
  assert.match(css, /\.studio-hub-hello-head/);
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  assert.ok(build);
  const escaped = build.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp(`app-item4-1008\\.js\\?v=${escaped}`));
  assert.match(html, new RegExp(`styles-phase7-0621\\.css\\?v=${escaped}`));
  assert.match(html, new RegExp(`timed-script\\.js\\?v=${escaped}`));
});

test("profile timezone bootstrap avoids a temporal-dead-zone crash", () => {
  const timezone = app.match(/function studioTimezone\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(timezone, "studioTimezone should be present");
  assert.doesNotMatch(timezone, /operationsTimezone/);
  const defaultTimezone = app.indexOf('const STUDIO_DEFAULT_TIMEZONE = "America/Chicago";');
  const hubDateInit = app.indexOf('const hubDate = $("studioHubDate");');
  assert.ok(defaultTimezone >= 0, "the default profile timezone should be declared");
  assert.ok(defaultTimezone < hubDateInit, "default timezone must be initialized before hubDate uses it");
  assert.ok(app.indexOf('const hubDate') < app.indexOf('let operationsTimezone'));
});

test("Home refresh clears inflight instead of wrapping the fetch promise", async () => {
  let dashboardInflight = null;
  const run = Promise.resolve("fresh");
  dashboardInflight = run;
  await run.finally(() => {
    if (dashboardInflight === run) dashboardInflight = null;
  });
  assert.equal(dashboardInflight, null);

  let leaked = null;
  const first = Promise.resolve("stale");
  leaked = first.finally(() => {
    if (leaked === first) leaked = null;
  });
  await leaked;
  assert.notEqual(leaked, null);
});


test("idea photo matching tolerates slow server work without surfacing signal timed out", () => {
  assert.match(app, /match-photos[\s\S]*timeoutMs: 120000/);
  assert.match(app, /if \(isTimeoutError\(error\)\)/);
  assert.match(app, /Listening is still active; Studio will keep checking automatically/);
});
