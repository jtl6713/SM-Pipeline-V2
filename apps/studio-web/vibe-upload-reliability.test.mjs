import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const section = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a) + a.length));

test("iPhone metadata with no browser event settles and releases its media URL", async () => {
  let deadline, revoked = 0, unloaded = 0;
  const video = { removeAttribute() { unloaded++; }, load() {} };
  const context = vm.createContext({
    item4FileLooksLikeVideo: () => true,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => revoked++ },
    document: { createElement: () => video },
    window: { setTimeout: fn => { deadline = fn; return 1; }, clearTimeout() {} },
  });
  vm.runInContext(section("async function imageMetadataForFiles(", "const ITEM4_PHOTO_STAGE_MAX_BYTES"), context);
  const result = context.imageMetadataForFiles([{ name: "large.mov" }]);
  assert.equal(typeof deadline, "function");
  deadline();
  const metadata = await result;
  assert.equal(metadata[0].duration_seconds, null);
  assert.equal(revoked, 1);
  assert.equal(unloaded, 1);
  assert.equal(video.onloadedmetadata, null);
});

function harness({ failPart = 0, loseComplete = false } = {}) {
  const calls = [], progress = [];
  const saved = new Map();
  let existing = null, failed = false, completed = false;
  const context = vm.createContext({
    Map, Uint8Array, AbortController,
    activeProductionRequest: { id: "request-one" },
    vibeUploadAbortController: null,
    ITEM4_FINISHED_VIDEO_HARD_MAX_BYTES: 1.5 * 1024 ** 3,
    ezIsVibeCut: () => true, ezIsAzFinishedPath: () => false,
    imageMetadataForFiles: async () => [{}],
    item4AssetLooksLikeVideo: a => a.media_kind === "video",
    item4WorkspaceNeedsCompression: () => true,
    crypto: { subtle: { digest: async (_, bytes) => bytes } },
    localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) },
    sleepMs: async () => {},
    api: async (path, options = {}) => {
      calls.push({ path, method: options.method || "GET" });
      if (path.includes("snapshot=1")) return { assets: existing ? [existing] : [], assets_status: "Uploading" };
      if (path.endsWith("/upload-session")) {
        existing = { id: "asset-one", name: "large.mov", size_bytes: 580 * 1024 ** 2, media_kind: "video", upload_status: "multipart_pending" };
        return { asset_id: "asset-one", part_size: 16 * 1024 ** 2 };
      }
      if (path.endsWith("/complete")) {
        completed = true;
        existing.upload_status = "complete";
        if (loseComplete) throw new Error("Response lost");
        return { ok: true, assets: [existing], compression_pending: true };
      }
      throw new Error("Unexpected request " + path);
    },
  });
  vm.runInContext(section("const item4UploadCheckpoints =", "function item4ShouldUseLargeFinishedUpload("), context);
  context.item4UploadPartWithProgress = async (path, chunk, { onBytes }) => {
    const part = Number(path.split("/").pop());
    calls.push({ part });
    onBytes(chunk.size / 2);
    if (part === failPart && !failed) { failed = true; throw new Error("Network lost"); }
    return { etag: "etag-" + part };
  };
  const file = { name: "large.mov", size: 580 * 1024 ** 2,
    slice: (start, end) => ({ size: end - start, arrayBuffer: async () => new Uint8Array([start / (16 * 1024 ** 2)]) }) };
  return { context, file, calls, progress, saved, get completed() { return completed; },
    run: () => context.postItem4LargeFinishedVideo(file, { onProgress: p => progress.push(p) }) };
}

test("580 MB upload retries only the failed part and reports progress inside parts", async () => {
  const h = harness({ failPart: 2 });
  await h.run();
  assert.equal(h.completed, true);
  assert.equal(h.calls.filter(c => c.part === 2).length, 2);
  assert.equal(h.calls.filter(c => c.part === 1).length, 1);
  assert.equal(h.calls.filter(c => c.part === 37).length, 1);
  assert.ok(h.progress.some(p => p.sentBytes === 8 * 1024 ** 2));
  assert.equal(h.progress.at(-1).stage, "saving");
  assert.ok(!h.calls.some(c => c.method === "DELETE"));
  assert.equal(h.saved.size, 0);
});

test("lost completion response preserves checkpoint and retry adopts saved video without uploading again", async () => {
  const h = harness({ loseComplete: true });
  await assert.rejects(h.run(), /Response lost/);
  assert.equal(h.saved.size, 1);
  const partCount = h.calls.filter(c => c.part).length;
  const result = await h.run();
  assert.equal(result.assets[0].upload_status, "complete");
  assert.equal(h.calls.filter(c => c.part).length, partCount);
  assert.ok(!h.calls.some(c => c.method === "DELETE"));
});

