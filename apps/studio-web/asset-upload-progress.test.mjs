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
    "libraryUploadProgressStage", "libraryUploadMeter", "libraryUploadSavedMeter",
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
  assert.equal(nodes.get("libraryUploadSavedMeter").max,4);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,1);
  assert.equal(nodes.get("libraryUploadSavedMeter")["aria-valuetext"],"1 of 4 assets saved");
  assert.equal(nodes.get("libraryUploadProgressBytes").textContent, "8.0 of 20.0 MB transferred");
  assert.equal(nodes.get("libraryUploadMeter").value, 40);
  assert.equal(nodes.get("libraryUploadProgressPercent").textContent, "40%");
  assert.equal(nodes.get("libraryUploadProgress").hidden, false);
  context.renderLibraryUploadProgress({ phase: "verifying", file, fileIndex: 2, fileCount: 4, uploaded: 1, loadedBytes: file.size });
  assert.equal(nodes.get("libraryUploadMeter").value, 100);
  assert.equal(nodes.get("libraryUploadProgressPercent").textContent, "100% sent");
  assert.match(nodes.get("libraryUploadProgressStage").textContent, /Google Drive storage and Airtable registration confirmation/);
  assert.match(nodes.get("libraryUploadMeter")["aria-label"], /confirmation pending/);
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent, "1 of 4 assets saved");
  assert.equal(nodes.get("libraryUploadSavedMeter").value,1,"File transfer completion cannot advance saved count");
  context.renderLibraryUploadProgress({ phase: "saved", file, fileIndex: 2, fileCount: 4, uploaded: 2, loadedBytes: file.size });
  assert.equal(nodes.get("libraryUploadMeter").value, 100);
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent, "2 of 4 assets saved");
  assert.equal(nodes.get("libraryUploadSavedMeter").value,2);
});

test("batch save meter fills by confirmed assets and holds its fill through failures", () => {
  const {context,nodes}=contextFor();
  const file={name:"photo7.jpg",size:64000};
  const show=(phase,uploaded)=>context.renderLibraryUploadProgress({
    phase,file,fileCount:10,fileIndex:7,uploaded,loadedBytes:file.size,
  });
  show("uploading",6);
  assert.equal(nodes.get("libraryUploadSavedMeter").max,10);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,6);
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent,"6 of 10 assets saved");
  assert.equal(nodes.get("libraryUploadSavedMeter")["aria-valuetext"],"6 of 10 assets saved");
  show("verifying",6);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,6);
  show("failed",6);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,6);
  show("partial",6);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,6);
  show("saved",7);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,7);
  show("complete",10);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,10);
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent,"10 of 10 assets saved");
  show("complete",20);
  assert.equal(nodes.get("libraryUploadSavedMeter").value,10,"Bar cannot overflow batch count");
});

