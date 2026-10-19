import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("./assets/profile-admin-creative.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../studio-api/worker.js", import.meta.url), "utf8");
const operations = readFileSync(new URL("../studio-api/worker-functions-04.mjs", import.meta.url), "utf8");

test("Profile Admin and Global Admin have separate panels", () => {
  assert.match(html, /id="operationsTabProfiles"[^>]*>Profile Admin<\/button>/);
  assert.match(html, /id="operationsGlobalPanel"[^>]*data-ops-tab-panel="global"/);
  assert.match(html, /id="operationsCreativeForm"/);
  for (const field of ["shared_direction", "thumbnail_instructions", "narration_instructions"]) {
    assert.match(html, new RegExp('name="' + field + '"'));
  }
  const globalStart = html.indexOf('id="operationsGlobalPanel"');
  const profilesEnd = html.indexOf('id="operationsProducePanel"');
  assert.ok(globalStart >= 0 && profilesEnd > globalStart);
  assert.ok(html.indexOf('id="operationsScheduleHorizonDays"') > globalStart);
});

test("Admin edits are constrained to the header-selected Content Profile", () => {
  assert.match(client, /studioProfileSelect/);
  assert.match(client, /profileSelect\.value/);
  assert.match(client, /revision, creative/);
  assert.match(worker, /isOperationsCreativeRoute/);
  assert.match(operations, /creativeSettingName\(profileId\)/);
  assert.match(operations, /HttpError\(409/);
});

test("Admin uses an independently cached client asset", () => {
  assert.match(html, /profile-admin-creative\.js/);
  assert.match(html, /profile-admin-creative\.css/);
});
