import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./assets/asset-upload-progress-0832.css", import.meta.url), "utf8");
const from = source.indexOf("function renderLibraryUploadProgress(");
const to = source.indexOf("async function uploadLibraryFiles(", from);
assert.ok(from > 0 && to > from, "Asset Manager status and transport helpers must be present");
const helpers = source.slice(from, to);
function contextFor(transportClass) {
  const nodes = new Map();
  for (const name of [
    "libraryUploadProgress", "libraryUploadProgressTitle", "libraryUploadProgressFile",
    "libraryUploadProgressPercent", "libraryUploadProgressFiles", "libraryUploadProgressBytes",
    "libraryUploadProgressStage", "libraryUploadMeter",
  ]) nodes.set(name, { textContent: "", hidden: true, dataset: {}, setAttribute(name, value) { this[name] = value; } });
  const context = vm.createContext({
    $: id => nodes.get(id),
    XMLHttpRequest: transportClass || class {},
    apiBase: "https://studio.chicagoshining.com",
    URL, encodeURIComponent,
  });
  vm.runInContext(helpers, context);
  return { context, nodes };
}

test("progress shows the current file and actual bytes independently of confirmed saves", () => {
  const { context, nodes } = contextFor();
  const file = { name: "Museum & Pier.mov", size: 20 * 1024 * 1024 };
  context.renderLibraryUploadProgress({ phase: "uploading", file, fileIndex: 2, fileCount: 4, uploaded: 1, loadedBytes: 8 * 1024 * 1024 });
  assert.equal(nodes.get("libraryUploadProgressTitle").textContent, "Uploading asset 2 of 4");
  assert.equal(nodes.get("libraryUploadProgressFile").textContent, file.name);
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent, "1 of 4 assets saved");
  assert.equal(nodes.get("libraryUploadProgressBytes").textContent, "8.0 of 20.0 MB transferred");
  assert.equal(nodes.get("libraryUploadMeter").value, 40);
  assert.equal(nodes.get("libraryUploadProgressPercent").textContent, "40%");
  assert.equal(nodes.get("libraryUploadProgress").hidden, false);
  context.renderLibraryUploadProgress({ phase: "verifying", file, fileIndex: 2, fileCount: 4, uploaded: 1, loadedBytes: file.size });
  assert.equal(nodes.get("libraryUploadMeter").value, 99);
  assert.match(nodes.get("libraryUploadProgressStage").textContent, /Waiting for server and Google Drive confirmation/);
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent, "1 of 4 assets saved");
  context.renderLibraryUploadProgress({ phase: "saved", file, fileIndex: 2, fileCount: 4, uploaded: 2, loadedBytes: file.size });
  assert.equal(nodes.get("libraryUploadMeter").value, 100);
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent, "2 of 4 assets saved");
});

test("the current filename is always text, not executable HTML", () => {
  const { context, nodes } = contextFor();
  context.renderLibraryUploadProgress({ file: {name: "<img src=x onerror=alert(1)>",size:100},fileCount:2 });
  assert.equal(nodes.get("libraryUploadProgressFile").textContent,"<img src=x onerror=alert(1)>");
  assert.equal(nodes.get("libraryUploadProgressFile").innerHTML, undefined);
});

test("single-request library upload reports sent bytes and only resolves after server confirmation", async () => {
  let request, sentForm;
  class FakeXHR {
    constructor() { request = this; this.upload = {}; }
    open(method, url) { this.method = method; this.url = url; }
    send(form) {
      sentForm = form;
      this.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
      this.upload.onprogress({ lengthComputable: true, loaded: 10, total: 10 });
      this.upload.onload();
      this.status = 200;
      this.responseText = JSON.stringify({ ok:true, uploaded:1, records:[{id:"recDone"}] });
      this.onload();
    }
  }
  const { context } = contextFor(FakeXHR);
  const stages = [], file = {name:"museum.jpg",size:6*1024*1024}, form = {marker:1};
  const result = await context.uploadLibraryFileWithProgress(form, {
    profileId:"recChicagoTest", file,
    onTransfer: item=>stages.push(item),
  });
  assert.equal(result.uploaded,1);
  assert.equal(request.method,"POST");
  assert.match(request.url,/\/api\/library\?profile=recChicagoTest$/);
  assert.equal(request.timeout,180000);
  assert.equal(sentForm,form);
  assert.deepEqual([...stages].map(x=>x.stage),["uploading","verifying"]);
  assert.equal(stages[0].loadedBytes,3*1024*1024);
  assert.equal(stages[1].loadedBytes,file.size);
});

test("failed and zero-save responses are never counted as confirmed", async () => {
  for (const response of [{status:503,body:{error:"Service unavailable"}},{status:200,body:{ok:true,uploaded:0}},{status:200,body:{ok:true}},{status:200,body:null},{status:200,body:{ok:true,uploaded:"invalid"}}]) {
    class FakeXHR {
      constructor(){this.upload={};}
      open(){}
      send(){this.upload.onload();this.status=response.status;this.responseText=JSON.stringify(response.body);this.onload();}
    }
    const {context}=contextFor(FakeXHR);
    await assert.rejects(
      context.uploadLibraryFileWithProgress({}, {profileId:"recChicago",file:{name:"video.mov",size:1024}}),
      /Service unavailable|did not confirm/,
    );
  }
});

test("network interruptions stay unconfirmed; no automatic duplicate POST", async () => {
  let sent=0;
  class FakeXHR {
    constructor(){this.upload={};}
    open(){}
    send(){sent++;this.onerror();}
  }
  const {context}=contextFor(FakeXHR);
  await assert.rejects(context.uploadLibraryFileWithProgress({}, {profileId:"recChicago",file:{name:"one.mov",size:10}}), /unconfirmed/);
  assert.equal(sent,1);
});

test("queue remains one asset at a time with real result counts and no implicit publishing", () => {
  const start=source.indexOf("async function uploadLibraryFiles(");
  const end=source.indexOf("function libraryPhotoAccept(",start);
  const queue=source.slice(start,end);
  assert.match(queue,/const chunkSize = 1/);
  assert.match(queue,/await uploadLibraryFileWithProgress\(form/);
  assert.match(queue,/renderLibraryUploadProgress\(\{ phase: "saved"/);
  assert.match(queue,/phase: errors.length \? "partial" : "complete"/);
  assert.match(queue,/if \(libraryUploadMessageBusy\(\)\) return/);
  assert.doesNotMatch(queue,/publish|\/api\/outputs/i);
  for (const id of ["libraryUploadProgress","libraryUploadMeter","libraryUploadProgressFile","libraryUploadProgressBytes","libraryUploadProgressFiles"]) {
    assert.match(html,new RegExp('id="' + id + '"'));
  }
  assert.match(css,/#libraryUploadProgress/);
  assert.match(html,/UI build 0\.6\.\d+/);
});
