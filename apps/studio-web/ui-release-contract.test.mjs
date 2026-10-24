import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  compareUiVersions,
  extractAppUrlFromHtml,
  extractUiVersionFromHtml,
  readUiReleaseContract,
} from "./ui-release-contract.mjs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("Studio UI release label, BUILD_ID, and every JS/CSS cache key are one contract", () => {
  const contract = readUiReleaseContract(html, app);
  assert.match(contract.version, /^\d+\.\d+\.\d+$/);
  assert.equal(new URL(contract.expectedJsUrl, "https://studio.invalid").searchParams.get("v"), contract.cacheKey);
  assert.equal(contract.expectedBuildId, "item4-" + contract.cacheKey);
  assert.ok(contract.expectedJsUrl.includes("/assets/app-item4-1008.js?v="));
  assert.ok(contract.versionedAssetCount >= 20);
  assert.equal(extractUiVersionFromHtml(html), contract.version);
  assert.equal(extractAppUrlFromHtml(html), contract.expectedJsUrl);
});

test("release contract rejects drift that can produce a green stale deploy", () => {
  const contract = readUiReleaseContract(html, app);
  assert.throws(
    () => readUiReleaseContract(html.replace("UI build " + contract.version, "UI build 0.0.1"), app),
    /does not match application cache version/,
  );
  assert.throws(
    () => readUiReleaseContract(html.replace("styles-phase7-0621.css?v=" + contract.cacheKey, "styles-phase7-0621.css?v=stale"), app),
    /do not share release cache key/,
  );
  assert.throws(
    () => readUiReleaseContract(html, app.replace(contract.expectedBuildId, "item4-0.0.1-stale")),
    /must equal/,
  );
});

test("release newness comparison is numeric and rejects unchanged versions", () => {
  assert.equal(compareUiVersions("0.6.735", "0.6.709"), 1);
  assert.equal(compareUiVersions("0.6.735", "0.6.735"), 0);
  assert.equal(compareUiVersions("0.6.709", "0.6.735"), -1);
});
