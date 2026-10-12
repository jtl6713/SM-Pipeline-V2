import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const config = fs.readFileSync(path.join(here, "assets", "config-0621.js"), "utf8");
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");

test("idea promote drawer documents duration vs voiceover precedence", () => {
  assert.match(html, /id="promoteTimingHint"/);
  assert.match(html, /id="promoteVideoDuration"/);
  assert.doesNotMatch(html, /id="promoteVoiceoverTail"/);
  const uiBuild = html.match(/UI build (0\.6\.\d+)/)?.[1];
  const scriptBuild = html.match(/app-item4-1008\.js\?v=([^"]+)/)?.[1];
  const appBuild = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  assert.ok(uiBuild);
  assert.ok(scriptBuild);
  assert.ok(appBuild);
  assert.equal(appBuild, scriptBuild);
  assert.equal(uiBuild, "0.6.654");
  assert.match(html, /id="ideaLibraryPickerForm"/);
  assert.match(html, /class="idea-type-guide"/);
  assert.match(html, /Photo Set turns stills into Reels|Photo Set/);
  assert.match(html, />Vertical Short Video</);
  assert.match(html, />Carousel</);
  assert.match(html, /recorded voiceover sets each slide and the total length/);
  assert.match(config, /promoteVoiceoverTail: "Unused\. Photo reels follow the recorded voiceover/);
  assert.match(config, /promoteVideoDuration: "Finished length for clip videos/);
  assert.match(config, /prVoiceoverDuration: "Planning note for clip videos/);
  assert.match(config, /Help → Ideas has a graphic/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.\d+[^"]*"/);
  assert.match(app, /function syncPromoteTimingHint/);
  assert.match(app, /library_asset_ids/);
  assert.match(app, /restoreIdeaLibraryPickerAfterDrawerUpdate/);
});

test("production request heading includes numeric Content ID beside title", () => {
  assert.match(app, /function contentNumberForProductionRequest/);
  assert.match(app, /function productionRequestHeading/);
  assert.match(app, /Content \${contentNumber}/);
  assert.match(app, /productionRequestTitle"\)\.textContent = productionRequestHeading\(record\)/);
});

test("variant not-ready copy distinguishes not started from preparing", () => {
  assert.match(app, /function item4VariantNotReadyCopy/);
  assert.match(app, /Platform crops have not been run yet/);
  assert.match(app, /Platform crops are still finishing/);
});

test("Music Manager uses native file labels for Windows file picker", () => {
  assert.match(html, /id="musicChooseFiles"[^>]*native-file-label/);
  assert.match(html, /id="musicFileInput"[^>]*native-file-input/);
  assert.match(html, /id="musicAddButton"[^>]*native-file-label/);
  assert.match(html, /id="musicAddInput"[^>]*native-file-input/);
  assert.match(app, /function musicFileInputs/);
  assert.doesNotMatch(app, /choose\?\.addEventListener\("click", openPicker\)/);
});

test("All Profiles Ideas count opens the Ideas page", () => {
  const overview = fs.readFileSync(path.join(here, "assets", "all-profiles-overview-1007.js"), "utf8");
  const ideasBranch = overview.slice(overview.indexOf('if (kind === "ideas")'), overview.indexOf('const nav = document.querySelector'));
  assert.match(ideasBranch, /\[data-page="ideas"\]/);
  assert.match(ideasBranch, /activateStudioPage\("ideas"\)/);
  assert.match(ideasBranch, /return;/);
  assert.doesNotMatch(ideasBranch, /outputs/);
});

test("Approved Ideas reopen linked Production Requests, not regenerate voiceovers", () => {
  const row = app.slice(app.indexOf("function ideaRowHtml("), app.indexOf("function partitionIdeaRecords"));
  assert.match(row, /ideaTimelineRowButtonLabel\(r\)/);
  const handler = app.slice(
    app.indexOf('target.querySelectorAll("[data-idea-timeline]")'),
    app.indexOf('target.querySelectorAll("[data-idea-id]")'),
  );
  assert.match(handler, /event\.preventDefault\(\)/);
  assert.match(handler, /openOrCreateIdeaTimeline\(idea/);
  assert.doesNotMatch(handler, /background:\s*true/);
  const opener = app.slice(app.indexOf("async function openOrCreateIdeaTimeline("), app.indexOf('$("createIdeaTimelineButton")?.addEventListener'));
  assert.match(opener, /knownIds/);
  assert.match(opener, /Promise\.allSettled\(knownIds\.map/);
  assert.match(opener, /selectIdeaProductionRequest/);
  assert.match(opener, /openProductionRequestForIdea\(idea/);
  assert.match(opener, /strict: true/);
  assert.match(opener, /await createIdeaTimedScript\(idea/);
  assert.match(html, /id="backToProductionList"/);
  assert.match(app, /function leaveProductionWorkspace/);
});

test("Ideas shows Current expanded and Archived collapsed by default", () => {
  assert.match(app, /let ideasCurrentSectionOpen = true/);
  assert.match(app, /let ideasArchivedSectionOpen = false/);
  assert.match(app, /title: "Current ideas"/);
  assert.match(app, /title: "Archived"/);
  assert.match(app, /data-idea-section-toggle/);
  assert.match(app, /not in production/);
  assert.match(app, /already in production/);
});

test("Ideas archives promoted items in the Archived section", () => {
  assert.match(app, /let ideasArchivedSectionOpen = false/);
  assert.match(app, /function partitionIdeaRecords/);
  assert.match(app, /if \(ideaIsPromoted\(record\)\) archived\.push\(record\)/);
  assert.match(app, /key: "archived"/);
  assert.match(app, /already in production/);
});

test("Pipeline group headers include linked Content ID and title", () => {
  assert.match(app, /let pipelineContentRecords = \[\]/);
  assert.match(app, /function pipelineContentRecordForGroup/);
  assert.match(app, /Content \${contentNumber}/);
  assert.match(app, /api\("\/api\/content\?limit=100"\)/);
});

test("Pipeline archives fully published content items at the bottom", () => {
  assert.match(app, /function pipelineContentGroupFullyPublished/);
  assert.match(app, /renderPipelineArchivedSection/);
  assert.match(app, /pipelineArchivedSectionOpen/);
  assert.match(app, /Archived<\/span>/);
});

test("Vertical Short Video defaults Instagram and Facebook to Reel plus Story", () => {
  assert.match(app, /"Vertical Short Video": \{Instagram:"Reel", Facebook:"Reel"/);
  assert.match(app, /verticalShort && \["Instagram", "Facebook"\]\.includes\(platform\) && primary === "Reel"/);
  assert.match(app, /defaults\.push\("Story"\)/);
  // Existing configure-mode requests must not wipe saved destinations on platform toggle.
  assert.match(app, /applyDefaultOutputsForPlatform\(input\.value\);/);
  assert.doesNotMatch(app, /applyDefaultOutputsForPlatform\(input\.value, \{ replace: true \}\)/);
});

test("review audio defaults use sixty percent of the previous mix", () => {
  assert.match(html, /id="creativeMusicNormal"[^>]+value="60"/);
  assert.match(html, /id="creativeMusicDucked"[^>]+value="5\.04"/);
  assert.match(app, /phase6Percent\(output\.music\?\.normal_volume, 60\)/);
  assert.match(app, /phase6Percent\(output\.music\?\.ducked_volume, 5\.04\)/);
});

test("Manage Idea attaches both library photos and clips", () => {
  assert.match(html, /id="configureProductionButton">Add new media</);
  assert.match(html, /Search library photos and clips/);
  assert.match(app, /params\.set\("include", "video"\)/);
  assert.match(app, /allow_video: true/);
  assert.match(app, /origin_kind: "photos-and-clips"/);
});
