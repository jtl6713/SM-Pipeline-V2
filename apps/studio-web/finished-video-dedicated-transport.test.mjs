import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const app=readFileSync(new URL("./assets/app-item4-1008.js",import.meta.url),"utf8");
const routeSource=app.slice(app.indexOf("function azDedicatedRequestPath("),app.indexOf("function withStudioProfile("));
const id="rec12345678901234";
const other="rec12345678901235";
test("dedicated transport rewrites only exact registered request while in its matching profile and intake",()=>{
  const ctx={azFinishedPath:true,selectedProfileId:"profileA",azDedicatedRequests:new Map([[id,"profileA"]])};
  vm.createContext(ctx);
  vm.runInContext(routeSource,ctx);
  const path="/api/production-requests/"+id;
  for(const suffix of ["","/item4?snapshot=1","/outputs","/assets/upload-session/session/parts/2","/assets/upload-session/session/complete"]){
    assert.equal(ctx.azDedicatedRequestPath(path+suffix),"/api/finished-video/production-requests/"+id+suffix);
  }
  for(const value of ["/api/production-requests","/api/production-requests/"+other,path+"x","/api/production-request-outputs/"+id])
    assert.equal(ctx.azDedicatedRequestPath(value),value);
  ctx.selectedProfileId="profileB";
  assert.equal(ctx.azDedicatedRequestPath(path),path);
  ctx.selectedProfileId="profileA";ctx.azFinishedPath=false;
  assert.equal(ctx.azDedicatedRequestPath(path),path);
});
test("both JSON and multipart XHR use the scoped request transport",()=>{
  assert.match(app,/function withStudioProfile\(path\) \{\s*path = azDedicatedRequestPath\(path\)/);
  assert.match(app,/fetch\(\x60\$\{apiBase\}\$\{withStudioProfile\(path\)\}\x60/);
  assert.match(app,/xhr\.open\("PUT", \x60\$\{apiBase\}\$\{withStudioProfile\(path\)\}\x60\)/);
  assert.match(app,/pathname\.startsWith\("\/api\/finished-video\/production-requests\/"\)/);
});
test("dedicated creation requires canonical finished source and verified request receipt, no fallback or retry",()=>{
  const create=app.slice(app.indexOf("async function createEzProductionRequest("),app.indexOf("function ezWizardAllowsPlanWithoutAssets("));
  const dedicated=create.slice(0,create.indexOf("\n    try {"));
  assert.match(dedicated,/activeIdea\.production_mode !== "automatic"/);
  assert.match(dedicated,/activeIdea\.production_source !== "finished_video"/);
  assert.match(dedicated,/api\("\/api\/finished-video\/production-requests"/);
  assert.match(dedicated,/retries: 0/);
  assert.match(dedicated,/ideaIdFromRequest\(result\.record\) !== ideaId/);
  assert.match(dedicated,/azDedicatedRequests\.set\(result\.record\.id, profile\)/);
  assert.match(dedicated,/return result/);
  assert.doesNotMatch(dedicated,/api\("\/api\/production-requests"/);
});
test("Finished Video preserves explicit Publish Now confirmation before capability check and upload",()=>{
  const begin=app.slice(app.indexOf("async function beginAzFinishedVideo("),app.indexOf("function bindAzFinishedDrop("));
  assert.match(begin,/azFinishedPublishMode\(\) === "immediate" && !window\.confirm/);
  assert.match(begin,/caps\.finished_video_transport_enabled === true/);
  assert.match(begin,/!azDedicatedTransport && caps\.ordinary_editor_boundary_enabled === true/);
  assert.ok(begin.indexOf("window.confirm")<begin.indexOf("/api/production-mode/capabilities"));
  assert.ok(begin.indexOf("/api/production-mode/capabilities")<begin.indexOf("await startEzProduction"));
  assert.match(app,/azDedicatedRequests\.get\(activeProductionRequest\.id\) !== selectedProfileId/);
});
