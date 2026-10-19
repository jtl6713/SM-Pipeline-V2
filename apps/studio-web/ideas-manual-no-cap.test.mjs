import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");

test("manual idea cap responses never expose the internal skip code", () => {
  const formatter = app.slice(
    app.indexOf("function autonomousProduceSkipMessage"),
    app.indexOf("function autonomousProduceStatusMessage"),
  );
  assert.match(formatter, /key === "open_ideas_cap"/);
  assert.match(formatter, /manual runs are not capped/);
});

test("Ideas manual run sends the selected profile to the forced Worker route", () => {
  const runner = app.slice(
    app.indexOf("async function runAutonomousProduceNow"),
    app.indexOf('$("operationsRunAutonomous")?.addEventListener'),
  );
  assert.match(runner, /\/api\/operations\/ideas\/run-autonomous/);
  assert.match(runner, /content_profile_id: String\(\$\("studioProfileSelect"\)\?\.value/);
});
