import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

test("Pipeline rows omit aspect ratio and manual TikTok resend controls", () => {
  const rowStart = app.indexOf("const pipelineRow =");
  // Home recent-outputs path is gone; Pipeline body is built unconditionally.
  const rowEnd = app.indexOf("const body = (() => {", rowStart);
  assert.ok(rowStart >= 0 && rowEnd > rowStart, "pipelineRow marker present");
  const row = app.slice(rowStart, rowEnd);
  assert.doesNotMatch(row, /aspect_ratio/);
  assert.doesNotMatch(row, /pipelineTiktokCompleteCell/);
  assert.doesNotMatch(row, /Resend draft to TikTok/);
  assert.match(row, /outputTypeLabel/);
});

test("TikTok resend is actionable in output details", () => {
  assert.match(html, /id="creativeTiktokResend"/);
  assert.match(html, /id="creativeTiktokResendWrap"/);
  assert.match(app, /\$\("creativeTiktokResend"\)\?\.addEventListener\("click"/);
  assert.match(app, /submitTiktokDraftResend\(id\)/);
  assert.match(app, /const canResend = tiktok && tiktokNeedsDraftResend\(output\)/);
});

test("Pipeline density styling keeps rows compact", () => {
  assert.match(css, /PIPELINE_DENSITY_0_6_510/);
  assert.match(css, /pipeline-compact-row\{height:30px\}/);
  assert.match(css, /pipeline-output-detail\{display:none!important\}/);
  assert.match(css, /pipeline-tiktok-resend,[\s\S]*display:none!important/);
});
