import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(repo, "services", "ops-dashboard", "catalog.json"), "utf8")
);
const runner = fs.readFileSync(path.join(here, "Invoke-OpsDashboardAction.ps1"), "utf8");
const hidden = fs.readFileSync(path.join(here, "Start-ChicagoShiningHidden.ps1"), "utf8");
const hiddenAll = fs.readFileSync(path.join(here, "Start-ChicagoShiningHiddenAll.ps1"), "utf8");
const deploy = fs.readFileSync(path.join(here, "Deploy-SMService.ps1"), "utf8");

test("catalog actions are allowlisted in the PowerShell runner", () => {
  for (const action of catalog.actions) {
    assert.match(runner, new RegExp("'" + action.id + "'"));
  }
  assert.match(runner, /Never reset --hard/);
  assert.match(runner, /Refusing to stop the Ops Dashboard from itself/);
  assert.match(runner, /Start-Transcript/);
  assert.match(runner, /TranscriptPath/);
});

test("hidden start and deploy know ops-dashboard", () => {
  assert.match(hidden, /ops-dashboard/);
  assert.match(hidden, /3361/);
  assert.match(hiddenAll, /ops-dashboard/);
  assert.match(deploy, /ops-dashboard/);
  assert.match(deploy, /PublicHealthRequired = \$false/);
});

test("dashboard server binds loopback and allowlists actions", () => {
  const server = fs.readFileSync(
    path.join(repo, "services", "ops-dashboard", "server.js"),
    "utf8"
  );
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /DASHBOARD_TOKEN/);
  assert.match(server, /Unknown action/);
  assert.doesNotMatch(server, /eval\(/);
});
