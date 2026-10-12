import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("collapsed Pipeline groups surface workflow tone and platform chips", () => {
  assert.match(app, /item4-0.6.614-overview-snapshot/);
  assert.match(app, /function pipelineGroupVisualTone/);
  assert.match(app, /function pipelineGroupPlatformSummary/);
  assert.match(app, /data-pipeline-tone=/);
  assert.match(app, /pipeline-group-platform-chip/);
});

test("Pipeline status tabs and platform rows keep distinct color treatment", () => {
  for (const state of ["rendering", "approval", "approved", "scheduled", "published", "failed", "attention"]) {
    assert.match(css, new RegExp(`data-pipeline-quick-view="${state}"`));
  }
  for (const platform of ["instagram", "facebook", "tiktok", "youtube"]) {
    assert.match(css, new RegExp(`pipeline-group-platform-chip\\[data-platform="${platform}"\\]`));
    assert.match(css, new RegExp(`pipeline-compact-row\\[data-platform="${platform}"\\]`));
  }
});