test("small images report KB, never a misleading 0.0 of 0.0 MB", () => {
  const {context,nodes}=contextFor();
  const file={name:"tiny-photo.jpg",size:40*1024};
  context.renderLibraryUploadProgress({phase:"uploading",file,fileIndex:1,fileCount:10,loadedBytes:20*1024,uploaded:0});
  assert.equal(nodes.get("libraryUploadProgressBytes").textContent,"20.0 of 40.0 KB transferred");
  assert.equal(nodes.get("libraryUploadProgressPercent").textContent,"50%");
  context.renderLibraryUploadProgress({phase:"verifying",file,fileIndex:1,fileCount:10,loadedBytes:file.size,uploaded:0});
  assert.equal(nodes.get("libraryUploadProgressBytes").textContent,"40.0 of 40.0 KB transferred");
  assert.equal(nodes.get("libraryUploadProgressPercent").textContent,"100% sent");
  assert.equal(nodes.get("libraryUploadProgressFiles").textContent,"0 of 10 assets saved");
  context.renderLibraryUploadProgress({phase:"uploading",file:{name:"zero.jpg",size:0},fileCount:10});
  assert.equal(nodes.get("libraryUploadProgressBytes").textContent,"Empty file (0 B)");
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
  for (const id of ["libraryUploadProgress","libraryUploadMeter","libraryUploadSavedMeter","libraryUploadProgressFile","libraryUploadProgressBytes","libraryUploadProgressFiles"]) {
    assert.match(html,new RegExp('id="' + id + '"'));
  }
  assert.match(css,/#libraryUploadProgress/);
  assert.match(css,/#libraryUploadSavedMeter/);
  assert.match(html,/class="library-saved-progress"/);
  assert.match(html,/id="libraryUploadProgressFiles" aria-hidden="true"/);
  const release = html.match(/UI build 0\.6\.(\d+)/);
  assert.ok(release && Number(release[1]) >= 833, "Asset Manager requires UI 0.6.833 or newer");
});

test("failed transfers retain measured bytes and the actionable server error", () => {
  const {context,nodes}=contextFor();
  const file={name:"screen.mov",size:1000};
  context.renderLibraryUploadProgress({phase:"partial",file,loadedBytes:1000,message:"Asset held for review",uploaded:0});
  assert.equal(nodes.get("libraryUploadProgressPercent").textContent,"100% sent");
  assert.equal(nodes.get("libraryUploadProgressStage").textContent,"Asset held for review");
  assert.equal(nodes.get("libraryUploadSavedMeter").value,0);
  context.renderLibraryUploadProgress({phase:"partial",file,loadedBytes:400,message:"Connection interrupted",uploaded:0});
  assert.equal(nodes.get("libraryUploadMeter").value,40);
});

test("classification polling cannot overwrite an unresolved upload failure", () => {
  const start=source.indexOf("function syncLibraryClassifyStatusMessage(");
  const end=source.indexOf("function libraryPreviewUrl(",start);
  let message="Upload confirmation timed out";
  const panel={dataset:{state:"partial"}};
  const context=vm.createContext({$:()=>panel,libraryUploadMessageBusy:()=>false,
    setLibraryUploadMessage:value=>{message=value;},libraryClassifyWatch:{total:1},
    clearLibraryClassificationWatch:()=>{}});
  vm.runInContext(source.slice(start,end),context);
  context.syncLibraryClassifyStatusMessage(1);
  assert.equal(message,"Upload confirmation timed out");
  panel.dataset.state="complete";
  context.syncLibraryClassifyStatusMessage(1);
  assert.equal(message,"Classifying 1 of 1 remaining.");
});

function libraryPollHarness(ids, records, startingMessage = "Asset saved") {
  const watched = { ids: new Set(ids), total: ids.length, startedAt: Date.now() };
  const status = { message: startingMessage, className: "", syncCalls: [], scheduled: 0 };
  const sourceStart = source.indexOf("async function pollLibraryClassification()");
  const sourceEnd = source.indexOf("function markLibraryCardsClassifying(", sourceStart);
  assert.ok(sourceStart > 0 && sourceEnd > sourceStart);
  const context = vm.createContext({
    activeNavPage: () => "library",
    document: { visibilityState: "visible", querySelectorAll: () => [] },
    libraryListQueryParams: () => ({published: false, params: {toString: () => ""}}),
    libraryClassifyPollInFlight: false,
    libraryClassifyWatch: watched,
    api: async () => ({records}),
    fetchLibraryClassificationRecords: async () => records,
    patchLibraryClassificationCard: () => {},
    libraryClassificationInProgress: value => value === "Processing",
    persistLibraryClassifyWatch: () => {},
    syncLibraryClassifyStatusMessage: left => {
      status.syncCalls.push(left);
      if (left === 0) watched.ids.clear();
    },
    libraryVisibleClassifying: () => records.some(record => record.classification_status === "Processing"),
    libraryClassifyWatchActive: () => watched.ids.size > 0,
    scheduleLibraryClassifyPoll: () => { status.scheduled++; },
    stopLibraryClassifyPoll: () => {},
    libraryUploadMessageBusy: () => false,
    setLibraryUploadMessage: (message, className = "") => {
      status.message = message; status.className = className;
    },
    $: id => id === "libraryUploadProgress"
      ? {dataset: {state: "complete"}}
      : {textContent: status.message},
  });
  vm.runInContext(source.slice(sourceStart, sourceEnd), context);
  return {context, status, watched};
}

test("classified watched asset finishes its progress message rather than staying Classifying", async () => {
  const {context, status, watched} = libraryPollHarness(
    ["recCTA18"], [{id: "recCTA18", record_type: "media_asset", classification_status: "Classified"}],
    "Classifying 1 of 1 remaining.",
  );
  await context.pollLibraryClassification();
  assert.deepEqual(status.syncCalls, [0]);
  assert.equal(watched.ids.size, 0);
  assert.match(status.message, /Classification complete.*1 of 1/i);
  assert.equal(status.className, "success");
});

test("unrelated library Processing cards never resurrect upload classification progress", async () => {
  const {context, status} = libraryPollHarness(
    [], [{id: "recOther", record_type: "media_asset", classification_status: "Processing"}],
    "Asset Manager upload complete",
  );
  await context.pollLibraryClassification();
  assert.deepEqual(status.syncCalls, []);
  assert.equal(status.message, "Asset Manager upload complete");
  const stale = libraryPollHarness([], [], "Classifying 1 of 1 remaining.");
  await stale.context.pollLibraryClassification();
  assert.equal(stale.status.message, "Status: ready");
  assert.deepEqual(stale.status.syncCalls, []);
});

test("classification errors and missing records do not claim a successful classification", async () => {
  const error = libraryPollHarness(["recCTA18"], [{id:"recCTA18", record_type:"media_asset", classification_status:"Classification Error"}], "Classifying 1 of 1 remaining.");
  await error.context.pollLibraryClassification();
  assert.match(error.status.message, /needs attention/i);
  assert.equal(error.status.className, "error-text");
  const missing = libraryPollHarness(["recUnknown"], [], "Classifying 1 of 1 remaining.");
  await missing.context.pollLibraryClassification();
  assert.match(missing.status.message, /could not be verified/i);
  assert.equal(missing.status.className, "error-text");
});

test("expired classification watch clears its pending status without claiming completion", () => {
  const start = source.indexOf("function scheduleLibraryClassifyPoll(");
  const end = source.indexOf("async function fetchLibraryClassificationRecords(", start);
  let cleared = false, stopped = false, message = "";
  const watch = {ids:new Set(["recCTA18"])};
  const context = vm.createContext({
    libraryClassifyWatchActive: () => watch.ids.size > 0,
    libraryClassifyWatchIsFresh: () => false,
    libraryClassifyWatch: watch,
    clearLibraryClassificationWatch: () => {watch.ids.clear();cleared = true;},
    libraryUploadMessageBusy: () => false,
    $: () => ({dataset: {state:"complete"}}),
    setLibraryUploadMessage: value => {message = value;},
    stopLibraryClassifyPoll: () => {stopped = true;},
  });
  vm.runInContext(source.slice(start,end), context);
  context.scheduleLibraryClassifyPoll(true);
  assert.equal(cleared, true);
  assert.equal(stopped, true);
  assert.match(message, /not verified/i);
  assert.doesNotMatch(message, /complete/i);
});

test("failed status GET does not falsely report classification still running", () => {
  const start = source.indexOf("function libraryClassifyPollError(");
  const end = source.indexOf("async function pollLibraryClassification(", start);
  let message = "", retried = 0;
  const context = vm.createContext({
    libraryClassifyWatchActive: () => true,
    libraryUploadMessageBusy: () => false,
    $: () => ({dataset: {state:"complete"}}),
    setLibraryUploadMessage: value => {message = value;},
    scheduleLibraryClassifyPoll: () => {retried++;},
  });
  vm.runInContext(source.slice(start,end), context);
  context.libraryClassifyPollError(new Error("network"));
  assert.match(message, /Unable to verify/i);
  assert.equal(retried, 1);
});
