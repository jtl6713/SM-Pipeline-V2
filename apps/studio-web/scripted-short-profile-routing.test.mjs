import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const from = app.indexOf("function azDedicatedRequestPath(path) {");
const to = app.indexOf("function activeNavPage()", from);
assert.ok(from >= 0 && to > from, "profile router exists");
const snippet = app.slice(from, to);

function route(path, id, { finished = false, requests = [] } = {}) {
  return vm.runInNewContext(
    "const selectedProfileId = " + JSON.stringify(id) + ";\n" + snippet + "\nwithStudioProfile(" + JSON.stringify(path) + ")",
    { URLSearchParams, azFinishedPath: finished, azDedicatedRequests: new Map(requests) },
  );
}

test("Script a Short propose and accept use selected Studio profile for all four cities", () => {
  const cities = [
    ["Chicago", "recT2rbKX3MF7cVFU"],
    ["New York", "recgtK8Z7eNADNtVy"],
    ["Los Angeles", "recLosAngeles"],
    ["Miami", "recMiami"],
  ];
  for (const [city, profileId] of cities) {
    for (const endpoint of ["/api/scripted-short/propose", "/api/scripted-short/accept"]) {
      assert.equal(route(endpoint, profileId), endpoint + "?profile=" + profileId, city + " " + endpoint);
    }
  }
});

test("profile router preserves query params, existing Ideas scoping and unrelated endpoints", () => {
  assert.equal(route("/api/scripted-short/propose?example=1", "recNYC"), "/api/scripted-short/propose?example=1&profile=recNYC");
  assert.equal(route("/api/ideas", "recNYC"), "/api/ideas?profile=recNYC");
  assert.equal(route("/api/health", "recNYC"), "/api/health");
  assert.equal(route("/api/scripted-short/propose", ""), "/api/scripted-short/propose");
});

test("profile router preserves exact dedicated Finished Video request ownership and query scope", () => {
  const id = "rec12345678901234";
  const other = "rec12345678901235";
  const profile = "recNYC";
  const registered = { finished: true, requests: [[id, profile]] };
  const path = "/api/production-requests/" + id;
  assert.equal(route(path + "/item4?snapshot=1", profile, registered),
    "/api/finished-video/production-requests/" + id + "/item4?snapshot=1&profile=recNYC");
  assert.equal(route(path + "/assets/upload-session/session/parts/2", profile, registered),
    "/api/finished-video/production-requests/" + id + "/assets/upload-session/session/parts/2?profile=recNYC");
  assert.equal(route("/api/production-requests/" + other, profile, registered),
    "/api/production-requests/" + other + "?profile=recNYC");
  assert.equal(route(path, "recMiami", registered), path + "?profile=recMiami");
  assert.equal(route(path, profile, { ...registered, finished: false }), path + "?profile=recNYC");
  assert.equal(route("/api/scripted-short/accept", profile, registered),
    "/api/scripted-short/accept?profile=recNYC");
  assert.equal(route("/api/finished-video/production-requests", profile, registered),
    "/api/finished-video/production-requests?profile=recNYC");
});

test("Script a Short proposal and acceptance carry explicit selected profile and prevent missing selection", () => {
  const propose = app.slice(app.indexOf('$("scriptedShortForm")?.addEventListener'), app.indexOf('$("scriptedShortDecline")?.addEventListener'));
  const startAccept = app.indexOf('$("scriptedShortAccept")?.addEventListener');
  const accept = app.slice(startAccept, startAccept + 1700);
  assert.match(propose, /if \(!selectedProfileId\)/);
  assert.match(propose, /body: JSON\.stringify\(\{ prompt, content_profile_id: selectedProfileId \}\)/);
  assert.match(accept, /content_profile_id: selectedProfileId/);
});

test("Pages index and app build version match and cache bust stale JS", () => {
  assert.match(html, /UI build 0\.6\.\d+/);
  assert.match(html, /\/assets\/app-item4-1008\.js\?v=0\.6\.\d+-[a-z0-9-]+/);
  assert.match(app, /const BUILD_ID = "item4-0\.6\.\d+-[a-z0-9-]+"/);
});
