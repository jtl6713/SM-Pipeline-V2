import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
function extract(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing UI helper: ${from}`);
  return source.slice(start, end);
}
const logic = extract("  function item4MasterReadyCount(", "  function item4ClipCountsFromStatus(") +
  extract("  function item4MasterProgressMarkup(", "  function updateItem4MasterProgress(");
function statusFor(confirmed, total = 4, state = "Uploading", uploading = false) {
  const context = vm.createContext({
    item4Uploading: uploading, item4UploadBatchTotal: total,
    item4UploadBatchDone: confirmed, ezStagedFiles: [],
    vibeUploadProgressMarkup: () => null,
    item4WorkspaceCompressionFailed: () => false,
    item4WorkspaceNeedsCompression: () => false,
    item4WaitingForClips: () => false,
    item4IsVideoUploadMode: () => false,
    ezIsClipRequest: () => false,
    item4ClipCountsFromStatus: status => ({ photos: status.assets.length, clips: 0 }),
    item4MediaCountPhrase: counts => `${counts.photos} photos`,
  });
  vm.runInContext(logic, context);
  const assets = Array.from({ length: total }, (_, index) => ({
    id: `asset-${index + 1}`,
    google_drive_file_id: index < confirmed ? `drive-${index + 1}` : "",
    media_asset_record_id: index < confirmed ? `media-${index + 1}` : "",
  }));
  return context.item4MasterProgressMarkup({ assets, assets_status: state });
}

test("four confirmed Drive/media records never say saved so far or imply further copying", () => {
  const rendered = statusFor(4);
  assert.equal(rendered.heal, "reconciling");
  assert.equal(rendered.action, "recheck");
  assert.equal(rendered.count, "4 of 4 saved");
  assert.match(rendered.body, /4 of 4 assets have Google Drive and media IDs/);
  assert.doesNotMatch(JSON.stringify(rendered), /saved so far|copies finish in the background/i);
});
test("incomplete Drive/media confirmation shows separate progress and recheck action", () => {
  const rendered = statusFor(3);
  assert.equal(rendered.heal, "uploading");
  assert.equal(rendered.action, "recheck");
  assert.equal(rendered.count, "3 of 4 Google Drive records confirmed.");
});
test("backend Ready remains success and does not require a redundant recheck", () => {
  const rendered = statusFor(4, 4, "Ready");
  assert.equal(rendered.heal, "ready");
  assert.equal(rendered.action, undefined);
});
test("backend Error is not disguised as progress even if all four uploads are saved", () => {
  const rendered = statusFor(4, 4, "Error");
  assert.equal(rendered.heal, "error");
  assert.equal(rendered.action, "recheck");
  assert.match(rendered.body, /preparation error/);
});
test("a truly active upload remains uploading rather than falsely reported as reconciled", () => {
  const rendered = statusFor(4, 4, "Uploading", true);
  assert.equal(rendered.heal, "uploading");
  assert.equal(rendered.action, undefined);
  assert.doesNotMatch(rendered.count, /saved so far/);
});
test("recheck control refreshes saved state and downstream preflight without publishing", () => {
  const handler = extract("  function updateItem4MasterProgress(", "  function mergeItem4WorkspaceStatus(");
  assert.match(handler, /data-item4-recheck/);
  assert.match(handler, /loadItem4Workspace\(activeProductionRequest/);
  assert.match(handler, /loadItem4BridgePreflight\(activeProductionRequest\)/);
  assert.doesNotMatch(handler, /\/api\/outputs|publish|approve\(/i);
});
