import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const from = app.indexOf("function withStudioProfile(path) {");
const to = app.indexOf("function activeNavPage()", from);
assert.ok(from >= 0 && to > from, "profile router exists");
const snippet = app.slice(from, to);

function route(path, id) {
  return vm.runInNewContext(
    "const selectedProfileId = " + JSON.stringify(id) + ";\n" + snippet + "\nwithStudioProfile(" + JSON.stringify(path) + ")",
    { URLSearchParams },
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

test("Script a Short proposal and acceptance carry explicit selected profile and prevent missing selection", () => {
  const propose = app.slice(app.indexOf('$("scriptedShortForm")?.addEventListener'), app.indexOf('$("scriptedShortDecline")?.addEventListener'));
  const startAccept = app.indexOf('$("scriptedShortAccept")?.addEventListener');
  const accept = app.slice(startAccept, startAccept + 1700);
  assert.match(propose, /if \(!selectedProfileId\)/);
  assert.match(propose, /body: JSON\.stringify\(\{ prompt, content_profile_id: selectedProfileId \}\)/);
  assert.match(accept, /content_profile_id: selectedProfileId/);
});

test("Pages index and app build version match and cache bust stale JS", () => {
  assert.match(html, /UI build 0\.6\.749/);
  assert.match(html, /\/assets\/app-item4-1008\.js\?v=0\.6\.749-producer-visible/);
  assert.match(app, /const BUILD_ID = "item4-0\.6\.749-producer-visible"/);
});
