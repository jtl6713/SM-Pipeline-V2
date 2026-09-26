import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

test("ops catalog ports are mapped and stop-all sweeps them", () => {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "services/ops-dashboard/catalog.json"), "utf8")
  );
  const action = fs.readFileSync(path.join(here, "Invoke-OpsDashboardAction.ps1"), "utf8");
  assert.match(action, /function Stop-CatalogListeners/);
  assert.match(action, /'stop-all' \{[\s\S]*Stop-CatalogListeners/);
  for (const svc of catalog.services) {
    assert.match(
      action,
      new RegExp(`'${svc.id}' = ${svc.port}`),
      `missing port mapping for ${svc.id}:${svc.port}`
    );
  }
});

test("desk companion probes YouTube Uploader LA", () => {
  const ps1 = fs.readFileSync(path.join(here, "Invoke-DeskCompanion.ps1"), "utf8");
  assert.match(ps1, /youtube-uploader-la/);
  assert.match(ps1, /youtube-upload-la\.chicagoshining\.com/);
});
