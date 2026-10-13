import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(here, "../studio-api/worker.js"), "utf8");

test("UI 0.6.516 Approve gate rejects stale Rendering / In Production (Output 1807)", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.672-content-id-data"/);
  assert.match(html, /UI build 0.6.672/);
  assert.match(html, /app-item4-1008\.js\?v=0.6.672-content-id-data/);
  assert.match(html, /styles-phase7-0621\.css\?v=0.6.672-content-id-data/);
  assert.match(app, /function creativeCanApproveForPublishing\(/);
  assert.match(
    app,
    /if \(status === "In Production" \|\| render === "Rendering" \|\| render === "Ready for Render"\) return false;/
  );
  assert.match(app, /Output 1807/);
});

test("Worker 0.10.478 heals Final_File_URL + Rendering to Ready for Review", () => {
  assert.match(worker, /version: "0.10.580-factory-promoted-done-exclude"/);
  assert.match(worker, /studio_render_stale_rendering_v1: true/);
  assert.match(worker, /R5_STALE_RENDERING_FINALIZED/);
  assert.match(worker, /\{Render_Status\}="Rendering",\{Final_File_URL\}!=""/);
  assert.match(worker, /Output_Status: "Ready for Review"/);
});
