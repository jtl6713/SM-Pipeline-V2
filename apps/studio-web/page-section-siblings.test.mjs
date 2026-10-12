import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.html"), "utf8");
const app = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "assets/app-item4-1008.js"), "utf8");

test("Studio page sections are siblings under main (profiles closes before operations)", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.658-factory-desk"/);
  const profiles = html.indexOf('id="page-profiles"');
  const operations = html.indexOf('id="page-operations"');
  const factory = html.indexOf('id="page-factory"');
  const support = html.indexOf('id="page-support"');
  assert.ok(profiles > 0 && operations > profiles && factory > operations && support > factory);
  const bridge = html.slice(operations - 80, operations + 40);
  assert.match(bridge, /<\/section>\s*<\/section>\s*<section id="page-operations"/);
  const factoryBridge = html.slice(factory - 80, factory + 40);
  assert.match(factoryBridge, /<\/section>\s*<section id="page-factory"/);
});
