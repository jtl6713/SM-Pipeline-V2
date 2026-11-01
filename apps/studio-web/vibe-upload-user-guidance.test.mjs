import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

function between(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing Vibe guidance section: ${start}`);
  return app.slice(from, to);
}

function statusFns({ phase = "processing", detail = "Studio is compressing video. Keep this tab open." } = {}) {
  const snippets = [
    between("function vibeCutServerUploadComplete(", "function vibeUploadProgressMarkup("),
    between("function vibeUploadProgressMarkup(", "function renderVibeUploadUi("),
  ].join("\n");
  return vm.runInNewContext(
    `(() => { ${snippets}; return { vibeCutServerUploadComplete, vibeCutServerPreparationDetail, vibeUploadProgressMarkup }; })()`,
    {
      ezIsVibeCut: () => true,
      item4Workspace: {},
      vibeCutPersistedSource: status => (status?.assets || [])[0] || null,
      vibeCutReadySource: status => status?.assets_status === "Ready"
        && status?.assets?.[0]?.compression_status === "ready" ? status.assets[0] : null,
      vibeUploadUi: { phase, detail, fileName: "clip.mov", pct: 50, sizeBytes: 500000000 },
      vibeUploadFileSizeLabel: () => "500 MB",
      item4CompressionProgressLabel: () => "Old compression toast",
      item4WorkspaceCompressionFailed: status =>
        (status?.assets || []).some(asset => asset.compression_status === "failed"),
    },
  );
}

const saved = {
  id: "server-video",
  name: "clip.mov",
  upload_status: "complete",
  uploaded_at: "2026-11-01T20:00:00Z",
  compression_status: "compressing",
  compression_progress: 42,
};

test("confirmed Vibe upload tells the user what is happening, whether they may leave, and where to return", () => {
  const { vibeUploadProgressMarkup } = statusFns();
  const state = vibeUploadProgressMarkup({ assets_status: "Processing", assets: [saved] });
  assert.match(state.title, /Upload complete/);
  assert.match(state.count, /1 of 1 uploaded.*0 ready/);
  assert.match(state.body, /42%/);
  assert.match(state.body, /working copy and preview/);
  assert.match(state.body, /You can leave this screen/);
  assert.match(state.body, /Production → Drafts/);
  assert.doesNotMatch(state.body, /Keep this tab open/);
});

test("persisted source outranks stale transfer status including a stalled notice", () => {
  const { vibeUploadProgressMarkup } = statusFns({ phase: "stalled", detail: "No segment progress was confirmed." });
  const state = vibeUploadProgressMarkup({ assets_status: "Processing", assets: [saved] });
  assert.match(state.title, /Upload complete/);
  assert.doesNotMatch(state.body, /No segment progress/);
});

test("incomplete multipart upload never says safe to leave", () => {
  const { vibeUploadProgressMarkup } = statusFns({ phase: "uploading", detail: "2 of 10 segments uploaded." });
  const state = vibeUploadProgressMarkup({
    assets_status: "Uploading",
    assets: [{ ...saved, upload_status: "multipart_pending", uploaded_at: null }],
  });
  assert.match(state.title, /Uploading/);
  assert.doesNotMatch(state.body, /You can leave/);
  assert.match(state.count, /1 uploading/);
});

test("the server Ready state replaces stale compression messaging with the next action", () => {
  const { vibeUploadProgressMarkup } = statusFns();
  const state = vibeUploadProgressMarkup({
    assets_status: "Ready",
    assets: [{ ...saved, compression_status: "ready", compression_progress: 100 }],
  });
  assert.match(state.title, /ready/);
  assert.match(state.count, /1 of 1 ready/);
  assert.match(state.body, /Save Video & Continue/);
  assert.doesNotMatch(state.body, /compressing/);
});

test("server preparation failure is explicit and does not masquerade as readiness", () => {
  const { vibeUploadProgressMarkup } = statusFns();
  const state = vibeUploadProgressMarkup({
    assets_status: "Error",
    assets: [{ ...saved, compression_status: "failed", compression_error: "Preview failed" }],
  });
  assert.equal(state.heal, "error");
  assert.match(state.body, /Preview failed/);
  assert.doesNotMatch(state.body, /You can leave/);
});

test("only a verified Ready source unlocks Vibe continuation; old compression toast is cleared", () => {
  const handler = between("function renderVibeCutCommitAction(", "function ezPersistedKindCounts(");
  assert.match(handler, /vibeCutReadySource\(status\)/);
  assert.match(handler, /wizard\.hidden = !source \|\| !editable/);
  assert.match(handler, /wizard\.disabled = !source \|\| !editable/);
  assert.match(handler, /setEzMessage\("", ""\)/);
  const poll = between("async function pollItem4MasterAssets(", "function startItem4MasterPolling(");
  assert.match(poll, /if \(ezIsVibeCut\(\)\) setEzMessage\("", ""\)/);
  assert.match(poll, /if \(ezIsVibeCut\(\)\) setEzMessage\("Source video is ready/);
});
