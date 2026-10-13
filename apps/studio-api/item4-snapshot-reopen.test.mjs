import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const start = source.indexOf("async function getItem4WorkspaceStatus(");
const end = source.indexOf("\nasync function ", start + 25);
const handler = source.slice(start,end);
test("Item4 snapshot is authorized, read-only, and bypasses reconciliation", () => {
  assert.ok(start >= 0);
  assert.match(handler, /loadAuthorizedProductionRequest/);
  assert.match(handler, /url\.searchParams\.get\("snapshot"\) === "1"/);
  assert.match(handler, /item4AssetManifest/);
  assert.match(handler, /Studio_Variant_Manifest_JSON|item4VariantManifest/);
  assert.match(handler, /snapshot: true/);
  assert.ok(handler.indexOf('snapshot: true') < handler.indexOf('item4ReconcileMasterAuthority'));
  assert.ok(handler.indexOf('snapshot: true') < handler.indexOf('item4ReconcileVariants'));
});
test("Worker version advances for Chinatown request reopen", () => {
  assert.match(source, /version: "0.10.589-factory-approve-mae"/);
});
