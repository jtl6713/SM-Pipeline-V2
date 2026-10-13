import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Factory Desk is a separate page beside Operations", async () => {
  const html = await readFile(path.join(here, "index.html"), "utf8");
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const factory = await readFile(path.join(here, "assets/factory-desk.js"), "utf8");
  const css = await readFile(path.join(here, "assets/styles-phase7-0621.css"), "utf8");

  assert.match(html, /id="navFactory"[^>]*>Factory</);
  assert.match(html, /id="page-factory"/);
  assert.match(html, /factory-desk\.js\?v=0\.6\.662-factory-preview/);
  assert.match(html, /"factory":\s*\[\s*"\/assets\/factory-desk\.js/);
  assert.doesNotMatch(html, /<script src="\/assets\/factory-desk\.js/);
  assert.match(html, /factory-lane-auto/);
  assert.match(html, /factory-lane-eyes/);
  assert.match(html, /factory-lane-assets/);
  assert.match(html, /factory-lane-manual/);
  assert.match(html, /id="factoryPreviewBackdrop"/);
  assert.match(html, /id="factoryPreviewVideo"/);

  const operations = html.indexOf('id="page-operations"');
  const factoryPage = html.indexOf('id="page-factory"');
  const support = html.indexOf('id="page-support"');
  assert.ok(operations > 0 && factoryPage > operations && support > factoryPage);

  assert.match(app, /BUILD_ID = "item4-0\.6\.662-factory-preview"/);
  assert.match(app, /page === "factory"/);
  assert.match(app, /StudioFactoryDesk\?\.load/);
  assert.match(factory, /StudioFactoryDesk/);
  assert.match(factory, /pin_needs_assets/);
  assert.match(factory, /data-factory-approve/);
  assert.match(factory, /data-factory-send-back/);
  assert.match(factory, /data-factory-delete/);
  assert.match(factory, /data-factory-preview/);
  assert.match(factory, /openFactoryPreview/);
  assert.match(factory, /\/api\/outputs\/\$\{card\.id\}\/preview/);
  assert.match(css, /grid-template-areas:\s*"auto eyes"\s*"assets manual"/);
  assert.match(css, /\.factory-lane-auto\{grid-area:auto\}/);
  assert.match(css, /\.factory-lane-assets\{grid-area:assets\}/);
  assert.doesNotMatch(css, /factory-lane-assets\{grid-column:1 \/ -1\}/);
  assert.match(factory, /\/api\/factory\/desk/);
  assert.match(css, /\.factory-lanes/);
  assert.match(css, /#page-factory/);
  assert.match(css, /\.factory-card-thumb/);
});
