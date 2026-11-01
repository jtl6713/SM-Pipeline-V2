import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const moduleCode = fs.readFileSync(new URL("./assets/library-upload-progress-0832.js", import.meta.url), "utf8");
const studioCode = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function harness() {
  const node = { hidden: true, dataset: {}, innerHTML: "" };
  let currentRequest;
  class MockXhr {
    constructor() {
      this.upload = {};
      currentRequest = this;
    }
    open(method, url) { this.method = method; this.url = url; }
    send(form) { this.form = form; }
  }
  const context = vm.createContext({
    window: {},
    document: { getElementById: id => id === "libraryUploadProgress" ? node : null },
    XMLHttpRequest: MockXhr
  });
  vm.runInContext(moduleCode, context);
  const api = context.window.StudioLibraryUploadProgress;
  const file = { name: "Michigan & Wacker.mov", size: 16 * 1024 * 1024 };
  return { api, node, file, get request() { return currentRequest; } };
}

test("Asset Manager shows current asset, file count and real transfer bytes", async () => {
  const h = harness();
  const form = { fake: "FormData" };
  h.api.render({ phase: "preparing", file: h.file, index: 2, totalFiles: 3, confirmedFiles: 1 });
  assert.match(h.node.innerHTML, /Preparing asset 2 of 3/);
  assert.match(h.node.innerHTML, /Michigan &amp; Wacker.mov/);
  const events = [];
  const promise = h.api.post({ url: "/api/library?profile=recChicago", form, file: h.file, onProgress: e => {
    events.push(e);
    h.api.render({ ...e, file: h.file, index: 2, totalFiles: 3, confirmedFiles: 1 });
  }});
  assert.equal(h.request.method, "POST");
  assert.equal(h.request.url, "/api/library?profile=recChicago");
  assert.equal(h.request.withCredentials, true);
  assert.equal(h.request.timeout, 180000);
  assert.equal(h.request.form, form);
  h.request.upload.onprogress({ loaded: 8 * 1024 * 1024, lengthComputable: true });
  assert.match(h.node.innerHTML, /8\.0 of 16\.0 MB transferred/);
  assert.match(h.node.innerHTML, /aria-valuenow="50"/);
  assert.match(h.node.innerHTML, /1 of 3 assets confirmed/);
  h.request.upload.onload();
  assert.match(h.node.innerHTML, /Confirming asset 2 of 3/);
  assert.match(h.node.innerHTML, /1 of 3 assets confirmed/);
  h.request.status = 202;
  h.request.responseText = JSON.stringify({ ok: true, uploaded: 1, records: [{ id: "recSaved" }] });
  h.request.onload();
  const result = await promise;
  assert.equal(result.uploaded, 1);
  h.api.render({ phase: "saved", file: h.file, index: 2, totalFiles: 3, confirmedFiles: 2, sentBytes: h.file.size });
  assert.match(h.node.innerHTML, /Asset 2 of 3 saved/);
  assert.match(h.node.innerHTML, /2 of 3 assets confirmed/);
  assert.equal(h.node.dataset.heal, "ready");
  assert.equal(events.length, 2);
});

test("Full transfer never implies a saved asset without a confirming server response", async () => {
  const h = harness();
  const p = h.api.post({ url: "/api/library", form: {}, file: h.file, onProgress: e =>
    h.api.render({ ...e, file: h.file, confirmedFiles: 0 }) });
  h.request.upload.onload();
  assert.match(h.node.innerHTML, /Confirming asset/);
  assert.match(h.node.innerHTML, /0 of 1 assets confirmed/);
  assert.doesNotMatch(h.node.innerHTML, /Asset 1 of 1 saved/);
  h.request.status = 200;
  h.request.responseText = "{}";
  h.request.onload();
  await assert.rejects(p, /did not confirm a saved asset/);
});

test("Network error and timeout do not automatically create duplicate requests", async () => {
  for (const mode of ["onerror", "ontimeout"]) {
    const h = harness();
    let calls = 0;
    const p = h.api.post({ url: "/api/library", form: {}, file: h.file, onProgress: () => calls++ });
    h.request.upload.onprogress({ loaded: 1024, lengthComputable: true });
    h.request[mode]();
    await assert.rejects(p, /unverified/);
    assert.equal(h.request.method, "POST");
    assert.equal(calls, 1);
  }
});

test("Batch failure remains visible rather than showing all files saved", () => {
  const h = harness();
  h.api.render({ phase: "partial", totalFiles: 4, confirmedFiles: 3, failedFiles: 1 });
  assert.match(h.node.innerHTML, /3 of 4 assets confirmed/);
  assert.match(h.node.innerHTML, /1 need attention/);
  assert.equal(h.node.dataset.heal, "error");
  assert.equal(h.node.hidden, false);
  assert.match(h.node.innerHTML, /aria-valuenow="75"/);
});

test("Malicious or long filename is escaped and wraps", () => {
  const h = harness();
  h.api.render({ file: { name: '<img src=x onerror="evil()">.jpg', size: 123 }, totalFiles: 2 });
  assert.doesNotMatch(h.node.innerHTML, /<img/);
  assert.match(h.node.innerHTML, /&lt;img/);
  assert.match(h.node.innerHTML, /library-transfer-file/);
});

test("Studio loads the asset progress module before uploader and preserves Asset Manager route", () => {
  assert.match(html, /id="libraryUploadProgress"/);
  assert.match(html, /library-upload-progress-0832\.js/);
  assert.ok(html.indexOf("library-upload-progress-0832.js") < html.indexOf("app-item4-1008.js"));
  const begin = studioCode.indexOf("async function uploadLibraryFiles(");
  const end = studioCode.indexOf("function libraryPhotoAccept(", begin);
  const upload = studioCode.slice(begin, end);
  assert.match(upload, /StudioLibraryUploadProgress\.post/);
  assert.match(upload, /withStudioProfile\("\/api\/library"\)/);
  assert.match(upload, /phase: "preparing"/);
  assert.match(upload, /phase: "saved"/);
  assert.match(upload, /phase: "failed"/);
  assert.match(upload, /errors\.length \? "partial" : "complete"/);
  assert.ok(upload.indexOf("StudioLibraryUploadProgress.post") < upload.indexOf("phase: \"saved\""));
  assert.doesNotMatch(upload, /retries:\s*[1-9]/);
});
