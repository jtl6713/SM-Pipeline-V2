import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const config = fs.readFileSync(path.join(here, "assets", "config-0621.js"), "utf8");

test("Operations copy uses Quality Agent as the operator-facing umbrella", () => {
  assert.match(html, />Quality Agent</);
  assert.match(html, /id="operationsViewAgent">Quality Agent</);
  assert.match(html, /id="helpTabDesk"[^>]*>Quality Agent</);
  assert.match(html, /id="operationsTabCatalog"[^>]*>Catalog</);
  assert.match(html, /id="operationsAgentCatalogPanel"/);
  assert.match(html, /id="operationsTabActivity"[^>]*>Activity log</);
  assert.match(html, /id="operationsDeskChecks"/);
  assert.match(html, /id="operationsAgentDeskChecks"/);
  assert.match(html, /Quality Agent — service lane/);
  assert.match(html, /id="operationsTabDesk"[^>]*>Service desk</);
  assert.match(html, /href="\/docs\/Quality-Agent\.docx"/);
  assert.match(config, /Open the Quality Agent page/);
  assert.match(config, /Named Quality Agent check list/);
  assert.doesNotMatch(html, />Autonomous Service Agent</);
  assert.doesNotMatch(html, /id="helpTabDesk"[^>]*>Service desk</);
  assert.doesNotMatch(html, /id="operationsTabInventory"/);
});
