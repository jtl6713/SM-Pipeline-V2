import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets/app-item4-1008.js");

test("compression UI stops blocking when masters are Ready on Drive", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /function item4AssetCompressionUiPending/);
  assert.match(app, /String\(assetsStatus \|\| ""\)\.trim\(\) === "Ready" && driveReady/);
  assert.match(app, /Finishing Drive copy and preview/);
  assert.match(app, /function item4MasterPollDelayMs/);
  assert.match(app, /pct >= 85\) return 1000/);
  assert.match(app, /setTimeout\(pollItem4MasterAssets, 12000\)/);
});
