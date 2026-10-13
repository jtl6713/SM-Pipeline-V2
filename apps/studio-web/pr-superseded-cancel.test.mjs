import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

test("Cancelled / superseded Production Requests do not keep Approve enabled", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.674-factory-approve-mae"/);
  assert.match(html, /UI build 0.6.674/);
  assert.match(app, /const cancelled = status === "Cancelled"/);
  assert.match(app, /promote\.textContent = "Cancelled"/);
  assert.match(app, /result\.superseded \|\| result\.promotion_state === "cancelled"/);
  assert.match(app, /Open Pipeline \/ Open Review/);
  assert.match(app, /status: "Cancelled"/);
});