test("resume hashes retained parts and rejects a different file with identical name and size", async () => {
  const h = harness();
  h.context.item4UploadCheckpoint("request-one", {
    assetId: "asset-one", name: h.file.name, size: h.file.size, partSize: 16 * 1024 ** 2,
    parts: [{ part_number: 1, etag: "old", digest: "wrong" }],
  });
  // Supply the existing server-side session.
  const original = h.context.api;
  h.context.api = (path, options) => path.includes("snapshot=1")
    ? Promise.resolve({ assets: [{ id: "asset-one", media_kind: "video", upload_status: "multipart_pending" }] })
    : original(path, options);
  await assert.rejects(h.run(), /not the same video/);
  assert.ok(!h.calls.some(c => c.part || c.method === "DELETE"));
});

test("a slow upload has an inactivity deadline as well as a total deadline", async () => {
  let idle, request, aborts = 0;
  class Xhr {
    constructor() { this.upload = {}; request = this; }
    open() {}
    setRequestHeader() {}
    send() {}
    abort() { aborts++; this.onabort?.(); }
  }
  const context = vm.createContext({
    XMLHttpRequest: Xhr, apiBase: "", withStudioProfile: p => p,
    window: { setTimeout: fn => { idle = fn; return 1; }, clearTimeout() {} },
  });
  vm.runInContext(section("function item4UploadPartWithProgress(", "async function postItem4LargeFinishedVideo("), context);
  const result = context.item4UploadPartWithProgress("/part", { size: 1024 });
  assert.equal(request.timeout, 300000);
  idle();
  await assert.rejects(result, /stopped responding/);
  assert.equal(aborts, 1);
});

test("processing alone never triggers an upload retry countdown or false Clip saved label", () => {
  const state = section("function setVibeUploadUi(", "function beginVibeUploadFeedback(");
  assert.match(state, /\["creating", "uploading", "saving"\]\.includes/);
  assert.doesNotMatch(state, /\["creating", "uploading", "saving", "processing"\]\.includes/);
  const strip = section("function renderEzPhotoStrip(", "function ensureVoiceOption(");
  assert.doesNotMatch(strip, /"Clip saved"/);
  assert.match(strip, /"Upload not confirmed"/);
});

test("Vibe Cut sends source segments immediately after draft creation instead of loading extra screens first", () => {
  const flow = section("async function startEzProduction(", "function bindEzWizard(");
  const draft = flow.indexOf("const created = await createEzProductionRequest(");
  const upload = flow.indexOf("const uploadResult = await uploadItem4Files(nextFiles");
  const slowReads = flow.indexOf("await loadProductionRequestOutputs(created.record)");
  assert.ok(draft >= 0 && upload > draft && slowReads > upload, "upload must precede secondary Studio reads");
  assert.match(flow, /if \(!ezIsVibeCut\(\)\) await ensureProductionRequestMusic\(\)/);
  assert.match(flow, /return true;\s*}\s*if \(ezIsAzFinishedPath\(\)\)/);
});

test("580 MB upload explains zero segments before transfer and keeps exact completed segment counts", async () => {
  const h = harness();
  await h.run();
  const setup = h.progress.find(p => p.stage === "preparing");
  assert.equal(setup.doneParts, 0);
  assert.equal(setup.totalParts, 37);
  assert.ok(h.progress.some(p => p.doneParts === 18 && p.totalParts === 37));
  assert.equal(h.progress.at(-1).doneParts, 37);
});

test("Vibe upload badge uses separate lines, a progress bar and honest source placeholders", () => {
  const markup = section("function updateItem4MasterProgress(", "function mergeItem4WorkspaceStatus(");
  assert.match(markup, /item4-upload-meter/);
  assert.match(markup, /<\/span>\$\{countHtml}/);
  const placeholder = section("function item4AssetPlaceholder(", "function item4AssetThumb(");
  assert.doesNotMatch(placeholder, /"Clip saved"/);
  assert.match(placeholder, /Video not uploaded/);
  const uploader = section("async function uploadItem4Files(", "const item4PendingRemoves =");
  assert.match(uploader, /segments uploaded/);
  assert.match(uploader, /MB transferred/);
  const css = fs.readFileSync(new URL("./assets/production-progress-0601.css", import.meta.url), "utf8");
  assert.match(css, /#ezUploadZone > div:nth-child\(4\)/);
  assert.match(css, /#ezUploadHint/);
});
