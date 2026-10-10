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

test("Invoke-Ps1 leaves -Switch names unquoted so Deploy -Service binds", () => {
  assert.match(runner, /\$text -match '\^-'/);
  assert.match(runner, /Named switches\/parameters must stay unquoted/);
  assert.match(runner, /deploy-pipeline-runner/);
  assert.match(runner, /'-Service', 'pipeline-runner', '-Yes'/);
});

test("hidden start and deploy know ops-dashboard", () => {
  assert.match(hidden, /ops-dashboard/);
  assert.match(hidden, /3361/);
  assert.match(hiddenAll, /ops-dashboard/);
  assert.match(deploy, /ops-dashboard/);
  assert.match(deploy, /PublicHealthRequired = \$false/);
});

test("hidden start pins PORT and waits for local /health", () => {
  assert.match(hidden, /ExtraEnv = @\{ PORT = '3333' \}/);
  assert.match(hidden, /\$extraEnv\['PORT'\] = \[string\]\$cfg\.Port/);
  assert.match(hidden, /health ok/);
  assert.match(hidden, /exited early/);
  assert.match(hidden, /Invoke-WebRequest -Uri \$healthUrl/);
  assert.match(runner, /Remove-Item Env:PORT/);
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
  assert.match(server, /PORT: ''/);
});

test("Ops dashboard reports the version/build each listener is actually running", () => {
  const server = fs.readFileSync(
    path.join(repo, "services", "ops-dashboard", "server.js"),
    "utf8"
  );
  const html = fs.readFileSync(
    path.join(repo, "services", "ops-dashboard", "public", "index.html"),
    "utf8"
  );
  for (const service of catalog.services) {
    assert.equal(typeof service.runtimePath, "string");
    assert.ok(service.runtimePath.length > 0);
  }
  assert.match(server, /OPS_DASHBOARD_VERSION = '2026-10-10-ops-start-port-clear'/);
  assert.match(server, /POST.*\/api\/shell|pathname === '\/api\/shell'/);
  assert.match(server, /function startShellJob/);
  assert.match(html, /id="shellInput"/);
  assert.match(html, /Run PowerShell/);
  assert.match(html, /Start-Process -FilePath powershell\.exe -WindowStyle Hidden/);
  assert.match(server, /\.smv2-deployment\.json/);
  assert.match(server, /function readGitHead/);
  assert.match(server, /function buildServiceVersionInfo/);
  assert.match(server, /localVersion/);
  assert.match(server, /publicVersion/);
  assert.match(server, /deployedCommitShort/);
  assert.match(server, /versionMismatch/);
  assert.match(server, /127\.0\.0\.1:' \+ svc\.port \+ '\/health'/);
  assert.match(server, /version: OPS_DASHBOARD_VERSION/);
  assert.match(html, /function versionMarkup/);
  assert.match(html, /Version <strong>/);
  assert.match(html, /LOCAL\/PUBLIC VERSION MISMATCH/);
});
