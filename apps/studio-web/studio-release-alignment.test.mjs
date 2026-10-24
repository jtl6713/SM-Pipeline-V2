import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("Studio build label, app BUILD_ID, and all asset cache keys use one release", () => {
  const build = app.match(/\bBUILD_ID\s*=\s*"item4-(0\.6\.\d+-[a-z0-9-]+)"/)?.[1];
  const label = html.match(/\bid="uiBuildLabel">UI build (0\.6\.\d+)</)?.[1];
  assert.ok(build, "Studio app must expose a versioned BUILD_ID");
  assert.ok(label, "Studio footer must expose its build label");
  assert.equal(label, build.split("-")[0], "footer and app build must match");
  const assets = [...html.matchAll(/\/assets\/[^\s"']+\?v=([^&\s"']+)/g)];
  assert.ok(assets.length >= 20, "must inspect actual lazy and eager asset manifests");
  for (const [asset, version] of assets.map((match) => [match[0].split("?")[0], match[1]])) {
    assert.equal(version, build, `stale cache-busting version for ${asset}`);
  }
});
