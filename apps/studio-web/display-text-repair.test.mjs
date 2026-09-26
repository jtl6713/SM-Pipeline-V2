import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");

test("display text repair startup stays inside Studio app closure", () => {
  const functionPos = app.indexOf("function startDisplayTextRepair()");
  const startupPos = app.indexOf("// Display-text normalization must start inside this closure");
  const closurePos = app.lastIndexOf("})();");

  assert.ok(functionPos >= 0, "startDisplayTextRepair should be defined");
  assert.ok(startupPos > functionPos, "startup should occur after the function definition");
  assert.ok(startupPos < closurePos, "startup must execute before the Studio IIFE closes");
  assert.doesNotMatch(
    app.slice(closurePos + 5),
    /startDisplayTextRepair/,
    "no out-of-scope startup reference may remain after the IIFE",
  );
});
