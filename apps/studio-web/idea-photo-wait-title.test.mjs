import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");

test("listening-for-photos ideas show state beside the title", () => {
  assert.match(app, /Listening for photos/);
  assert.match(app, /photo_wait_status/);
  assert.match(app, /title-cell/);
});
