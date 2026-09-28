import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverSrc = fs.readFileSync(path.join(here, "render-server.js"), "utf8");

test("job assets live outside public/ so Remotion does not copy multi-GB dirs", () => {
  assert.match(serverSrc, /RENDER_ASSETS_DIR = path\.join\(PROJECT_DIR, 'job-assets'\)/);
  assert.doesNotMatch(
    serverSrc,
    /RENDER_ASSETS_DIR = path\.join\(PUBLIC_DIR, 'render-assets'\)/,
  );
  assert.match(serverSrc, /app\.use\(RENDER_ASSETS_URL_PREFIX, express\.static\(RENDER_ASSETS_DIR\)\)/);
  assert.match(serverSrc, /--public-dir=/);
  assert.match(serverSrc, /public-empty/);
});

test("Remotion renders are serialized to one concurrent child", () => {
  assert.match(serverSrc, /MAX_CONCURRENT_REMOTION_RENDERS/);
  assert.match(serverSrc, /acquireRemotionSlot/);
  assert.match(serverSrc, /releaseRemotionSlot/);
  assert.match(serverSrc, /jobAssetsOutsidePublic: true/);
  assert.match(serverSrc, /2026-09-28-job-assets-serialize/);
});
